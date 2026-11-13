"""Backend test harness.

`settings` and `engine` are module-level singletons, so the environment has to
point at a throwaway SQLite file and an unreachable Redis (which forces the
in-process session fallback) BEFORE `app` is imported. That is why the env is
set at the very top of this module, ahead of every `app.*` import. Nothing in
here may ever touch the developer's real `backend/storyweaver.db`.

Per test, `_reset_state()` wipes everything the app persists, *before* the
`TestClient` is entered, so the lifespan's `init_db()` / `migrate()` always run
against a clean database exactly like a first launch.
"""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import sqlite3
import tempfile
from collections.abc import Iterator
from contextlib import closing, contextmanager
from datetime import datetime, timedelta
from pathlib import Path

import pytest

_TMP_DIR = Path(tempfile.mkdtemp(prefix="storyweaver-tests-"))
_DB_PATH = _TMP_DIR / "test.db"

os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_DB_PATH}"
os.environ["REDIS_URL"] = "redis://127.0.0.1:1"  # nothing listens => memory fallback

from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.main import app  # noqa: E402
from app.models.db import engine  # noqa: E402
from app.routers import parent as parent_router  # noqa: E402
from app.services.parent_auth import parent_auth  # noqa: E402
from app.services.redis_service import redis_service  # noqa: E402

# Cheap bcrypt for tests (production uses cost 12, ~0.25 s per hash/check, which
# adds up over the many unlocks the parent-lock tests make). `checkpw` reads the
# cost from the stored hash, so this only affects newly hashed PINs.
parent_router.BCRYPT_ROUNDS = 4

# Safety net: if the env override ever stops taking effect, fail loudly instead
# of letting the suite drop tables in the real database.
assert settings.database_url.endswith(str(_DB_PATH)), settings.database_url


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    shutil.rmtree(_TMP_DIR, ignore_errors=True)


# --- state reset --------------------------------------------------------------


def _reset_state() -> None:
    """Return every piece of persisted app state to "never launched"."""
    redis_service._memory.clear()
    # In-memory parent lock: tokens, failed-attempt counter, cool-down, challenges.
    parent_auth.clear()
    with closing(sqlite3.connect(_DB_PATH)) as db:
        tables = [
            row[0]
            for row in db.execute(
                "SELECT name FROM sqlite_master "
                "WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
            )
        ]
        # Dropping (not just emptying) the tables also discards any schema a
        # previous legacy-DB test left behind; startup recreates them.
        for table in tables:
            db.execute(f'DROP TABLE IF EXISTS "{table}"')
        db.commit()


@contextmanager
def _running_app() -> Iterator[TestClient]:
    """Enter the app lifespan (init_db + migrate) and tear the engine down."""
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        # Each TestClient owns its own event loop; don't carry pooled
        # connections from one loop into the next test.
        asyncio.run(engine.dispose())


# --- legacy (pre-migration) schema ---------------------------------------------
# Copied verbatim from the `child_profiles` / `stories` tables the original
# models (`git show a817d98:backend/app/models/db.py`) produced. These lack
# is_default / bedtime / max_chapters / updated_at on purpose.

_LEGACY_SCHEMA = """
CREATE TABLE child_profiles (
    id VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    age INTEGER NOT NULL,
    avatar_id VARCHAR NOT NULL,
    created_at DATETIME NOT NULL,
    parent_pin_hash VARCHAR,
    PRIMARY KEY (id)
);
CREATE TABLE stories (
    id VARCHAR NOT NULL,
    child_id VARCHAR NOT NULL,
    title VARCHAR NOT NULL,
    world VARCHAR NOT NULL,
    theme VARCHAR NOT NULL,
    character_name VARCHAR NOT NULL,
    character_archetype VARCHAR NOT NULL,
    chapters JSON NOT NULL,
    choices_made JSON NOT NULL,
    curiosity_answers JSON NOT NULL,
    vocabulary_log JSON NOT NULL,
    story_html TEXT,
    completed BOOLEAN NOT NULL,
    created_at DATETIME NOT NULL,
    duration_seconds INTEGER NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(child_id) REFERENCES child_profiles (id)
);
CREATE INDEX ix_stories_child_id ON stories (child_id);
"""


