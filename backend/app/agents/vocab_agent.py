"""Vocab agent: extract 5-10 new words with age-appropriate definitions.

Phase 2-lite: uses Claude when available, otherwise a canned definition bank
keyed by the vocabulary surfaced in chapters.
"""
from __future__ import annotations

import json
from typing import Any

from app.core.logging import get_logger
from app.services.claude_service import claude_service

log = get_logger(__name__)

_VOCAB_SYSTEM = (
    "You are a friendly dictionary for children aged 4-12. Given a list of words "
    "from a story, write a short, warm, age-appropriate definition for each "
    "(one sentence, no hard words). Respond with ONLY a JSON array of objects: "
    '[{"word": "...", "definition": "..."}].'
)

# Fallback definitions covering canned-mode vocabulary plus common extras.
_DEFINITION_BANK: dict[str, str] = {
    "canopy": "the leafy roof made by the tops of tall trees",
    "glade": "a small open space with grass inside a forest",
    "dappled": "covered with small spots of light and shadow",
    "current": "water in the sea that moves in one direction",
    "luminous": "giving off a soft, gentle light",
    "lagoon": "a calm pool of seawater near the shore",
    "orbit": "the curved path one space object travels around another",
    "nebula": "a giant, colorful cloud of dust and gas in space",
    "gravity": "the invisible pull that keeps things from floating away",
    "bustling": "full of busy, happy activity",
    "ingenious": "very clever and full of good ideas",
    "mural": "a big, beautiful painting made on a wall",
}


def _fallback_definition(word: str) -> str:
    return _DEFINITION_BANK.get(
        word.lower(), f"a special word you discovered: {word}"
    )


class VocabAgent:
    """Builds word/definition pairs from a story's surfaced vocabulary."""

    async def define(
        self, words: list[str], age: int
    ) -> list[dict[str, str]]:
        # De-duplicate, preserve order, cap at 10.
        seen: set[str] = set()
        unique: list[str] = []
        for w in words:
            key = w.strip().lower()
            if key and key not in seen:
                seen.add(key)
                unique.append(w.strip())
        unique = unique[:10]
        if not unique:
            return []

        if claude_service.online:
            prompt = f"Child age: {age}. Words: {json.dumps(unique)}."
            raw = await claude_service.complete(prompt, _VOCAB_SYSTEM, max_tokens=600)
            parsed = _parse_array(raw)
            if parsed:
                return parsed

        return [
            {"word": w, "definition": _fallback_definition(w)} for w in unique
        ]


def _parse_array(raw: str) -> list[dict[str, str]]:
    raw = raw.strip()
    start = raw.find("[")
    end = raw.rfind("]")
    if start == -1 or end == -1 or end <= start:
        return []
    try:
        data: Any = json.loads(raw[start : end + 1])
    except json.JSONDecodeError:
        return []
    out: list[dict[str, str]] = []
    if isinstance(data, list):
        for item in data:
            if (
                isinstance(item, dict)
                and "word" in item
                and "definition" in item
            ):
                out.append(
                    {"word": str(item["word"]), "definition": str(item["definition"])}
                )
    return out


vocab_agent = VocabAgent()
