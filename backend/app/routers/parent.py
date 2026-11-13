"""Household parent lock: one 4-digit PIN, server-side sliding unlock tokens."""
from __future__ import annotations

import bcrypt
from fastapi import APIRouter, Depends, Header, HTTPException, Response
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.models.db import HouseholdSettings, async_session_maker
from app.models.schemas import (
    ChangePinIn,
    ParentStatus,
    PinIn,
    ResetChallengeOut,
    ResetIn,
    UnlockOut,
)
from app.services.parent_auth import parent_auth, require_parent

router = APIRouter(prefix="/parent", tags=["parent"])

_HOUSEHOLD_ID = 1
BCRYPT_ROUNDS = 12  # the cost is stored in the hash, so lowering it later never breaks old PINs


def _hash_pin(pin: str) -> str:
    return bcrypt.hashpw(pin.encode("utf-8"), bcrypt.gensalt(BCRYPT_ROUNDS)).decode("utf-8")


async def _load_pin_hash() -> str | None:
    async with async_session_maker() as db:
        return (
            await db.execute(
                select(HouseholdSettings.parent_pin_hash).where(
                    HouseholdSettings.id == _HOUSEHOLD_ID
                )
            )
        ).scalar_one_or_none()


async def _store_pin_hash(pin_hash: str, *, only_if_unset: bool) -> bool:
    """Upsert the household row's hash; False if `only_if_unset` and one exists.

    A single statement, so two simultaneous first-time `POST /pin` calls cannot
    both win.
    """
    stmt = sqlite_insert(HouseholdSettings).values(
        id=_HOUSEHOLD_ID, parent_pin_hash=pin_hash
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=[HouseholdSettings.id],
        set_={"parent_pin_hash": stmt.excluded.parent_pin_hash},
        where=HouseholdSettings.parent_pin_hash.is_(None) if only_if_unset else None,
    )
    async with async_session_maker() as db:
        result = await db.execute(stmt)
        await db.commit()
        return result.rowcount > 0


@router.get("/status", response_model=ParentStatus)
async def status() -> ParentStatus:
    return ParentStatus(pin_set=await _load_pin_hash() is not None)


@router.post("/pin", status_code=204)
async def set_pin(payload: PinIn) -> Response:
    if not await _store_pin_hash(_hash_pin(payload.pin), only_if_unset=True):
        raise HTTPException(status_code=409, detail="pin already set")
    return Response(status_code=204)


@router.post("/unlock", response_model=UnlockOut)
async def unlock(payload: PinIn) -> UnlockOut | JSONResponse:
    pin_hash = await _load_pin_hash()
    # Everything below is synchronous (no await), so the cool-down check, the
    # PIN check and the failure count are atomic across concurrent requests.
    # (bcrypt blocks the loop for ~0.2 s; that is what makes it atomic, and is
    # fine for a one-household app.)
    retry_after = parent_auth.retry_after_seconds()
    if retry_after:
        return JSONResponse(
            status_code=429,
            content={"detail": "too many attempts", "retry_after": retry_after},
            headers={"Retry-After": str(retry_after)},
        )
    if pin_hash is None or not bcrypt.checkpw(
        payload.pin.encode("utf-8"), pin_hash.encode("utf-8")
    ):
        parent_auth.register_failure()
        raise HTTPException(status_code=401, detail="wrong pin")
    parent_auth.register_success()
    token, expires_at = parent_auth.issue()
    return UnlockOut(token=token, expires_at=expires_at.isoformat())


@router.post("/lock", status_code=204)
async def lock(x_parent_token: str | None = Header(default=None)) -> Response:
    """Idempotent: locking an already-locked (or unknown) session is not an error."""
    if x_parent_token:
        parent_auth.revoke(x_parent_token)
    return Response(status_code=204)


@router.get("/reset-challenge", response_model=ResetChallengeOut)
async def reset_challenge() -> ResetChallengeOut:
    challenge_id, question = parent_auth.new_challenge()
    return ResetChallengeOut(challenge_id=challenge_id, question=question)


@router.post("/reset", status_code=204)
async def reset_pin(payload: ResetIn) -> Response:
    if not parent_auth.check_challenge(payload.challenge_id, payload.answer):
        raise HTTPException(status_code=403, detail="wrong answer")
    await _store_pin_hash(_hash_pin(payload.new_pin), only_if_unset=False)
    parent_auth.register_success()  # the new PIN must not be stuck behind an old cool-down
    return Response(status_code=204)


@router.post("/change-pin", status_code=204, dependencies=[Depends(require_parent)])
async def change_pin(payload: ChangePinIn) -> Response:
    await _store_pin_hash(_hash_pin(payload.new_pin), only_if_unset=False)
    return Response(status_code=204)
