"""Curiosity agent: generate ONE Socratic question per chapter."""
from __future__ import annotations

from app.core.logging import get_logger
from app.core.prompts import PROMPTS
from app.services.claude_service import claude_service

log = get_logger(__name__)

_CANNED_QUESTIONS: dict[str, list[str]] = {
    "friendship": [
        "Who is someone that makes you feel happy and safe, just like a good friend?",
        "What is the kindest thing a friend has ever done for you?",
    ],
    "courage": [
        "Have you ever felt brave even when your tummy had butterflies?",
        "What is something a little scary that you tried anyway?",
    ],
    "mystery": [
        "What is a question you have always wondered about the world?",
        "If you found a secret door, what do you hope would be behind it?",
    ],
    "adventure": [
        "If you could explore anywhere at all, where would your feet take you?",
        "What does it feel like inside when something exciting is about to happen?",
    ],
}


class CuriosityAgent:
    """Produces a single open-ended reflective question for a chapter."""

    async def ask(
        self, *, chapter_text: str, theme: str, chapter_number: int, age: int
    ) -> str:
        if claude_service.online:
            prompt = (
                f"Child age: {age}. Story theme: {theme}.\n"
                f"Chapter just read:\n{chapter_text}\n\n"
                "Ask your single curiosity question now."
            )
            result = await claude_service.complete(
                prompt, PROMPTS.curiosity_system, max_tokens=120
            )
            if result:
                return result.splitlines()[0].strip()

        pool = _CANNED_QUESTIONS.get(theme, _CANNED_QUESTIONS["adventure"])
        return pool[(chapter_number - 1) % len(pool)]


curiosity_agent = CuriosityAgent()
