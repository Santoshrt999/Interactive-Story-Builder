"""Child profile endpoints."""
from __future__ import annotations

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import delete, select

from app.models.db import ChildProfile, Story, VocabularyEntry, async_session_maker
from app.models.schemas import ChildProfileCreate, ChildProfileOut, ChildProfileUpdate
from app.services.parent_auth import require_parent

router = APIRouter(prefix="/profiles", tags=["profiles"])


def _to_out(p: ChildProfile) -> ChildProfileOut:
    return ChildProfileOut(
        id=p.id,
        name=p.name,
        age=p.age,
        avatar_id=p.avatar_id,
        created_at=p.created_at.isoformat(),
        is_default=p.is_default,
    )


@router.get("/", response_model=list[ChildProfileOut])
async def list_profiles() -> list[ChildProfileOut]:
    async with async_session_maker() as db:
        result = await db.execute(select(ChildProfile).order_by(ChildProfile.created_at))
        return [_to_out(p) for p in result.scalars().all()]


@router.post("/", response_model=ChildProfileOut)
async def create_profile(payload: ChildProfileCreate) -> ChildProfileOut:
    pin_hash: str | None = None
    if payload.parent_pin:
        pin_hash = bcrypt.hashpw(
            payload.parent_pin.encode("utf-8"), bcrypt.gensalt()
        ).decode("utf-8")

    profile = ChildProfile(
        name=payload.name,
        age=payload.age,
        avatar_id=payload.avatar_id,
        parent_pin_hash=pin_hash,
    )
    async with async_session_maker() as db:
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
    return _to_out(profile)


@router.patch(
    "/{profile_id}",
    response_model=ChildProfileOut,
    dependencies=[Depends(require_parent)],
)
async def update_profile(profile_id: str, payload: ChildProfileUpdate) -> ChildProfileOut:
    async with async_session_maker() as db:
        profile = await db.get(ChildProfile, profile_id)
        if profile is None:
            raise HTTPException(status_code=404, detail="profile not found")
        for field, value in payload.model_dump(exclude_none=True).items():
            setattr(profile, field, value)
        await db.commit()
        return _to_out(profile)


@router.delete(
    "/{profile_id}",
    status_code=204,
    dependencies=[Depends(require_parent)],
)
async def delete_profile(profile_id: str) -> Response:
    async with async_session_maker() as db:
        profile = await db.get(ChildProfile, profile_id)
        if profile is None:
            raise HTTPException(status_code=404, detail="profile not found")
        if profile.is_default:
            raise HTTPException(status_code=409, detail="default profile cannot be deleted")
        # One transaction. Vocabulary first: its rows reference the stories.
        await db.execute(delete(VocabularyEntry).where(VocabularyEntry.child_id == profile_id))
        await db.execute(delete(Story).where(Story.child_id == profile_id))
        await db.delete(profile)
        await db.commit()
    return Response(status_code=204)
