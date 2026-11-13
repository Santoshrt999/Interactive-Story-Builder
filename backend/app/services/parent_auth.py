"""In-memory parent unlock state: sliding tokens, PIN cool-down, reset challenges.

Everything here lives in server memory on purpose: a restart (or `clear()`)
locks the parent area again. The PIN *hash* is persistent and lives in the
`household_settings` row; this module never touches the database.

Every method is synchronous and runs on the event loop without awaiting, so
each one is atomic with respect to concurrent requests and needs no lock.
"""
from __future__ import annotations

import math
import secrets
from collections.abc import Callable
from datetime import datetime, timedelta, timezone

from fastapi import Header, HTTPException

TOKEN_TTL = timedelta(seconds=600)  # sliding: every successful use pushes it out again
MAX_FAILURES = 5  # consecutive wrong PINs before the cool-down starts
COOLDOWN = timedelta(seconds=60)
CHALLENGE_TTL = timedelta(minutes=5)
MAX_CHALLENGES = 100  # unauthenticated callers can mint these, so keep the dict bounded

LOCKED_DETAIL = "parent lock"  # the frontend keys off this exact string


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ParentAuth:
    def __init__(self, now: Callable[[], datetime] = _utc_now) -> None:
        # Public and reassignable so tests can drive time.
        self.now = now
        self._tokens: dict[str, datetime] = {}  # token -> expires_at
        self._failures = 0
        self._locked_until: datetime | None = None
        # challenge_id -> (answer, expires_at); insertion order == age order
        self._challenges: dict[str, tuple[int, datetime]] = {}

    # --- tokens ---------------------------------------------------------------

    def issue(self) -> tuple[str, datetime]:
        """Mint a token valid for `TOKEN_TTL`; returns it with its expiry."""
        now = self.now()
        self._prune_tokens(now)
        token = secrets.token_urlsafe(32)
        expires_at = now + TOKEN_TTL
        self._tokens[token] = expires_at
        return token, expires_at

    def verify(self, token: str) -> bool:
        """True if `token` is live; a live token's expiry slides to now + TTL."""
        now = self.now()
        expires_at = self._tokens.get(token)
        if expires_at is None:
            return False
        if expires_at <= now:
            del self._tokens[token]
            return False
        self._tokens[token] = now + TOKEN_TTL
        return True

    def revoke(self, token: str) -> None:
        self._tokens.pop(token, None)

    def clear(self) -> None:
        """Forget all tokens, failed attempts, the cool-down and open challenges."""
        self._tokens.clear()
        self._failures = 0
        self._locked_until = None
        self._challenges.clear()

    def _prune_tokens(self, now: datetime) -> None:
        for token in [t for t, exp in self._tokens.items() if exp <= now]:
            del self._tokens[token]

    # --- wrong-PIN cool-down ----------------------------------------------------

    def register_failure(self) -> None:
        """Count a wrong PIN; the 5th in a row starts the cool-down.

        The counter restarts when the cool-down starts, so once it ends the
        parent gets a fresh run of five.
        """
        self._failures += 1
        if self._failures >= MAX_FAILURES:
            self._failures = 0
            self._locked_until = self.now() + COOLDOWN

    def register_success(self) -> None:
        self._failures = 0
        self._locked_until = None

    def locked_until(self) -> datetime | None:
        """When the cool-down ends, or None if unlock attempts are allowed."""
        if self._locked_until is not None and self._locked_until <= self.now():
            self._locked_until = None
        return self._locked_until

    def retry_after_seconds(self) -> int:
        """Whole seconds left in the cool-down (rounded up; 0 if none)."""
        until = self.locked_until()
        if until is None:
            return 0
        return max(1, math.ceil((until - self.now()).total_seconds()))

    # --- forgot-PIN challenge -----------------------------------------------------

    def new_challenge(self) -> tuple[str, str]:
        """A fresh two-digit x one-digit multiplication: (challenge_id, "23 × 7")."""
        now = self.now()
        for cid in [c for c, (_, exp) in self._challenges.items() if exp <= now]:
            del self._challenges[cid]
        while len(self._challenges) >= MAX_CHALLENGES:
            del self._challenges[next(iter(self._challenges))]  # evict the oldest
        a = 10 + secrets.randbelow(90)  # 10..99
        b = 2 + secrets.randbelow(8)  # 2..9
        challenge_id = secrets.token_urlsafe(16)
        self._challenges[challenge_id] = (a * b, now + CHALLENGE_TTL)
        return challenge_id, f"{a} × {b}"

    def check_challenge(self, challenge_id: str, answer: int) -> bool:
        """Single use: any attempt, right or wrong, consumes the challenge."""
        entry = self._challenges.pop(challenge_id, None)
        if entry is None:
            return False
        expected, expires_at = entry
        return expires_at > self.now() and answer == expected


parent_auth = ParentAuth()


async def require_parent(x_parent_token: str | None = Header(default=None)) -> None:
    """FastAPI dependency: 401 "parent lock" unless a live X-Parent-Token is sent."""
    if not x_parent_token or not parent_auth.verify(x_parent_token):
        raise HTTPException(status_code=401, detail=LOCKED_DETAIL)
