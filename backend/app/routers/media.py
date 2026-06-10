"""Media endpoints: image generation and (Phase 2) voice synthesis."""
from __future__ import annotations

from fastapi import APIRouter, Response

from app.agents.image_agent import image_agent
from app.models.schemas import ImageRequest, ImageResponse, VoiceRequest
from app.services.elevenlabs_service import elevenlabs_service

router = APIRouter(prefix="/media", tags=["media"])


@router.post("/image", response_model=ImageResponse)
async def generate_image(payload: ImageRequest) -> ImageResponse:
    url = await image_agent.illustrate(
        scene_description=payload.scene_description,
        character_name=payload.character_name,
        character_archetype=payload.character_archetype,
        world=payload.world,
        mood=payload.mood,
    )
    return ImageResponse(image_url=url)


@router.post("/voice/{character}")
async def synthesize_voice(character: str, payload: VoiceRequest) -> Response:
    """Phase 2: returns audio/mpeg. When no key, returns 501 (use browser TTS)."""
    audio = await elevenlabs_service.synthesize(payload.text, character)
    if audio is None:
        return Response(
            status_code=501,
            content=b"",
            media_type="audio/mpeg",
        )
    return Response(content=audio, media_type="audio/mpeg")
