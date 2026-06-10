"""Parent dashboard analytics endpoint."""
from __future__ import annotations

from sqlalchemy import select

from fastapi import APIRouter

from app.models.db import Story, VocabularyEntry, async_session_maker
from app.models.schemas import (
    DashboardResponse,
    DashboardThemes,
    DashboardVocabItem,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/{child_id}", response_model=DashboardResponse)
async def get_dashboard(child_id: str) -> DashboardResponse:
    async with async_session_maker() as db:
        story_rows = (
            await db.execute(select(Story).where(Story.child_id == child_id))
        ).scalars().all()
        vocab_rows = (
            await db.execute(
                select(VocabularyEntry).where(VocabularyEntry.child_id == child_id)
            )
        ).scalars().all()

    titles = [s.title for s in story_rows]
    total_seconds = sum(s.duration_seconds for s in story_rows)

    themes = DashboardThemes()
    for s in story_rows:
        if s.theme == "courage":
            themes.courage += 1
        elif s.theme == "friendship":
            themes.friendship += 1
        elif s.theme == "mystery":
            themes.mystery += 1
        elif s.theme == "adventure":
            # adventure stories contribute to "joy" bucket of the contract
            themes.joy += 1

    vocabulary = [
        DashboardVocabItem(word=v.word, definition=v.definition) for v in vocab_rows
    ]

    # Creativity score: blend of distinct choices made and curiosity answers,
    # normalized to 0-100.
    total_choices = sum(len(s.choices_made or []) for s in story_rows)
    total_curiosity = sum(len(s.curiosity_answers or []) for s in story_rows)
    raw = total_choices * 2 + total_curiosity * 3
    creativity_score = round(min(100.0, raw * 5.0), 1)

    recent_curiosity: list[str] = []
    for s in sorted(story_rows, key=lambda x: x.created_at, reverse=True):
        for ans in reversed(s.curiosity_answers or []):
            recent_curiosity.append(ans)
            if len(recent_curiosity) >= 10:
                break
        if len(recent_curiosity) >= 10:
            break

    return DashboardResponse(
        stories_count=len(story_rows),
        titles=titles,
        total_reading_seconds=total_seconds,
        vocabulary=vocabulary,
        themes=themes,
        creativity_score=creativity_score,
        recent_curiosity_answers=recent_curiosity,
    )
