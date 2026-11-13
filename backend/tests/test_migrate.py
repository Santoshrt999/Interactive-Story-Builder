"""Startup migration: additive, idempotent, seeds/marks the default profile."""
from __future__ import annotations

import asyncio


def test_fresh_db_seeds_default_shreyanvi(client):
    profiles = client.get("/api/profiles/").json()
    assert [(p["name"], p["is_default"]) for p in profiles] == [("Shreyanvi", True)]


def test_migrate_adds_columns_to_legacy_db(legacy_db_client):
    # legacy_db_client: DB created with the OLD schema (no is_default/bedtime/max_chapters/updated_at)
    # containing profiles "Shreyu"(oldest) and "Shreyanvi".
    profiles = {p["name"]: p for p in legacy_db_client.get("/api/profiles/").json()}
    assert profiles["Shreyanvi"]["is_default"] is True
    assert profiles["Shreyu"]["is_default"] is False


def test_migrate_marks_oldest_default_when_no_shreyanvi(legacy_db_client_no_shreyanvi):
    profiles = legacy_db_client_no_shreyanvi.get("/api/profiles/").json()
    assert profiles[0]["is_default"] is True and sum(p["is_default"] for p in profiles) == 1


def test_migrate_is_idempotent(client):
    from app.models.db import engine
    from app.models.migrate import migrate

    async def run_again() -> None:
        async with engine.begin() as conn:
            await migrate(conn)

    asyncio.run(run_again())  # startup already ran it once; a second run must be a no-op

    profiles = client.get("/api/profiles/").json()
    assert len(profiles) == 1
    assert sum(p["is_default"] for p in profiles) == 1
