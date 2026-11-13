"""Additive, idempotent schema migration run at every startup.

`Base.metadata.create_all` only creates *missing tables*; it never adds columns
to tables that already exist. Existing installs (and their data) therefore need
the new columns added in place. Every step here is safe to repeat: columns are
only added when `PRAGMA table_info` says they are absent, and the default
profile is only seeded or marked when none exists.

This module deliberately imports nothing from `app.models.db` (which imports
it), so the new-column DDL below is the migration's own source of truth.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, bindparam, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncConnection

DEFAULT_PROFILE_NAME = "Shreyanvi"
DEFAULT_PROFILE_AGE = 7
DEFAULT_PROFILE_AVATAR = "unicorn"

# table -> [(column, column definition for ALTER TABLE ... ADD COLUMN)]
_NEW_COLUMNS: dict[str, list[tuple[str, str]]] = {
    "child_profiles": [
        ("is_default", "INTEGER NOT NULL DEFAULT 0"),
    ],
    "stories": [
        ("bedtime", "INTEGER NOT NULL DEFAULT 0"),
        ("max_chapters", "INTEGER NOT NULL DEFAULT 8"),
        ("updated_at", "DATETIME"),
    ],
}

# Seed only if the table is empty. One statement, so it is atomic even if two
# server workers start at the same moment.
_SEED_DEFAULT_PROFILE = text(
    """
    INSERT INTO child_profiles (id, name, age, avatar_id, created_at, is_default)
    SELECT :id, :name, :age, :avatar_id, :created_at, 1
    WHERE NOT EXISTS (SELECT 1 FROM child_profiles)
    """
).bindparams(bindparam("created_at", type_=DateTime(timezone=True)))

# Mark one existing profile as the default only if none is marked yet:
# "Shreyanvi" (case-insensitive) wins, otherwise the oldest profile; ties on
# either rule go to the oldest.
_MARK_DEFAULT_PROFILE = text(
    """
    UPDATE child_profiles SET is_default = 1
    WHERE id = (
        SELECT id FROM child_profiles
        ORDER BY (lower(name) = lower(:default_name)) DESC, created_at ASC, rowid ASC
        LIMIT 1
    )
    AND NOT EXISTS (SELECT 1 FROM child_profiles WHERE is_default = 1)
    """
)


def _add_missing_columns(conn: Connection) -> None:
    for table, columns in _NEW_COLUMNS.items():
        existing = {row[1] for row in conn.execute(text(f"PRAGMA table_info({table})"))}
        if not existing:  # table absent; create_all owns creating it
            continue
        for name, definition in columns:
            if name not in existing:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {definition}"))


async def migrate(conn: AsyncConnection) -> None:
    """Bring an existing database up to the current schema and data invariants."""
    await conn.run_sync(_add_missing_columns)
    await conn.execute(
        _SEED_DEFAULT_PROFILE,
        {
            "id": str(uuid.uuid4()),
            "name": DEFAULT_PROFILE_NAME,
            "age": DEFAULT_PROFILE_AGE,
            "avatar_id": DEFAULT_PROFILE_AVATAR,
            "created_at": datetime.now(timezone.utc),
        },
    )
    await conn.execute(_MARK_DEFAULT_PROFILE, {"default_name": DEFAULT_PROFILE_NAME})
