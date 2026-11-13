"""Household parent PIN: set/unlock/lock/reset/change, sliding tokens, cool-down."""
from __future__ import annotations

import sqlite3
from contextlib import closing
from datetime import datetime, timedelta, timezone

import bcrypt
import pytest

from app.core.config import settings
from app.services.parent_auth import ParentAuth, parent_auth

PIN = "1234"


class FakeClock:
    """A settable stand-in for `ParentAuth.now`."""

    def __init__(self, start: datetime | None = None) -> None:
        self.t = start or datetime.now(timezone.utc)

    def __call__(self) -> datetime:
        return self.t

    def advance(self, seconds: float) -> None:
        self.t += timedelta(seconds=seconds)


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch) -> FakeClock:
    """Drive the singleton's clock; monkeypatch restores the real one."""
    fake = FakeClock(parent_auth.now())
    monkeypatch.setattr(parent_auth, "now", fake)
    return fake


def _set_pin(client, pin: str = PIN) -> None:
    assert client.post("/api/parent/pin", json={"pin": pin}).status_code == 204


def _auth(token: str) -> dict[str, str]:
    return {"X-Parent-Token": token}


def _change_pin(client, token: str | None, new_pin: str = "4321"):
    headers = _auth(token) if token is not None else {}
    return client.post("/api/parent/change-pin", json={"new_pin": new_pin}, headers=headers)


def _solve(question: str) -> int:
    a, op, b = question.split(" ")
    assert op == "×"
    return int(a) * int(b)


# --- setting the PIN and unlocking -----------------------------------------------


def test_first_pin_then_unlock(client):
    assert client.get("/api/parent/status").json() == {"pin_set": False}
    assert client.post("/api/parent/pin", json={"pin": "1234"}).status_code == 204
    assert client.get("/api/parent/status").json() == {"pin_set": True}
    assert client.post("/api/parent/pin", json={"pin": "9999"}).status_code == 409
    r = client.post("/api/parent/unlock", json={"pin": "1234"})
    assert r.status_code == 200 and len(r.json()["token"]) >= 32
    assert datetime.fromisoformat(r.json()["expires_at"]) > datetime.now(timezone.utc)


def test_pin_is_stored_bcrypt_hashed_in_household_settings(client):
    _set_pin(client)
    db_path = settings.database_url.split("///", 1)[1]
    with closing(sqlite3.connect(db_path)) as db:
        rows = db.execute("SELECT id, parent_pin_hash FROM household_settings").fetchall()
    assert len(rows) == 1 and rows[0][0] == 1
    stored = rows[0][1]
    assert stored != PIN and stored.startswith("$2")
    assert bcrypt.checkpw(PIN.encode(), stored.encode())


def test_rejected_second_pin_leaves_first_intact(client):
    _set_pin(client, "1234")
    assert client.post("/api/parent/pin", json={"pin": "9999"}).status_code == 409
    assert client.post("/api/parent/unlock", json={"pin": "9999"}).status_code == 401
    assert client.post("/api/parent/unlock", json={"pin": "1234"}).status_code == 200


@pytest.mark.parametrize(
    "bad", ["12a4", "123", "12345", "", " 123", "1234\n", "١٢٣٤", "１２３４", "-123"]
)
def test_rejects_non_4_digit_pin(client, bad):
    assert client.post("/api/parent/pin", json={"pin": bad}).status_code == 422
    assert client.get("/api/parent/status").json() == {"pin_set": False}


def test_rejects_non_string_pin(client):
    assert client.post("/api/parent/pin", json={"pin": 1234}).status_code == 422
    assert client.post("/api/parent/pin", json={}).status_code == 422


def test_unlock_with_no_pin_set_is_unauthorized(client):
    assert client.post("/api/parent/unlock", json={"pin": PIN}).status_code == 401


def test_unlock_rejects_malformed_pin_without_a_server_error(client):
    _set_pin(client)
    assert client.post("/api/parent/unlock", json={"pin": "x" * 500}).status_code == 422


# --- wrong PINs and the cool-down ------------------------------------------------


def test_wrong_pin_rejected_and_cooldown_after_5(client, clock):
    _set_pin(client)
    for _ in range(5):
        assert client.post("/api/parent/unlock", json={"pin": "0000"}).status_code == 401
    r = client.post("/api/parent/unlock", json={"pin": PIN})  # right PIN, still cooled down
    assert r.status_code == 429
    retry_after = r.json()["retry_after"]
    assert isinstance(retry_after, int) and 1 <= retry_after <= 60
    assert int(r.headers["Retry-After"]) == retry_after

    clock.advance(30)
    r = client.post("/api/parent/unlock", json={"pin": PIN})
    assert r.status_code == 429 and 1 <= r.json()["retry_after"] <= 30

    clock.advance(31)  # 61 s since the 5th failure
    assert client.post("/api/parent/unlock", json={"pin": PIN}).status_code == 200


