"""Resume unfinished stories across server restarts."""
from __future__ import annotations

import json
import sqlite3
from contextlib import closing

from app.core.config import settings
from app.services.redis_service import redis_service
from conftest import LEGACY_STORY_ID

_BODY = {"character_name": "Luna", "character_archetype": "kind", "world": "forest", "theme": "friendship"}


def _db(sql: str, params: tuple = ()) -> list[tuple]:
    db_path = settings.database_url.split("///", 1)[1]
    with closing(sqlite3.connect(db_path)) as db:
        rows = db.execute(sql, params).fetchall()
        db.commit()
        return rows


def _child_id(client) -> str:
    return client.get("/api/profiles/").json()[0]["id"]


def _start(client, **extra) -> dict:
    response = client.post(
        "/api/story/start", json={"child_id": _child_id(client), **_BODY, **extra}
    )
    assert response.status_code == 200, response.text
    return response.json()


def _stream(client, session_id: str) -> tuple[list[str], dict | None]:
    """SSE events seen on the stream (in order) and the meta payload, if any."""
    body = client.get(f"/api/story/stream/{session_id}").text
    events: list[str] = []
    meta = None
    for line in body.splitlines():
        if line.startswith("event:"):
            events.append(line.split(":", 1)[1].strip())
        elif line.startswith("data:") and events and events[-1] == "meta":
            meta = json.loads(line.split(":", 1)[1])
    return events, meta


def _choose(client, session_id: str, choice: str = "Follow the sparkling trail"):
    return client.post("/api/story/choice", json={"session_id": session_id, "choice": choice})


def _active(client, child_id: str | None = None):
    return client.get(f"/api/story/active/{child_id or _child_id(client)}")


def _resume(client, story_id: str):
    return client.post("/api/story/resume", json={"story_id": story_id})


def _restart_server() -> None:
    """Sessions live in process memory (no Redis in tests): a restart loses them."""
    redis_service._memory.clear()


# --- GET /api/story/active/{child_id} ---------------------------------------------


def test_active_returns_latest_unfinished(client):
    first = _start(client)
    second = _start(client, bedtime=True)

    response = _active(client)
    assert response.status_code == 200
    body = response.json()
    assert body["story_id"] == second["story_id"]
    assert body["title"] == second["title"]
    assert body["chapter_count"] == 1
    assert body["max_chapters"] == 3 and body["bedtime"] is True
    assert isinstance(body["updated_at"], str) and body["updated_at"]

    # Progress on the older story makes it the most recently updated one.
    assert _choose(client, first["session_id"]).status_code == 200
    body = _active(client).json()
    assert body["story_id"] == first["story_id"]
    assert body["chapter_count"] == 2
    assert body["max_chapters"] == 8 and body["bedtime"] is False


def test_active_404_when_none_or_completed(client):
    assert _active(client).status_code == 404  # nothing started yet

    started = _start(client)
    assert _active(client).status_code == 200
    assert client.post("/api/story/end", json={"session_id": started["session_id"]}).status_code == 200
    assert _active(client).status_code == 404  # completed stories are not resumable

    assert _active(client, "no-such-child").status_code == 404


def test_active_ignores_story_without_chapters(client):
    story_id = _start(client)["story_id"]
    _db("UPDATE stories SET chapters = '[]' WHERE id = ?", (story_id,))
    assert _active(client).status_code == 404


# --- POST /api/story/resume -------------------------------------------------------


def test_resume_after_restart_continues_story(client):
    started = _start(client)
    old_session = started["session_id"]
    _stream(client, old_session)
    assert _choose(client, old_session).status_code == 200
    _stream(client, old_session)

    _restart_server()
    assert _choose(client, old_session).status_code == 404  # the old session is gone

    response = _resume(client, started["story_id"])
    assert response.status_code == 200, response.text
    resumed = response.json()
    session = resumed["session_id"]
    assert session != old_session
    assert resumed["story_id"] == started["story_id"]
    assert resumed["title"] == started["title"]
    assert resumed["bedtime"] is False and resumed["max_chapters"] == 8
    assert resumed["setup"] == _BODY
    assert [c["chapter_number"] for c in resumed["chapters"]] == [1, 2]
    assert all(c["chapter_text"] and "is_final" in c for c in resumed["chapters"])

    # Continue on the new session: chapter 3 streams, and so on to the ending.
    choice = _choose(client, session, "Cross the wobbly bridge")
    assert choice.status_code == 200 and choice.json()["chapter_number"] == 3
    events, meta = _stream(client, session)
    assert events[-1] == "done" and "sentence" in events
    assert meta["chapter_number"] == 3 and meta["is_final"] is False

    for number in range(4, 9):
        assert _choose(client, session).json()["chapter_number"] == number
        _, meta = _stream(client, session)
    assert meta["chapter_number"] == 8 and meta["is_final"] is True
    assert _choose(client, session).status_code == 409

    ended = client.post("/api/story/end", json={"session_id": session})
    assert ended.status_code == 200, ended.text
    assert ended.json()["story_id"] == started["story_id"]

    completed, choices, duration = _db(
        "SELECT completed, choices_made, duration_seconds FROM stories"
    )[0]
    assert completed == 1
    # 1 choice before the restart + 6 after, with no duplicates or gaps.
    assert len(json.loads(choices)) == 7
    assert duration >= 0
    assert len(json.loads(_db("SELECT chapters FROM stories")[0][0])) == 8
    assert _active(client).status_code == 404
    assert _resume(client, started["story_id"]).status_code == 409


