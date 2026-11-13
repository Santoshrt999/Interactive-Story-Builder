"""Core stateful agentic loop coordinating story generation.

Phases:
  setup()         -> create Story row + session context, generate chapter 1
  chapter()       -> generate the next chapter (used after a choice)
  process_input() -> interpret a child's transcript (choice vs curiosity vs idea)
  ending()        -> conclusion + certificate + vocabulary

Composes claude_service, image_agent, curiosity_agent, vocab_agent,
redis_service and persists to SQLite.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, get_args

from sqlalchemy import func, select

from app.agents.curiosity_agent import curiosity_agent
from app.agents.image_agent import image_agent
from app.agents.vocab_agent import vocab_agent
from app.core.logging import get_logger
from app.models.db import ChildProfile, Story, VocabularyEntry, async_session_maker
from app.models.schemas import Mood
from app.services.claude_service import claude_service
from app.services.redis_service import redis_service

log = get_logger(__name__)

MAX_CHAPTERS = 8
BEDTIME_CHAPTERS = 3


_MOODS = frozenset(get_args(Mood))
_DEFAULT_MOOD = "wonder"


def _text(value: Any, default: str = "") -> str:
    return value if isinstance(value, str) else default


def _text_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if item is not None]


def normalize_chapter_fields(chapter: dict[str, Any], chapter_number: int) -> dict[str, Any]:
    """Coerce a chapter's content fields into what the `Chapter` schema accepts.

    The model's JSON is stored as-is, so a field can be off-enum (`mood`), null
    or the wrong type. Applied both when a chapter is built and when a stored one
    is resumed (rows written earlier may already be bad), so one malformed chapter
    can never make a story unresumable.
    """
    mood = chapter.get("mood")
    return {
        "chapter_title": _text(chapter.get("chapter_title"), f"Chapter {chapter_number}"),
        "chapter_text": _text(chapter.get("chapter_text")),
        "choices": _text_list(chapter.get("choices")),
        "scene_description": _text(chapter.get("scene_description")),
        "mood": mood if isinstance(mood, str) and mood in _MOODS else _DEFAULT_MOOD,
        "new_vocabulary": _text_list(chapter.get("new_vocabulary")),
        "curiosity_question": _text(chapter.get("curiosity_question")),
        "image_url": _text(chapter.get("image_url")),
    }


class StoryComplete(ValueError):
    """Raised when a chapter or choice is requested past the story's last chapter."""


# Words like these in a transcript mean "this is a reflection", not a choice.
_REFLECTION_HINTS = (
    "i feel",
    "i think",
    "i felt",
    "because",
    "makes me",
    "reminds me",
    "i remember",
    "i love",
    "i like",
    "scared",
    "happy",
    "sad",
)


