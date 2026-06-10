"""Child profile endpoints."""
from __future__ import annotations

import bcrypt
from fastapi import APIRouter
from sqlalchemy import select

from app.models.db import ChildProfile, async_session_maker
from app.models.schemas import ChildProfileCreate, ChildProfileOut

router = APIRouter(prefix="/profiles", tags=["profiles"])


def _to_out(p: ChildProfile) -> ChildProfileOut:
    return ChildProfileOut(
        id=p.id,
        name=p.name,
        age=p.age,
        avatar_id=p.avatar_id,
        created_at=p.created_at.isoformat(),
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