def test_resume_includes_unstreamed_chapter_once(client):
    started = _start(client)
    _stream(client, started["session_id"])
    assert _choose(client, started["session_id"]).status_code == 200  # chapter 2: generated, NOT streamed

    resumed = _resume(client, started["story_id"]).json()
    assert [c["chapter_number"] for c in resumed["chapters"]] == [1, 2]

    # Nothing is pending on the new session, so the stream has nothing to replay.
    events, meta = _stream(client, resumed["session_id"])
    assert events == ["done"] and meta is None


def test_resume_final_chapter_flags_is_final(client):
    started = _start(client, bedtime=True)
    session = started["session_id"]
    for _ in range(2):
        assert _choose(client, session).status_code == 200  # chapters 2 and 3, bedtime = 3

    resumed = _resume(client, started["story_id"])
    assert resumed.status_code == 200
    body = resumed.json()
    assert body["bedtime"] is True and body["max_chapters"] == 3
    assert [c["is_final"] for c in body["chapters"]] == [False, False, True]

    # Final chapter is already there: no more choices, but the story can be ended.
    assert _choose(client, body["session_id"]).status_code == 409
    assert client.post("/api/story/end", json={"session_id": body["session_id"]}).status_code == 200


def test_resume_unknown_story_404_and_completed_409(client):
    unknown = _resume(client, "no-such-story")
    assert unknown.status_code == 404 and unknown.json()["detail"] == "story not found"

    started = _start(client)
    client.post("/api/story/end", json={"session_id": started["session_id"]})
    completed = _resume(client, started["story_id"])
    assert completed.status_code == 409 and completed.json()["detail"] == "story is complete"


def test_resume_story_without_chapters_is_404(client):
    story_id = _start(client)["story_id"]
    _db("UPDATE stories SET chapters = '[]' WHERE id = ?", (story_id,))
    assert _resume(client, story_id).status_code == 404


def test_active_and_resume_need_no_parent_pin(client, parent_token):
    # A PIN exists and nobody is unlocked (no X-Parent-Token header sent).
    started = _start(client)
    assert _active(client).status_code == 200
    assert _resume(client, started["story_id"]).status_code == 200


# --- stories written before this feature (legacy schema) --------------------------


def test_legacy_story_is_active_and_resumable(legacy_db_client_with_story):
    client = legacy_db_client_with_story
    child_id = _child_id(client)

    active = _active(client, child_id)
    assert active.status_code == 200, active.text
    body = active.json()
    assert body["story_id"] == LEGACY_STORY_ID
    assert body["chapter_count"] == 2
    assert body["bedtime"] is False and body["max_chapters"] == 8
    # updated_at is NULL on the legacy row: falls back to created_at, never null.
    assert body["updated_at"].startswith("2026-01-03T09:30:00")

    response = _resume(client, LEGACY_STORY_ID)
    assert response.status_code == 200, response.text
    resumed = response.json()
    assert resumed["story_id"] == LEGACY_STORY_ID
    assert resumed["bedtime"] is False and resumed["max_chapters"] == 8
    assert [c["chapter_number"] for c in resumed["chapters"]] == [1, 2]
    assert [c["is_final"] for c in resumed["chapters"]] == [False, False]
    assert resumed["chapters"][1]["chapter_text"] == "Legacy text for chapter 2."

    # And the story carries on from where it was.
    assert _choose(client, resumed["session_id"]).json()["chapter_number"] == 3


def test_legacy_story_orders_by_created_at_when_updated_at_is_null(legacy_db_client_with_story):
    client = legacy_db_client_with_story
    child_id = _child_id(client)
    # A newer story (updated_at set) beats the legacy one; the legacy one's
    # created_at (Jan 2026) is older than anything created now.
    newer = client.post(
        "/api/story/start", json={"child_id": child_id, **_BODY}
    ).json()
    assert _active(client, child_id).json()["story_id"] == newer["story_id"]

    # Make the newer story look older than the legacy row's created_at: ordering
    # must use COALESCE(updated_at, created_at), not updated_at alone (NULLs sort last).
    _db("UPDATE stories SET updated_at = '2025-01-01 00:00:00.000000' WHERE id = ?", (newer["story_id"],))
    assert _active(client, child_id).json()["story_id"] == LEGACY_STORY_ID


def test_resume_computes_is_final_for_chapters_stored_without_it(legacy_db_client_with_story):
    client = legacy_db_client_with_story
    # Chapter dicts lack is_final; the row says the story ends at chapter 2.
    _db("UPDATE stories SET max_chapters = 2 WHERE id = ?", (LEGACY_STORY_ID,))
    resumed = _resume(client, LEGACY_STORY_ID).json()
    assert [c["is_final"] for c in resumed["chapters"]] == [False, True]
    assert _choose(client, resumed["session_id"]).status_code == 409
