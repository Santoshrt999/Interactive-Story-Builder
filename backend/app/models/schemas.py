"""Pydantic v2 request/response schemas matching the API contract exactly."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Archetype = Literal["brave", "curious", "funny", "kind"]
World = Literal["forest", "ocean", "space", "city"]
Theme = Literal["friendship", "courage", "mystery", "adventure"]
Mood = Literal["wonder", "excitement", "mystery", "joy", "calm"]


# --- Profiles ---------------------------------------------------------------

class ChildProfileCreate(BaseModel):
    name: str
    age: int = Field(ge=4, le=12)
    avatar_id: str
    parent_pin: str | None = None


class ChildProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    age: int
    avatar_id: str
    created_at: str


# --- Chapter ----------------------------------------------------------------

class Chapter(BaseModel):
    chapter_number: int
    chapter_title: str
    chapter_text: str
    choices: list[str]
    scene_description: str
    mood: Mood
    new_vocabulary: list[str]
    curiosity_question: str
    image_url: str


class ChapterMeta(BaseModel):
    """Chapter object WITHOUT chapter_text (used for the SSE meta event)."""

    chapter_number: int
    chapter_title: str
    choices: list[str]
    scene_description: str
    mood: Mood
    new_vocabulary: list[str]
    curiosity_question: str
    image_url: str


# --- Story ------------------------------------------------------------------

class StoryStartRequest(BaseModel):
    child_id: str
    character_name: str
    character_archetype: Archetype
    world: World
    theme: Theme


class StoryStartResponse(BaseModel):
    session_id: str
    story_id: str
    title: str


class ChoiceRequest(BaseModel):
    session_id: str
    choice: str


class ChoiceResponse(BaseModel):
    session_id: str
    chapter_number: int


class CuriosityAnswerRequest(BaseModel):
    session_id: str
    answer: str


class CuriosityAnswerResponse(BaseModel):
    acknowledged: bool = True


class EndRequest(BaseModel):
    session_id: str


class Certificate(BaseModel):
    child_name: str
    character_name: str
    achievement: str
    title: str


class VocabularyEntryOut(BaseModel):
    word: str
    definition: str


class EndResponse(BaseModel):
    story_id: str
    certificate: Certificate
    vocabulary: list[VocabularyEntryOut]


class StorySummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    world: str
    theme: str
    character_name: str
    character_archetype: str
    completed: bool
    created_at: str
    duration_seconds: int
    chapter_count: int


# --- Media ------------------------------------------------------------------

class ImageRequest(BaseModel):
    scene_description: str
    character_name: str
    character_archetype: str
    world: str
    mood: str


class ImageResponse(BaseModel):
    image_url: str


class VoiceRequest(BaseModel):
    text: str


# --- Dashboard --------------------------------------------------------------

class DashboardThemes(BaseModel):
    joy: int = 0
    courage: int = 0
    friendship: int = 0
    mystery: int = 0


class DashboardVocabItem(BaseModel):
    word: str
    definition: str


class DashboardResponse(BaseModel):
    stories_count: int
    titles: list[str]
    total_reading_seconds: int
    vocabulary: list[DashboardVocabItem]
    themes: DashboardThemes
    creativity_score: float
    recent_curiosity_answers: list[str]
