"""ElevenLabs voice synthesis — minimal Phase 2 stub.

With no ELEVENLABS_API_KEY the service returns None so the frontend falls back
to the browser's speechSynthesis. Archetype->voice mapping is defined now for
Phase 2 but synthesis itself remains a thin stub.
"""
from __future__ import annotations

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger(__name__)

# Phase 2: archetype -> ElevenLabs voice id. Placeholder ids for now.
ARCHETYPE_VOICES: dict[str, str] = {
    "brave": "EXAVITQu4vr4xnSDxMaL",  # warm, confident
    "curious": "21m00Tcm4TlvDq8ikWAM",  # bright, inquisitive
    "funny": "AZnzlk1XvdvUeBnXmlld",  # playful
    "kind": "MF3mGyEYCl7XYWbV9V6O",  # gentle
}


class ElevenLabsService:
    """Thin stub. Returns audio bytes only when a key is configured (Phase 2)."""

    @property
    def online(self) -> bool:
        return settings.has_elevenlabs

    async def synthesize(self, text: str, character: str) -> bytes | None:
        """Return MP3 bytes, or None when voice is unavailable (offline).

        Phase 2: real synthesis. For now, returns None even when a key is set
        unless extended, so the frontend uses speechSynthesis.
        """
        if not settings.has_elevenlabs:
            return None
        # Phase 2 implementation hook. Kept as no-op stub for Phase 1.
        log.info("elevenlabs_synthesize_stub", character=character, chars=len(text))
        return None


elevenlabs_service = ElevenLabsService()