def _seed_legacy_db(names: list[str]) -> None:
    """Create the legacy tables and insert `names` oldest-first."""
    _reset_state()
    base = datetime(2026, 1, 1, 12, 0, 0)
    with closing(sqlite3.connect(_DB_PATH)) as db:
        db.executescript(_LEGACY_SCHEMA)
        for i, name in enumerate(names):
            created_at = (base + timedelta(days=i)).strftime("%Y-%m-%d %H:%M:%S.%f")
            db.execute(
                "INSERT INTO child_profiles (id, name, age, avatar_id, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (f"legacy-{i}", name, 6, "fox", created_at),
            )
        db.commit()


# A story written by the pre-bedtime code: no is_final on its chapters, and the
# row has no bedtime / max_chapters / updated_at (the migration adds those).
LEGACY_STORY_ID = "legacy-story-1"
LEGACY_STORY_CREATED_AT = "2026-01-03 09:30:00.000000"


def _legacy_chapter(number: int) -> dict:
    return {
        "chapter_number": number,
        "chapter_title": f"Legacy chapter {number}",
        "chapter_text": f"Legacy text for chapter {number}.",
        "choices": ["Go left", "Go right", "Keep exploring"],
        "scene_description": "A quiet glade.",
        "mood": "wonder",
        "new_vocabulary": ["glade"],
        "curiosity_question": "What do you see?",
        "image_url": "",
    }


def _seed_legacy_story(child_id: str, *, chapters: int) -> None:
    with closing(sqlite3.connect(_DB_PATH)) as db:
        db.execute(
            "INSERT INTO stories (id, child_id, title, world, theme, character_name, "
            "character_archetype, chapters, choices_made, curiosity_answers, "
            "vocabulary_log, completed, created_at, duration_seconds) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                LEGACY_STORY_ID,
                child_id,
                "Luna and the Friendship of the Woods",
                "forest",
                "friendship",
                "Luna",
                "kind",
                json.dumps([_legacy_chapter(n) for n in range(1, chapters + 1)]),
                json.dumps(["Go left"] * (chapters - 1)),
                json.dumps([]),
                json.dumps([]),
                0,
                LEGACY_STORY_CREATED_AT,
                0,
            ),
        )
        db.commit()


# --- fixtures -------------------------------------------------------------------


@pytest.fixture
def client() -> Iterator[TestClient]:
    """App on a fresh empty database (first launch)."""
    _reset_state()
    with _running_app() as test_client:
        yield test_client


@pytest.fixture
def parent_token(client: TestClient) -> str:
    """Household PIN set to "1234" and unlocked; returns the live X-Parent-Token."""
    assert client.post("/api/parent/pin", json={"pin": "1234"}).status_code == 204
    response = client.post("/api/parent/unlock", json={"pin": "1234"})
    assert response.status_code == 200
    return response.json()["token"]


@pytest.fixture
def legacy_db_client() -> Iterator[TestClient]:
    """App started on an OLD-schema DB holding "Shreyu" (oldest) and "Shreyanvi"."""
    _seed_legacy_db(["Shreyu", "Shreyanvi"])
    with _running_app() as test_client:
        yield test_client


@pytest.fixture
def legacy_db_client_no_shreyanvi() -> Iterator[TestClient]:
    """App started on an OLD-schema DB holding "Shreyu" (oldest) and "Maya"."""
    _seed_legacy_db(["Shreyu", "Maya"])
    with _running_app() as test_client:
        yield test_client


@pytest.fixture
def legacy_db_client_with_story() -> Iterator[TestClient]:
    """App started on an OLD-schema DB with "Shreyanvi" and one unfinished 2-chapter story."""
    _seed_legacy_db(["Shreyanvi"])
    _seed_legacy_story("legacy-0", chapters=2)
    with _running_app() as test_client:
        yield test_client