def test_cooldown_blocks_wrong_pin_too_and_does_not_extend(client, clock):
    _set_pin(client)
    for _ in range(5):
        client.post("/api/parent/unlock", json={"pin": "0000"})
    for _ in range(3):  # hammering during the cool-down must not push the end out
        assert client.post("/api/parent/unlock", json={"pin": "0000"}).status_code == 429
    clock.advance(61)
    assert client.post("/api/parent/unlock", json={"pin": PIN}).status_code == 200


def test_success_resets_the_failure_counter(client):
    _set_pin(client)
    for _ in range(4):
        assert client.post("/api/parent/unlock", json={"pin": "0000"}).status_code == 401
    assert client.post("/api/parent/unlock", json={"pin": PIN}).status_code == 200
    for _ in range(4):  # a fresh run of four is still not a cool-down
        assert client.post("/api/parent/unlock", json={"pin": "0000"}).status_code == 401
    assert client.post("/api/parent/unlock", json={"pin": PIN}).status_code == 200


def test_after_cooldown_a_fresh_run_of_five_is_allowed(client, clock):
    _set_pin(client)
    for _ in range(5):
        client.post("/api/parent/unlock", json={"pin": "0000"})
    assert client.post("/api/parent/unlock", json={"pin": PIN}).status_code == 429
    clock.advance(61)
    for _ in range(5):
        assert client.post("/api/parent/unlock", json={"pin": "0000"}).status_code == 401
    assert client.post("/api/parent/unlock", json={"pin": PIN}).status_code == 429


# --- token guard: require_parent (exercised through POST /change-pin) -------------


def test_guard_rejects_missing_and_garbage_token(client, parent_token):
    for token in (None, "", "not-a-token", parent_token + "x"):
        r = _change_pin(client, token)
        assert r.status_code == 401 and r.json() == {"detail": "parent lock"}


def test_change_pin_with_token_replaces_the_pin(client, parent_token):
    assert _change_pin(client, parent_token, "4321").status_code == 204
    assert client.post("/api/parent/unlock", json={"pin": PIN}).status_code == 401
    assert client.post("/api/parent/unlock", json={"pin": "4321"}).status_code == 200


def test_change_pin_rejects_bad_new_pin(client, parent_token):
    assert _change_pin(client, parent_token, "12a4").status_code == 422
    assert client.post("/api/parent/unlock", json={"pin": PIN}).status_code == 200


def test_expired_token_rejected(client, parent_token, clock):
    clock.advance(601)
    r = _change_pin(client, parent_token)
    assert r.status_code == 401 and r.json()["detail"] == "parent lock"
    # and the PIN was not changed
    assert client.post("/api/parent/unlock", json={"pin": PIN}).status_code == 200


def test_token_still_valid_just_inside_the_window(client, parent_token, clock):
    clock.advance(599)
    assert _change_pin(client, parent_token, PIN).status_code == 204


def test_sliding_expiry_extends(client, parent_token, clock):
    clock.advance(500)
    assert _change_pin(client, parent_token, PIN).status_code == 204  # slides to 1100
    clock.advance(500)  # t = 1000: past the original expiry, inside the slid one
    assert _change_pin(client, parent_token, PIN).status_code == 204
    clock.advance(601)  # idle for longer than the window
    assert _change_pin(client, parent_token, PIN).status_code == 401


def test_lock_revokes_token(client, parent_token):
    assert client.post("/api/parent/lock", headers=_auth(parent_token)).status_code == 204
    assert _change_pin(client, parent_token).status_code == 401


def test_lock_is_idempotent_and_needs_no_valid_token(client, parent_token):
    assert client.post("/api/parent/lock").status_code == 204
    assert client.post("/api/parent/lock", headers=_auth("bogus")).status_code == 204
    # a bogus lock must not have revoked someone else's token
    assert _change_pin(client, parent_token, PIN).status_code == 204


def test_each_unlock_issues_a_distinct_token(client, parent_token):
    other = client.post("/api/parent/unlock", json={"pin": PIN}).json()["token"]
    assert other != parent_token
    client.post("/api/parent/lock", headers=_auth(other))
    assert _change_pin(client, parent_token, PIN).status_code == 204  # the first one lives on


def test_restart_clears_tokens(client, parent_token):
    assert _change_pin(client, parent_token, PIN).status_code == 204
    parent_auth.clear()  # what a server restart does to in-memory state
    assert _change_pin(client, parent_token, PIN).status_code == 401


# --- forgot-PIN reset via arithmetic challenge ------------------------------------


def test_reset_with_correct_answer_sets_new_pin(client):
    _set_pin(client, "1234")
    ch = client.get("/api/parent/reset-challenge").json()
    assert set(ch) == {"challenge_id", "question"}
    wrong = _solve(ch["question"]) + 1
    r = client.post(
        "/api/parent/reset",
        json={"challenge_id": ch["challenge_id"], "answer": wrong, "new_pin": "5678"},
    )
    assert r.status_code == 403
    assert client.post("/api/parent/unlock", json={"pin": "5678"}).status_code == 401  # unchanged

    ch = client.get("/api/parent/reset-challenge").json()  # a wrong answer burns the challenge
    r = client.post(
        "/api/parent/reset",
        json={
            "challenge_id": ch["challenge_id"],
            "answer": _solve(ch["question"]),
            "new_pin": "5678",
        },
    )
    assert r.status_code == 204
    assert client.post("/api/parent/unlock", json={"pin": "1234"}).status_code == 401
    assert client.post("/api/parent/unlock", json={"pin": "5678"}).status_code == 200


