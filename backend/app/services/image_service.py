"""Image generation via Replicate FLUX, with placeholder-SVG fallback.

Guarded by REPLICATE_API_TOKEN. When absent, returns a per-world placeholder
SVG served from /static/images/. Generated images are cached to static/images/
keyed by a hash of the full prompt.
"""
from __future__ import annotations

import asyncio
import hashlib
from pathlib import Path
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger
from app.core.prompts import PROMPTS

log = get_logger(__name__)

# FLUX model on Replicate (Phase 1 wiring; runs only when token present).
_FLUX_MODEL = "black-forest-labs/flux-schnell"

_STATIC_DIR = Path(__file__).resolve().parents[2] / "static" / "images"
_VALID_WORLDS = {"forest", "ocean", "space", "city"}

# Animal keywords (lowercased) that map to a scene SVG suffix per world. The
# order matters only for matching against scene text; first hit wins.
_ANIMAL_SCENES: dict[str, list[str]] = {
    "forest": ["fox", "owl", "rabbit", "deer", "hedgehog"],
    "ocean": ["dolphin", "turtle", "whale", "crab", "seahorse"],
    "space": ["bunny", "robot-dog", "star-fox", "comet-cat"],
    "city": ["cat", "puppy", "pigeon", "mouse"],
}

# Map a matched keyword to its on-disk SVG file suffix.
_SCENE_FILE_KEY: dict[str, str] = {
    "fox": "fox",
    "owl": "owl",
    "rabbit": "rabbit",
    "dolphin": "dolphin",
    "turtle": "turtle",
    "whale": "whale",
    "bunny": "bunny",
    "robot-dog": "robotdog",
    "star-fox": "starfox",
    "comet-cat": "cometcat",
    "cat": "cat",
    "puppy": "puppy",
    "pigeon": "pigeon",
}


def _placeholder_url(world: str) -> str:
    w = world if world in _VALID_WORLDS else "forest"
    return f"/static/images/placeholder_{w}.svg"


def _scene_url(world: str, scene_description: str) -> str:
    """Pick an animal-scene SVG matching the world + animal named in the scene.

    Falls back to the per-world placeholder when no scene file matches.
    """
    w = world if world in _VALID_WORLDS else "forest"
    text = (scene_description or "").lower()
    for keyword in _ANIMAL_SCENES.get(w, []):
        # Match the keyword and a couple of common variants (cat -> comet-cat
        # is avoided because comet-cat is checked under space, not city).
        if keyword in text:
            file_key = _SCENE_FILE_KEY.get(keyword, keyword)
            candidate = _STATIC_DIR / f"scene_{w}_{file_key}.svg"
            if candidate.exists():
                return f"/static/images/scene_{w}_{file_key}.svg"
    return _placeholder_url(w)


def _cache_path(prompt: str) -> Path:
    digest = hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:24]
    return _STATIC_DIR / f"gen_{digest}.webp"


class ImageService:
    """Async image generator with caching and placeholder fallback."""

    @property
    def online(self) -> bool:
        return settings.has_replicate

    async def generate(
        self, prompt: str, world: str, scene_description: str = ""
    ) -> str:
        """Return a URL for an image matching the prompt.

        Online (Replicate set): generate via FLUX. Offline: select an
        animal-scene SVG matching the world + animal named in scene_description,
        falling back to the per-world placeholder SVG.
        """
        if not settings.has_replicate:
            return _scene_url(world, scene_description)

        cache_path = _cache_path(prompt)
        if cache_path.exists():
            return f"/static/images/{cache_path.name}"

        try:
            url = await self._run_replicate(prompt)
            if not url:
                return _scene_url(world, scene_description)
            await self._download(url, cache_path)
            return f"/static/images/{cache_path.name}"
        except Exception as exc:  # noqa: BLE001 - never crash request path
            log.warning("image_generation_failed_fallback", error=str(exc))
            return _scene_url(world, scene_description)

    async def _run_replicate(self, prompt: str) -> str | None:
        """Invoke Replicate FLUX off the event loop; return first image URL."""
        import replicate  # local import; optional path

        def _call() -> Any:
            client = replicate.Client(api_token=settings.replicate_api_token)
            return client.run(
                _FLUX_MODEL,
                input={
                    "prompt": prompt,
                    "negative_prompt": PROMPTS.image_negative,
                    "aspect_ratio": "16:9",
                    "num_outputs": 1,
                    "output_format": "webp",
                },
            )

        result = await asyncio.to_thread(_call)
        if isinstance(result, list) and result:
            first = result[0]
            return str(first)
        if isinstance(result, str):
            return result
        return None

    async def _download(self, url: str, dest: Path) -> None:
        dest.parent.mkdir(parents=True, exist_ok=True)
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            await asyncio.to_thread(dest.write_bytes, resp.content)


def build_prompt(
    *,
    scene_description: str,
    character_name: str,
    character_archetype: str,
    world: str,
    mood: str,
) -> str:
    """Build the FLUX prompt from the canonical template."""
    return PROMPTS.image_template.format(
        scene_description=scene_description,
        character_name=character_name,
        character_archetype=character_archetype,
        story_world=world,
        mood=mood,
    )


image_service = ImageService()