class StoryAgent:
    """Orchestrates the interactive story lifecycle for one session."""

    async def setup(
        self,
        *,
        child_id: str,
        child_name: str,
        character_name: str,
        character_archetype: str,
        world: str,
        theme: str,
        age: int,
        bedtime: bool = False,
    ) -> dict[str, Any]:
        """Create the story + session, generate chapter 1 (stored pending)."""
        session_id = str(uuid.uuid4())
        max_chapters = BEDTIME_CHAPTERS if bedtime else MAX_CHAPTERS
        story_id = str(uuid.uuid4())
        title = self._make_title(character_name, world, theme)

        # Persist a fresh Story row.
        async with async_session_maker() as db:
            story = Story(
                id=story_id,
                child_id=child_id,
                title=title,
                world=world,
                theme=theme,
                character_name=character_name,
                character_archetype=character_archetype,
                chapters=[],
                choices_made=[],
                curiosity_answers=[],
                vocabulary_log=[],
                completed=False,
                duration_seconds=0,
                bedtime=bedtime,
                max_chapters=max_chapters,
            )
            db.add(story)
            await db.commit()

        context: dict[str, Any] = {
            "session_id": session_id,
            "story_id": story_id,
            "child_id": child_id,
            "child_name": child_name,
            "character_name": character_name,
            "character_archetype": character_archetype,
            "world": world,
            "theme": theme,
            "age": age,
            "title": title,
            "bedtime": bedtime,
            "max_chapters": max_chapters,
            "chapters": [],
            "choices": [],
            "curiosity_answers": [],
            "started_at": datetime.now(timezone.utc).isoformat(),
        }
        await redis_service.set(session_id, context)

        chapter = await self._build_chapter(
            context, chapter_number=1, last_choice=None, curiosity_answer=None
        )
        await self._store_chapter(context, chapter)

        return {
            "session_id": session_id,
            "story_id": story_id,
            "title": title,
            "bedtime": bedtime,
            "max_chapters": max_chapters,
        }

    async def resume(self, story_id: str) -> dict[str, Any]:
        """Rebuild a session for an unfinished story, e.g. after a server restart.

        The new session has no `pending_chapter`: every chapter already stored is
        handed back in the return value, so none is streamed a second time.

        Raises KeyError if the story is unknown or has no chapters yet (nothing
        to resume), and StoryComplete if it was already finished.
        """
        async with async_session_maker() as db:
            story = await db.get(Story, story_id)
            profile = await db.get(ChildProfile, story.child_id) if story else None
        if story is None or not story.chapters:
            raise KeyError(f"no resumable story {story_id}")
        if story.completed:
            raise StoryComplete("story is complete")

        max_chapters = int(story.max_chapters)
        chapters: list[dict[str, Any]] = []
        for index, stored in enumerate(story.chapters, start=1):
            number = stored.get("chapter_number")
            if not isinstance(number, int) or isinstance(number, bool):
                number = index
            # Chapters stored before bedtime mode lack is_final.
            is_final = stored.get("is_final")
            if not isinstance(is_final, bool):
                is_final = number >= max_chapters
            chapters.append(
                {
                    "chapter_number": number,
                    "is_final": is_final,
                    **normalize_chapter_fields(stored, number),
                }
            )

        # Time spent so far: first chapter to last activity. The hours or days the
        # story sat unfinished do not count; the clock restarts now.
        active = story_last_activity(story) - as_utc(story.created_at)
        prior_active_seconds = max(0, int(active.total_seconds()))

        session_id = str(uuid.uuid4())
        context: dict[str, Any] = {
            "session_id": session_id,
            "story_id": story.id,
            "child_id": story.child_id,
            "child_name": profile.name if profile else "Explorer",
            "character_name": story.character_name,
            "character_archetype": story.character_archetype,
            "world": story.world,
            "theme": story.theme,
            "age": profile.age if profile else 7,
            "title": story.title,
            "bedtime": bool(story.bedtime),
            "max_chapters": max_chapters,
            "chapters": chapters,
            "choices": list(story.choices_made or []),
            "curiosity_answers": list(story.curiosity_answers or []),
            "started_at": datetime.now(timezone.utc).isoformat(),
            "prior_active_seconds": prior_active_seconds,
        }
        await redis_service.set(session_id, context)

        return {
            "session_id": session_id,
            "story_id": story.id,
            "title": story.title,
            "bedtime": context["bedtime"],
            "max_chapters": max_chapters,
            "setup": {
                "character_name": story.character_name,
                "character_archetype": story.character_archetype,
                "world": story.world,
                "theme": story.theme,
            },
            "chapters": list(chapters),
        }

    async def chapter(
        self,
        *,
        session_id: str,
        last_choice: str | None,
        curiosity_answer: str | None = None,
    ) -> dict[str, Any]:
        """Generate the next chapter, store it pending, return it."""
        context = await redis_service.get(session_id)
        if context is None:
            raise KeyError(f"unknown session {session_id}")

        next_number = len(context.get("chapters", [])) + 1
        if next_number > self._max_chapters(context):
            raise StoryComplete("story is complete")

        chapter = await self._build_chapter(
            context,
            chapter_number=next_number,
            last_choice=last_choice,
            curiosity_answer=curiosity_answer,
        )
        await self._store_chapter(context, chapter)
        return chapter

    async def record_choice(self, session_id: str, choice: str) -> None:
        """Append a choice to the session and to `Story.choices_made`.

        Raises KeyError for an unknown session and StoryComplete once the final
        chapter exists (there is nothing left to choose for).
        """
        context = await redis_service.get(session_id)
        if context is None:
            raise KeyError(f"unknown session {session_id}")
        if len(context.get("chapters", [])) >= self._max_chapters(context):
            raise StoryComplete("story is complete")

        await redis_service.append_choice(session_id, choice)
        await self._mirror_to_story(session_id, column="choices_made", key="choices")

    async def record_curiosity_answer(self, session_id: str, answer: str) -> None:
        """Append a reflection to the session and to `Story.curiosity_answers`.

        An unknown session is ignored (the endpoint acknowledges it regardless).
        """
        context = await redis_service.get(session_id)
        if context is None:
            return
        await redis_service.append_curiosity_answer(session_id, answer)
        await self._mirror_to_story(
            session_id, column="curiosity_answers", key="curiosity_answers"
        )

    async def process_input(self, *, session_id: str, transcript: str) -> dict[str, Any]:
        """Interpret a child's transcript and advance the story accordingly.

        Classifies the transcript as a curiosity reflection (stored, no new
        chapter) or as a choice/new idea (woven into the next chapter).
        """
        context = await redis_service.get(session_id)
        if context is None:
            raise KeyError(f"unknown session {session_id}")

        kind = self._classify(transcript)
        if kind == "reflection":
            await self.record_curiosity_answer(session_id, transcript)
            return {"kind": "reflection", "chapter": None}

        # choice or new idea -> weave into the next chapter
        await self.record_choice(session_id, transcript)
        chapter = await self.chapter(session_id=session_id, last_choice=transcript)
        return {"kind": "choice", "chapter": chapter}

    async def ending(self, *, session_id: str) -> dict[str, Any]:
        """Produce the conclusion: certificate + vocabulary, mark completed."""
        context = await redis_service.get(session_id)
        if context is None:
            raise KeyError(f"unknown session {session_id}")

        story_id = context["story_id"]
        child_id = context["child_id"]
        chapters: list[dict[str, Any]] = context.get("chapters", [])

        # Gather vocabulary from all chapters.
        all_words: list[str] = []
        for ch in chapters:
            all_words.extend(ch.get("new_vocabulary", []))
        vocab = await vocab_agent.define(all_words, age=context.get("age", 7))

        # A resumed session carries the active time from before the restart.
        duration = int(context.get("prior_active_seconds") or 0) + self._elapsed_seconds(
            context.get("started_at")
        )
        achievement = self._achievement(context["theme"], len(chapters))
        certificate = {
            "child_name": context.get("child_name", "Explorer"),
            "character_name": context["character_name"],
            "achievement": achievement,
            "title": context["title"],
        }

        story_html = self._render_html(context, chapters, certificate)

        async with async_session_maker() as db:
            story = await db.get(Story, story_id)
            if story is not None:
                story.chapters = chapters
                story.choices_made = context.get("choices", [])
                story.curiosity_answers = context.get("curiosity_answers", [])
                story.vocabulary_log = vocab
                story.story_html = story_html
                story.completed = True
                story.duration_seconds = duration
                for entry in vocab:
                    db.add(
                        VocabularyEntry(
                            child_id=child_id,
                            word=entry["word"],
                            definition=entry["definition"],
                            story_id=story_id,
                        )
                    )
                await db.commit()

        await redis_service.delete(session_id)

        return {
            "story_id": story_id,
            "certificate": certificate,
            "vocabulary": vocab,
        }

    # --- internals ----------------------------------------------------------

    async def _build_chapter(
        self,
        context: dict[str, Any],
        *,
        chapter_number: int,
        last_choice: str | None,
        curiosity_answer: str | None,
    ) -> dict[str, Any]:
        raw = await claude_service.generate_chapter(
            chapter_number=chapter_number,
            character_name=context["character_name"],
            character_archetype=context["character_archetype"],
            world=context["world"],
            theme=context["theme"],
            age=context.get("age", 7),
            last_choice=last_choice,
            curiosity_answer=curiosity_answer,
            total_chapters=self._max_chapters(context),
            bedtime=bool(context.get("bedtime", False)),
        )
        fields = normalize_chapter_fields(raw, chapter_number)

        choices = fields["choices"]
        while len(choices) < 3:
            choices.append("Keep exploring")
        choices = choices[:3]

        image_url = await image_agent.illustrate(
            scene_description=fields["scene_description"],
            character_name=context["character_name"],
            character_archetype=context["character_archetype"],
            world=context["world"],
            mood=fields["mood"],
        )

        question = await curiosity_agent.ask(
            chapter_text=fields["chapter_text"],
            theme=context["theme"],
            chapter_number=chapter_number,
            age=context.get("age", 7),
        )

        return {
            **fields,
            "chapter_number": chapter_number,
            "is_final": chapter_number >= self._max_chapters(context),
            "choices": choices,
            "curiosity_question": question,
            "image_url": image_url,
        }

    async def _store_chapter(
        self, context: dict[str, Any], chapter: dict[str, Any]
    ) -> None:
        session_id = context["session_id"]
        await redis_service.append_chapter(session_id, chapter)
        # Persist chapters incrementally so history survives mid-story.
        async with async_session_maker() as db:
            story = await db.get(Story, context["story_id"])
            if story is not None:
                updated = await redis_service.get(session_id)
                story.chapters = (updated or {}).get("chapters", [])
                story.updated_at = datetime.now(timezone.utc)
                await db.commit()

    async def _mirror_to_story(self, session_id: str, *, column: str, key: str) -> None:
        """Copy the session's `key` list into the Story `column`."""
        context = await redis_service.get(session_id)
        if context is None:
            return
        async with async_session_maker() as db:
            story = await db.get(Story, context["story_id"])
            if story is not None:
                setattr(story, column, list(context.get(key, [])))
                await db.commit()

    @staticmethod
    def _max_chapters(context: dict[str, Any]) -> int:
        # Sessions created before bedtime mode have no max_chapters key.
        return int(context.get("max_chapters", MAX_CHAPTERS))

    def _classify(self, transcript: str) -> str:
        text = transcript.lower().strip()
        if any(hint in text for hint in _REFLECTION_HINTS):
            return "reflection"
        return "choice"

    def _make_title(self, character_name: str, world: str, theme: str) -> str:
        world_word = {
            "forest": "Woods",
            "ocean": "Deep",
            "space": "Stars",
            "city": "City",
        }.get(world, "World")
        theme_word = theme.capitalize()
        return f"{character_name} and the {theme_word} of the {world_word}"

    def _achievement(self, theme: str, chapter_count: int) -> str:
        base = {
            "friendship": "Master of Friendship",
            "courage": "Champion of Courage",
            "mystery": "Solver of Mysteries",
            "adventure": "Grand Adventurer",
        }.get(theme, "Storyteller")
        return f"{base} — completed a {chapter_count}-chapter journey"

    def _elapsed_seconds(self, started_at: str | None) -> int:
        if not started_at:
            return 0
        try:
            start = datetime.fromisoformat(started_at)
        except ValueError:
            return 0
        delta = datetime.now(timezone.utc) - start
        return max(0, int(delta.total_seconds()))

    def _render_html(
        self,
        context: dict[str, Any],
        chapters: list[dict[str, Any]],
        certificate: dict[str, Any],
    ) -> str:
        parts = [f"<h1>{context['title']}</h1>"]
        for ch in chapters:
            parts.append(f"<h2>{ch.get('chapter_title', '')}</h2>")
            text = (ch.get("chapter_text") or "").replace("\n", "<br/>")
            parts.append(f"<p>{text}</p>")
            img = ch.get("image_url")
            if img:
                parts.append(f'<img src="{img}" alt="scene"/>')
        parts.append(
            f"<footer>Certificate: {certificate['achievement']} for "
            f"{certificate['child_name']}.</footer>"
        )
        return "\n".join(parts)


def as_utc(value: datetime) -> datetime:
    """SQLite hands back naive datetimes even for timezone-aware columns; they are UTC."""
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def story_last_activity(story: Story) -> datetime:
    """`updated_at`, or `created_at` for rows written before `updated_at` existed."""
    return as_utc(story.updated_at or story.created_at)


async def active_story_for_child(child_id: str) -> Story | None:
    """The child's most recently active unfinished story that has a chapter."""
    async with async_session_maker() as db:
        result = await db.execute(
            select(Story)
            .where(Story.child_id == child_id, Story.completed.is_(False))
            .order_by(
                func.coalesce(Story.updated_at, Story.created_at).desc(),
                Story.created_at.desc(),
            )
        )
        # A story whose first chapter never got stored has nothing to resume.
        return next((s for s in result.scalars() if s.chapters), None)


async def stories_for_child(child_id: str) -> list[Story]:
    """Return all stories for a child (newest first)."""
    async with async_session_maker() as db:
        result = await db.execute(
            select(Story)
            .where(Story.child_id == child_id)
            .order_by(Story.created_at.desc())
        )
        return list(result.scalars().all())


story_agent = StoryAgent()