def test_challenge_question_shape(client):
    q = client.get("/api/parent/reset-challenge").json()["question"]
    a, op, b = q.split(" ")
    assert op == "×" and 10 <= int(a) <= 99 and 2 <= int(b) <= 9


def test_challenge_is_single_use(client):
    _set_pin(client)
    ch = client.get("/api/parent/reset-challenge").json()
    body = {
        "challenge_id": ch["challenge_id"],
        "answer": _solve(ch["question"]),
        "new_pin": "5678",
    }
    assert client.post("/api/parent/reset", json=body).status_code == 204
    assert client.post("/api/parent/reset", json={**body, "new_pin": "9999"}).status_code == 403
    assert client.post("/api/parent/unlock", json={"pin": "5678"}).status_code == 200


def test_reset_with_unknown_challenge_is_forbidden(client):
    _set_pin(client)
    r = client.post(
        "/api/parent/reset",
        json={"challenge_id": "nope", "answer": 1, "new_pin": "5678"},
    )
    assert r.status_code == 403


def test_reset_rejects_bad_new_pin_without_burning_the_challenge(client):
    _set_pin(client)
    ch = client.get("/api/parent/reset-challenge").json()
    body = {"challenge_id": ch["challenge_id"], "answer": _solve(ch["question"])}
    assert client.post("/api/parent/reset", json={**body, "new_pin": "56"}).status_code == 422
    assert client.post("/api/parent/reset", json={**body, "new_pin": "5678"}).status_code == 204


def test_challenge_expires(client, clock):
    _set_pin(client)
    ch = client.get("/api/parent/reset-challenge").json()
    clock.advance(10 * 60)
    r = client.post(
        "/api/parent/reset",
        json={
            "challenge_id": ch["challenge_id"],
            "answer": _solve(ch["question"]),
            "new_pin": "5678",
        },
    )
    assert r.status_code == 403


def test_reset_clears_cooldown_so_the_new_pin_works_at_once(client):
    _set_pin(client)
    for _ in range(5):
        client.post("/api/parent/unlock", json={"pin": "0000"})
    assert client.post("/api/parent/unlock", json={"pin": PIN}).status_code == 429
    ch = client.get("/api/parent/reset-challenge").json()
    r = client.post(
        "/api/parent/reset",
        json={
            "challenge_id": ch["challenge_id"],
            "answer": _solve(ch["question"]),
            "new_pin": "5678",
        },
    )
    assert r.status_code == 204
    assert client.post("/api/parent/unlock", json={"pin": "5678"}).status_code == 200


# --- ParentAuth unit behaviour ------------------------------------------------------


def test_clear_resets_tokens_failures_cooldown_and_challenges():
    clock = FakeClock()
    auth = ParentAuth(now=clock)
    token, _ = auth.issue()
    for _ in range(5):
        auth.register_failure()
    cid, question = auth.new_challenge()
    assert auth.locked_until() is not None and auth.verify(token)

    auth.clear()

    assert auth.locked_until() is None
    assert not auth.verify(token)
    assert not auth.check_challenge(cid, _solve(question))
    for _ in range(4):  # the failure counter went back to zero
        auth.register_failure()
    assert auth.locked_until() is None


def test_issue_returns_expiry_ten_minutes_out_and_verify_slides_it():
    clock = FakeClock()
    auth = ParentAuth(now=clock)
    start = clock()
    token, expires_at = auth.issue()
    assert expires_at == start + timedelta(seconds=600)
    clock.advance(100)
    assert auth.verify(token)
    clock.advance(599)  # 699 s after issue: only alive because verify slid it
    assert auth.verify(token)
    clock.advance(601)
    assert not auth.verify(token)
    assert not auth.verify(token)  # expired tokens stay dead


def test_revoke_unknown_token_is_a_noop():
    auth = ParentAuth(now=FakeClock())
    auth.revoke("never-issued")
    token, _ = auth.issue()
    auth.revoke(token)
    auth.revoke(token)
    assert not auth.verify(token)


def test_expired_tokens_are_pruned_from_memory():
    clock = FakeClock()
    auth = ParentAuth(now=clock)
    for _ in range(20):
        auth.issue()
    clock.advance(601)
    auth.issue()
    assert len(auth._tokens) == 1


def test_unredeemed_challenges_are_bounded():
    auth = ParentAuth(now=FakeClock())
    first_id, first_q = auth.new_challenge()
    for _ in range(500):
        auth.new_challenge()
    assert len(auth._challenges) <= 100
    assert not auth.check_challenge(first_id, _solve(first_q))  # oldest was evicted
