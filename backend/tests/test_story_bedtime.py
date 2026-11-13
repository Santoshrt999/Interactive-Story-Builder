"""Bedtime stories (3 chapters, goodnight ending) and persisted choices."""
from __future__ import annotations

import json
import sqlite3
from contextlib import closing

from app.core.config import settings

_BODY = {"character_name": "Luna", "character_archetype": "kind", "world": "forest", "theme": "friendship"}


def _db_rows(sql: str, params: tuple = ()) -> list[tuple]:
    db_path = settings.database_url.split("///", 1)[1]
    with closing(sqlite3.connect(db_path)) as db:
        return db.execute(sql, params).fetchall()


def _start(client, **extra) -> dict:
    child_id = client.get("/api/profiles/").json()[0]["id"]
    response = client.post("/api/story/start", json={"child_id": child_id, **_BODY, **extra})
    assert response.status_code == 200, response.text
    return response.json()


def _stream(client, session_id: str) -> tuple[str, dict]:
    """Read the pending chapter off the SSE stream: (full text, meta event)."""
    body = client.get(f"/api/story/stream/{session_id}").text
    sentences: list[str] = []
    meta: dict = {}
    event = None
    for line in body.splitlines():
        if line.startswith("event:"):
            event = line.split(":", 1)[1].strip()
        elif line.startswith("data:") and event in ("sentence", "meta"):
            data = json.loads(line.split(":", 1)[1])
            if event == "sentence":
                sentences.append(data["text"])
            else:
                meta = data
    return " ".join(sentences), meta


def _choose(client, session_id: str, choice: str = "Follow the sparkling trail"):
    return client.post("/api/story/choice", json={"session_id": session_id, "choice": choice})


def test_bedtime_story_has_three_chapters_and_goodnight(client):
    started = _start(client, bedtime=True)
    assert started["bedtime"] is True and started["max_chapters"] == 3

    session = started["session_id"]
    _, meta = _stream(client, session)
    assert meta["chapter_number"] == 1 and meta["is_final"] is False

    assert _choose(client, session).status_code == 200
    _, meta = _stream(client, session)
    assert meta["chapter_number"] == 2 and meta["is_final"] is False

    assert _choose(client, session).status_code == 200
    text, meta = _stream(client, session)
    assert meta["chapter_number"] == 3 and meta["is_final"] is True
    assert "sleep" in text.lower() or "goodnight" in text.lower()

    refused = _choose(client, session)
    assert refused.status_code == 409
    assert refused.json()["detail"] == "story is complete"

    story = _db_rows("SELECT bedtime, max_chapters, choices_made FROM stories")[0]
    assert story[0] == 1 and story[1] == 3
    assert len(json.loads(story[2])) == 2  # the refused choice was not recorded


def test_offline_bedtime_moods_over_the_stream(client):
    session = _start(client, bedtime=True)["session_id"]
    moods = []
    for number in range(1, 4):
        if number > 1:
            assert _choose(client, session).status_code == 200
        _, meta = _stream(client, session)
        moods.append(meta["mood"])
    assert set(moods) <= {"wonder", "calm"}
    assert moods[-1] == "calm"


def test_offline_bedtime_chapters_are_calm_with_no_cliffhangers_at_any_age():
    from app.services.claude_service import _CLIFFHANGERS, _canned_chapter

    # The literal opening words of each cliffhanger template (before any placeholder).
    stems = {c.split("{")[0].strip() for c in _CLIFFHANGERS if c.split("{")[0].strip()}
    for age in (2, 4, 6, 9, 12):
        moods = []
        for number in (1, 2, 3):
            chapter = _canned_chapter(
                chapter_number=number,
                character_name="Luna",
                character_archetype="kind",
                world="forest",
                theme="friendship",
                age=age,
                last_choice=None,
                curiosity_answer=None,
                total_chapters=3,
                bedtime=True,
            )
            moods.append(chapter["mood"])
            assert not any(stem in chapter["chapter_text"] for stem in stems), (age, number)
        assert moods == ["wonder", "wonder", "calm"]


def test_normal_story_is_final_only_at_eight(client):
    started = _start(client)
    assert started["bedtime"] is False and started["max_chapters"] == 8

    session = started["session_id"]
    finals = []
    last_text = ""
    for number in range(1, 9):
        if number > 1:
            assert _choose(client, session).status_code == 200
        last_text, meta = _stream(client, session)
        assert meta["chapter_number"] == number
        finals.append(meta["is_final"])
    assert finals == [False] * 7 + [True]
    assert "goodnight" not in last_text.lower() and "sleep" not in last_text.lower()

    assert _choose(client, session).status_code == 409

    stored = json.loads(_db_rows("SELECT chapters FROM stories")[0][0])
    assert [c["is_final"] for c in stored] == finals


def test_choices_and_answers_persisted_to_db(client):
    session = _start(client)["session_id"]
    assert _db_rows("SELECT updated_at FROM stories")[0][0] is not None

    assert _choose(client, session, "Cross the wobbly bridge").status_code == 200
    answer = client.post(
        "/api/story/curiosity-answer",
        json={"session_id": session, "answer": "I felt brave"},
    )
    assert answer.status_code == 200 and answer.json() == {"acknowledged": True}

    choices, answers = _db_rows("SELECT choices_made, curiosity_answers FROM stories")[0]
    assert json.loads(choices) == ["Cross the wobbly bridge"]
    assert json.loads(answers) == ["I felt brave"]


def test_choice_on_unknown_session_is_404(client):
    response = _choose(client, "no-such-session")
    assert response.status_code == 404 and response.json()["detail"] == "unknown session"


def test_curiosity_answer_on_unknown_session_is_acknowledged(client):
    response = client.post(
        "/api/story/curiosity-answer",
        json={"session_id": "no-such-session", "answer": "hmm"},
    )
    assert response.status_code == 200 and response.json() == {"acknowledged": True}
