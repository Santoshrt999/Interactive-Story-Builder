"""SQLAlchemy async models, engine, sessionmaker and init_db()."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.ext.asyncio import (
    AsyncAttrs,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import JSON

from app.core.config import settings


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Base(AsyncAttrs, DeclarativeBase):
    """Declarative base for all ORM models."""


class ChildProfile(Base):
    __tablename__ = "child_profiles"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String, nullable=False)
    age: Mapped[int] = mapped_column(Integer, nullable=False)
    avatar_id: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    parent_pin_hash: Mapped[str | None] = mapped_column(String, nullable=True)


class Story(Base):
    __tablename__ = "stories"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    child_id: Mapped[str] = mapped_column(
        String, ForeignKey("child_profiles.id"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    world: Mapped[str] = mapped_column(String, nullable=False)
    theme: Mapped[str] = mapped_column(String, nullable=False)
    character_name: Mapped[str] = mapped_column(String, nullable=False)
    character_archetype: Mapped[str] = mapped_column(String, nullable=False)
    chapters: Mapped[list[Any]] = mapped_column(JSON, default=list)
    choices_made: Mapped[list[Any]] = mapped_column(JSON, default=list)
    curiosity_answers: Mapped[list[Any]] = mapped_column(JSON, default=list)
    vocabulary_log: Mapped[list[Any]] = mapped_column(JSON, default=list)
    story_html: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)


class VocabularyEntry(Base):
    __tablename__ = "vocabulary_entries"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    child_id: Mapped[str] = mapped_column(
        String, ForeignKey("child_profiles.id"), nullable=False, index=True
    )
    word: Mapped[str] = mapped_column(String, nullable=False)
    definition: Mapped[str] = mapped_column(Text, nullable=False)
    story_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("stories.id"), nullable=True
    )
    encountered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now
    )


# Engine + session factory ---------------------------------------------------

engine = create_async_engine(settings.database_url, echo=False, future=True)

async_session_maker = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


async def init_db() -> None:
    """Create all tables if they do not yet exist."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_session() -> Any:
    """FastAPI dependency yielding an async session."""
    async with async_session_maker() as session:
        yield session
