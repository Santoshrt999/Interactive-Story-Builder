"""Profile create/edit/delete and the parent lock on parent-only endpoints."""
from __future__ import annotations

import sqlite3
from contextlib import closing

from app.core.config import settings


def _auth(token: str) -> dict[str, str]:
    return {"X-Parent-Token": token}


def _create(client, name: str = "Maya", age: int = 6):
    return client.post(
        "/api/profiles/", json={"name": name, "age": age, "avatar_id": "fox"}
    )


def _default_id(client) -> str:
    return next(p["id"] for p in client.get("/api/profiles/").json() if p["is_default"])


def _db_rows(sql: str, params: tuple = ()) -> list[tuple]:
    db_path = settings.database_url.split("///", 1)[1]
    with closing(sqlite3.connect(db_path)) as db:
        return db.execute(sql, params).fetchall()


# --- guarding PATCH / DELETE -----------------------------------------------------


def test_patch_requires_parent_token(client):
    child = _create(client).json()
    r = client.patch(f"/api/profiles/{child['id']}", json={"name": "Nope"})
    assert r.status_code == 401 and r.json()["detail"] == "parent lock"
    r = client.patch(
        f"/api/profiles/{child['id']}", json={"name": "Nope"}, headers=_auth("bogus")
    )
    assert r.status_code == 401
    assert next(
        p for p in client.get("/api/profiles/").json() if p["id"] == child["id"]
    )["name"] == "Maya"


def test_delete_requires_parent_token(client):
    child = _create(client).json()
    r = client.delete(f"/api/profiles/{child['id']}")
    assert r.status_code == 401 and r.json()["detail"] == "parent lock"
    assert any(p["id"] == child["id"] for p in client.get("/api/profiles/").json())


def test_create_and_list_stay_open(client):
    assert _create(client).status_code == 200
    assert client.get("/api/profiles/").status_code == 200


# --- editing ----------------------------------------------------------------------


