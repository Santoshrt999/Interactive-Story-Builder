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
from typing import Any

from sqlalchemy import select

from app.agents.curiosity_agent import curiosity_agent
from app.agents.image_agent import image_agent
from app.agents.vocab_agent import vocab_agent
from app.core.logging import get_logger
from app.models.db import Story, VocabularyEntry, async_session_maker
from app.services.claude_service import claude_service
from app.services.redis_service import redis_service

log = get_logger(__name__)

MAX_CHAPTERS = 8

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
    ) -> dict[str, Any]:
        """Create the story + session, generate chapter 1 (stored pending)."""
        session_id = str(uuid.uuid4())
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

        return {"session_id": session_id, "story_id": story_id, "title": title}

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
        if next_number > MAX_CHAPTERS:
            next_number = MAX_CHAPTERS

        chapter = await self._build_chapter(
            context,
            chapter_number=next_number,
            last_choice=last_choice,
            curiosity_answer=curiosity_answer,
        )
        await self._store_chapter(context, chapter)
        return chapter

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
            await redis_service.append_curiosity_answer(session_id, transcript)
            return {"kind": "reflection", "chapter": None}

        # choice or new idea -> weave into the next chapter
        await redis_service.append_choice(session_id, transcript)
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

        duration = self._elapsed_seconds(context.get("started_at"))
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
        )

        choices = list(raw.get("choices") or [])
        while len(choices) < 3:
            choices.append("Keep exploring")
        choices = choices[:3]

        scene = raw.get("scene_description", "")
        mood = raw.get("mood", "wonder")

        image_url = await image_agent.illustrate(
            scene_description=scene,
            character_name=context["character_name"],
            character_archetype=context["character_archetype"],
            world=context["world"],
            mood=mood,
        )

        question = await curiosity_agent.ask(
            chapter_text=raw.get("chapter_text", ""),
            theme=context["theme"],
            chapter_number=chapter_number,
            age=context.get("age", 7),
        )

        return {
            "chapter_number": chapter_number,
            "chapter_title": raw.get(
                "chapter_title", f"Chapter {chapter_number}"
            ),
            "chapter_text": raw.get("chapter_text", ""),
            "choices": choices,
            "scene_description": scene,
            "mood": mood,
            "new_vocabulary": list(raw.get("new_vocabulary") or []),
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
                await db.commit()

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
