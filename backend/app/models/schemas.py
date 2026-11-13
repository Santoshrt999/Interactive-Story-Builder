"""Pydantic v2 request/response schemas matching the API contract exactly."""
from __future__ import annotations

from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

Archetype = Literal["brave", "curious", "funny", "kind"]
World = Literal["forest", "ocean", "space", "city"]
Theme = Literal["friendship", "courage", "mystery", "adventure"]
Mood = Literal["wonder", "excitement", "mystery", "joy", "calm"]


# --- Profiles ---------------------------------------------------------------

PROFILE_NAME_MAX = 30


def _clean_profile_name(value: str) -> str:
    """Trim, then require 1-30 characters (shared by create and update)."""
    value = value.strip()
    if not 1 <= len(value) <= PROFILE_NAME_MAX:
        raise ValueError(f"name must be 1-{PROFILE_NAME_MAX} characters")
    return value


# Defined once so create and update can never disagree on what is valid.
ProfileName = Annotated[str, AfterValidator(_clean_profile_name)]
ProfileAge = Annotated[int, Field(ge=0, le=12)]


class ChildProfileCreate(BaseModel):
    name: ProfileName
    age: ProfileAge
    avatar_id: str
    # Legacy per-profile PIN: accepted and stored but unused (the household PIN
    # in `household_settings` replaced it).
    parent_pin: str | None = None


class ChildProfileUpdate(BaseModel):
    """Partial update: omitted (or null) fields are left unchanged."""

    name: ProfileName | None = None
    age: ProfileAge | None = None
    avatar_id: str | None = None


class ChildProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    age: int
    avatar_id: str
    created_at: str
    is_default: bool


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


# --- Parent lock ------------------------------------------------------------

# ASCII digits only: `\d` would also accept e.g. Arabic-Indic digits.
_PIN_PATTERN = r"^[0-9]{4}$"


class PinIn(BaseModel):
    pin: str = Field(pattern=_PIN_PATTERN)


class ChangePinIn(BaseModel):
    new_pin: str = Field(pattern=_PIN_PATTERN)


class ParentStatus(BaseModel):
    pin_set: bool


class UnlockOut(BaseModel):
    token: str
    expires_at: str


class ResetChallengeOut(BaseModel):
    challenge_id: str
    question: str


class ResetIn(BaseModel):
    challenge_id: str
    answer: int
    new_pin: str = Field(pattern=_PIN_PATTERN)