def test_rename_profile(client, parent_token):
    child = _create(client).json()
    r = client.patch(
        f"/api/profiles/{child['id']}",
        json={"name": "  Shreyu  "},
        headers=_auth(parent_token),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Shreyu"
    assert body["id"] == child["id"] and body["age"] == 6 and body["avatar_id"] == "fox"
    listed = next(p for p in client.get("/api/profiles/").json() if p["id"] == child["id"])
    assert listed["name"] == "Shreyu"


def test_patch_updates_age_and_avatar(client, parent_token):
    child = _create(client).json()
    r = client.patch(
        f"/api/profiles/{child['id']}",
        json={"age": 9, "avatar_id": "owl"},
        headers=_auth(parent_token),
    )
    assert r.status_code == 200
    assert r.json()["age"] == 9 and r.json()["avatar_id"] == "owl"
    assert r.json()["name"] == "Maya"


def test_empty_patch_is_a_noop(client, parent_token):
    child = _create(client).json()
    r = client.patch(f"/api/profiles/{child['id']}", json={}, headers=_auth(parent_token))
    assert r.status_code == 200 and r.json() == child


def test_default_profile_is_editable(client, parent_token):
    default_id = _default_id(client)
    r = client.patch(
        f"/api/profiles/{default_id}", json={"name": "Shreyu"}, headers=_auth(parent_token)
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Shreyu" and r.json()["is_default"] is True


def test_patch_unknown_profile_is_404(client, parent_token):
    r = client.patch("/api/profiles/nope", json={"name": "X"}, headers=_auth(parent_token))
    assert r.status_code == 404 and r.json()["detail"] == "profile not found"


def test_age_zero_allowed_and_13_rejected(client, parent_token):
    r = _create(client, age=0)
    assert r.status_code == 200 and r.json()["age"] == 0
    child_id = r.json()["id"]
    assert _create(client, age=13).status_code == 422
    assert _create(client, age=-1).status_code == 422
    r = client.patch(
        f"/api/profiles/{child_id}", json={"age": 13}, headers=_auth(parent_token)
    )
    assert r.status_code == 422
    r = client.patch(
        f"/api/profiles/{child_id}", json={"age": 12}, headers=_auth(parent_token)
    )
    assert r.status_code == 200 and r.json()["age"] == 12


def test_name_length_bounds(client, parent_token):
    child = _create(client).json()
    url = f"/api/profiles/{child['id']}"
    for bad in ["", "   ", "x" * 31, " " + "x" * 31 + " "]:
        assert client.patch(url, json={"name": bad}, headers=_auth(parent_token)).status_code == 422
        assert _create(client, name=bad).status_code == 422
    ok = "x" * 30
    r = client.patch(url, json={"name": f" {ok} "}, headers=_auth(parent_token))
    assert r.status_code == 200 and r.json()["name"] == ok
    assert _create(client, name="A").status_code == 200  # 1 char is the lower bound


def test_create_trims_name(client):
    assert _create(client, name="  Maya  ").json()["name"] == "Maya"


# --- deleting ---------------------------------------------------------------------


def test_cannot_delete_default(client, parent_token):
    default_id = _default_id(client)
    r = client.delete(f"/api/profiles/{default_id}", headers=_auth(parent_token))
    assert r.status_code == 409
    assert r.json()["detail"] == "default profile cannot be deleted"
    assert any(p["id"] == default_id for p in client.get("/api/profiles/").json())


def test_delete_unknown_profile_is_404(client, parent_token):
    r = client.delete("/api/profiles/nope", headers=_auth(parent_token))
    assert r.status_code == 404 and r.json()["detail"] == "profile not found"


def test_delete_profile_removes_stories(client, parent_token):
    child = _create(client).json()
    other = _create(client, name="Other").json()
    for c in (child, other):
        r = client.post(
            "/api/story/start",
            json={
                "child_id": c["id"],
                "character_name": "Pip",
                "character_archetype": "brave",
                "world": "forest",
                "theme": "friendship",
            },
        )
        assert r.status_code == 200
    story_id = _db_rows("SELECT id FROM stories WHERE child_id = ?", (child["id"],))[0][0]
    # VocabularyEntry rows reference the story, so they must go first.
    with closing(sqlite3.connect(settings.database_url.split("///", 1)[1])) as db:
        db.execute(
            "INSERT INTO vocabulary_entries (id, child_id, word, definition, story_id, "
            "encountered_at) VALUES ('v1', ?, 'brave', 'not scared', ?, '2026-01-01 00:00:00')",
            (child["id"], story_id),
        )
        db.commit()

    r = client.delete(f"/api/profiles/{child['id']}", headers=_auth(parent_token))
    assert r.status_code == 204 and r.content == b""

    history = client.get(f"/api/story/history/{child['id']}", headers=_auth(parent_token))
    assert history.status_code == 200 and history.json() == []
    assert _db_rows("SELECT id FROM stories WHERE child_id = ?", (child["id"],)) == []
    assert _db_rows("SELECT id FROM vocabulary_entries WHERE child_id = ?", (child["id"],)) == []
    assert _db_rows("SELECT id FROM child_profiles WHERE id = ?", (child["id"],)) == []
    # Another child's data is untouched.
    assert len(_db_rows("SELECT id FROM stories WHERE child_id = ?", (other["id"],))) == 1
    assert not any(p["id"] == child["id"] for p in client.get("/api/profiles/").json())


# --- parent-only reads --------------------------------------------------------------


def test_dashboard_and_history_require_token(client, parent_token):
    child_id = _create(client).json()["id"]
    for path in (f"/api/dashboard/{child_id}", f"/api/story/history/{child_id}"):
        r = client.get(path)
        assert r.status_code == 401 and r.json()["detail"] == "parent lock"
        assert client.get(path, headers=_auth("bogus")).status_code == 401
        assert client.get(path, headers=_auth(parent_token)).status_code == 200
