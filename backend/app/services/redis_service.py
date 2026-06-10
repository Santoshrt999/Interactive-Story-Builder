"""Async session-context store backed by Redis, with in-process fallback.

Stores per-session story context: character/world/theme info plus the running
list of chapters, choices and curiosity answers, and a "pending" chapter that
the SSE endpoint will stream next.
"""
from __future__ import annotations

import json
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger(__name__)

_SESSION_PREFIX = "storyweaver:session:"
_TTL_SECONDS = 60 * 60 * 6  # 6h


class RedisService:
    """Wrapper exposing async get/set/append helpers for session context."""

    def __init__(self) -> None:
        self._client: Any | None = None
        self._memory: dict[str, dict[str, Any]] = {}
        self._use_memory = False

    async def connect(self) -> None:
        """Attempt to connect to Redis; fall back to in-process dict on failure."""
        try:
            import redis.asyncio as aioredis  # local import; optional path

            client = aioredis.from_url(
                settings.redis_url, encoding="utf-8", decode_responses=True
            )
            await client.ping()
            self._client = client
            self._use_memory = False
            log.info("redis_connected", url=settings.redis_url)
        except Exception as exc:  # noqa: BLE001 - any failure => fallback
            self._client = None
            self._use_memory = True
            log.warning(
                "redis_unavailable_using_memory", error=str(exc), url=settings.redis_url
            )

    async def close(self) -> None:
        if self._client is not None:
            try:
                await self._client.aclose()
            except Exception:  # noqa: BLE001
                pass

    def _key(self, session_id: str) -> str:
        return f"{_SESSION_PREFIX}{session_id}"

    async def get(self, session_id: str) -> dict[str, Any] | None:
        """Return the full session context dict, or None if absent."""
        if self._use_memory or self._client is None:
            return self._memory.get(session_id)
        raw = await self._client.get(self._key(session_id))
        if raw is None:
            return None
        return json.loads(raw)

    async def set(self, session_id: str, context: dict[str, Any]) -> None:
        """Persist the full session context dict."""
        if self._use_memory or self._client is None:
            self._memory[session_id] = context
            return
        await self._client.set(
            self._key(session_id), json.dumps(context), ex=_TTL_SECONDS
        )

    async def append_chapter(
        self, session_id: str, chapter: dict[str, Any]
    ) -> dict[str, Any]:
        """Append a chapter to the session and mark it as the pending stream."""
        ctx = await self.get(session_id) or {}
        ctx.setdefault("chapters", []).append(chapter)
        ctx["pending_chapter"] = chapter
        await self.set(session_id, ctx)
        return ctx

    async def append_choice(self, session_id: str, choice: str) -> None:
        ctx = await self.get(session_id) or {}
        ctx.setdefault("choices", []).append(choice)
        await self.set(session_id, ctx)

    async def append_curiosity_answer(self, session_id: str, answer: str) -> None:
        ctx = await self.get(session_id) or {}
        ctx.setdefault("curiosity_answers", []).append(answer)
        await self.set(session_id, ctx)

    async def take_pending_chapter(self, session_id: str) -> dict[str, Any] | None:
        """Pop the pending (not-yet-streamed) chapter, if any."""
        ctx = await self.get(session_id)
        if not ctx:
            return None
        pending = ctx.pop("pending_chapter", None)
        if pending is not None:
            await self.set(session_id, ctx)
        return pending

    async def delete(self, session_id: str) -> None:
        if self._use_memory or self._client is None:
            self._memory.pop(session_id, None)
            return
        await self._client.delete(self._key(session_id))


redis_service = RedisService()
