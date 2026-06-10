"""Image agent: build a scene prompt and delegate to the image service."""
from __future__ import annotations

from app.core.logging import get_logger
from app.services.image_service import build_prompt, image_service

log = get_logger(__name__)


class ImageAgent:
    """Turns scene metadata into an illustration URL."""

    async def illustrate(
        self,
        *,
        scene_description: str,
        character_name: str,
        character_archetype: str,
        world: str,
        mood: str,
    ) -> str:
        prompt = build_prompt(
            scene_description=scene_description,
            character_name=character_name,
            character_archetype=character_archetype,
            world=world,
            mood=mood,
        )
        return await image_service.generate(
            prompt, world, scene_description=scene_description
        )


image_agent = ImageAgent()
