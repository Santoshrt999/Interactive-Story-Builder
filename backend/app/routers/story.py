"""Story lifecycle endpoints: start, stream (SSE), choice, curiosity, end, history."""
from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncIterator

from fastapi import APIRouter, Depends, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.agents.story_agent import (
    StoryComplete,
    active_story_for_child,
    stories_for_child,
    story_agent,
    story_last_activity,
)
from app.core.logging import get_logger
from app.models.db import ChildProfile, async_session_maker
from app.models.schemas import (
    ActiveStory,
    Certificate,
    ChoiceRequest,
    ChoiceResponse,
    CuriosityAnswerRequest,
    CuriosityAnswerResponse,
    EndRequest,
    EndResponse,
    ResumeRequest,
    ResumeResponse,
    StorySummary,
    StoryStartRequest,
    StoryStartResponse,
    VocabularyEntryOut,
)
from app.services.claude_service import split_sentences
from app.services.parent_auth import require_parent
from app.services.redis_service import redis_service

log = get_logger(__name__)

router = APIRouter(prefix="/story", tags=["story"])


@router.post("/start", response_model=StoryStartResponse)
async def start_story(payload: StoryStartRequest) -> StoryStartResponse:
    async with async_session_maker() as db:
        profile = await db.get(ChildProfile, payload.child_id)
        if profile is None:
            raise HTTPException(status_code=404, detail="child profile not found")
        child_name = profile.name
        age = profile.age

    result = await story_agent.setup(
        child_id=payload.child_id,
        child_name=child_name,
        character_name=payload.character_name,
        character_archetype=payload.character_archetype,
        world=payload.world,
        theme=payload.theme,
        age=age,
        bedtime=payload.bedtime,
    )
    return StoryStartResponse(**result)


@router.get("/active/{child_id}", response_model=ActiveStory)
async def active_story(child_id: str) -> ActiveStory:
    story = await active_story_for_child(child_id)
    if story is None:
        raise HTTPException(status_code=404, detail="no unfinished story")
    return ActiveStory(
        story_id=story.id,
        title=story.title,
        chapter_count=len(story.chapters),
        max_chapters=story.max_chapters,
        bedtime=story.bedtime,
        updated_at=story_last_activity(story).isoformat(),
    )


@router.post("/resume", response_model=ResumeResponse)
async def resume_story(payload: ResumeRequest) -> ResumeResponse:
    try:
        result = await story_agent.resume(payload.story_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="story not found")
    except StoryComplete:
        raise HTTPException(status_code=409, detail="story is complete")
    return ResumeResponse(**result)


@router.get("/stream/{session_id}")
async def stream_story(session_id: str) -> EventSourceResponse:
    """SSE stream of the latest not-yet-streamed chapter."""

    async def event_gen() -> AsyncIterator[dict[str, Any]]:
        chapter = await redis_service.take_pending_chapter(session_id)
        if chapter is None:
            yield {"event": "done", "data": json.dumps({})}
            return

        for sentence in split_sentences(chapter.get("chapter_text", "")):
            yield {"event": "sentence", "data": json.dumps({"text": sentence})}
            await asyncio.sleep(0.04)

        meta = {k: v for k, v in chapter.items() if k != "chapter_text"}
        yield {"event": "meta", "data": json.dumps(meta)}
        yield {"event": "done", "data": json.dumps({})}

    return EventSourceResponse(event_gen())


@router.post("/choice", response_model=ChoiceResponse)
async def make_choice(payload: ChoiceRequest) -> ChoiceResponse:
    try:
        await story_agent.record_choice(payload.session_id, payload.choice)
        chapter = await story_agent.chapter(
            session_id=payload.session_id, last_choice=payload.choice
        )
    except KeyError:
        raise HTTPException(status_code=404, detail="unknown session")
    except StoryComplete:
        raise HTTPException(status_code=409, detail="story is complete")
    return ChoiceResponse(
        session_id=payload.session_id, chapter_number=chapter["chapter_number"]
    )


@router.post("/curiosity-answer", response_model=CuriosityAnswerResponse)
async def curiosity_answer(
    payload: CuriosityAnswerRequest,
) -> CuriosityAnswerResponse:
    await story_agent.record_curiosity_answer(payload.session_id, payload.answer)
    return CuriosityAnswerResponse(acknowledged=True)


@router.post("/end", response_model=EndResponse)
async def end_story(payload: EndRequest) -> EndResponse:
    try:
        result = await story_agent.ending(session_id=payload.session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="unknown session")
    return EndResponse(
        story_id=result["story_id"],
        certificate=Certificate(**result["certificate"]),
        vocabulary=[VocabularyEntryOut(**v) for v in result["vocabulary"]],
    )


@router.get(
    "/history/{child_id}",
    response_model=list[StorySummary],
    dependencies=[Depends(require_parent)],
)
async def story_history(child_id: str) -> list[StorySummary]:
    stories = await stories_for_child(child_id)
    return [
        StorySummary(
            id=s.id,
            title=s.title,
            world=s.world,
            theme=s.theme,
            character_name=s.character_name,
            character_archetype=s.character_archetype,
            completed=s.completed,
            created_at=s.created_at.isoformat(),
            duration_seconds=s.duration_seconds,
            chapter_count=len(s.chapters or []),
        )
        for s in stories
    ]
