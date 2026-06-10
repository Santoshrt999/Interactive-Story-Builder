"""StoryWeaver FastAPI application entrypoint."""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.models.db import init_db
from app.routers import dashboard, media, profiles, story
from app.services.redis_service import redis_service

configure_logging()
log = get_logger("app.main")

_STATIC_DIR = Path(__file__).resolve().parents[1] / "static"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    await init_db()
    await redis_service.connect()
    log.info(
        "startup_complete",
        anthropic=settings.has_anthropic,
        replicate=settings.has_replicate,
        elevenlabs=settings.has_elevenlabs,
    )
    yield
    await redis_service.close()


app = FastAPI(title="StoryWeaver", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(_STATIC_DIR)), name="static")

app.include_router(profiles.router, prefix="/api")
app.include_router(story.router, prefix="/api")
app.include_router(media.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
