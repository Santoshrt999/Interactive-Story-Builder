# StoryWeaver — Progress & Handoff

_Last updated: 2026-06-06_

An agentic, AI-powered interactive storybook for children (ages 0–12). The child is
co-author: Claude drives the narrative, pauses at chapter ends, listens to voice input,
shows illustrations, and asks curiosity questions. Runs **fully offline** today (canned
story engine + placeholder/animal SVGs + browser narration); live AI activates when API
keys are added.

---

## How to run locally

```bash
# Backend  (http://localhost:8000)
cd backend && ~/.local/bin/uv run uvicorn app.main:app --reload --port 8000

# Frontend (http://localhost:5173)  ← open this
cd frontend && npm run dev
```

- Redis optional — backend falls back to an in-memory store automatically.
- Docker files exist but are intentionally unused (running locally instead).
- Default child profile **"Shreyu ♥"** is auto-created on the Home screen.

---

## Status by area

### ✅ Done — Phase 1 MVP
- Monorepo: `frontend/` (React 19 + TS + Vite + Tailwind v4 + Framer Motion + Zustand +
  TanStack Query v5 + React Router v7), `backend/` (FastAPI async + Pydantic v2 +
  SQLAlchemy async/aiosqlite + redis-py + structlog, managed by `uv`).
- Core agentic loop (`backend/app/agents/story_agent.py`): SETUP → CHAPTER (≤8) →
  VOICE/CHOICE PROCESSING → ENDING (certificate + vocabulary).
- Endpoints (all under `/api`): profiles CRUD, story start/choice/stream(SSE)/
  curiosity-answer/end/history, media image/voice, dashboard.
- SSE streaming: chapter text sentence-by-sentence (`event: sentence|meta|done`).
- SQLite persistence (profiles, stories, vocabulary).
- Web Speech API voice input (text fallback).
- Frontend pages: Home, Setup, Story, ParentView; ErrorBoundary ("Oops, the magic
  hiccuped! ✨").

### ✅ Done — Round 2 improvements (this session)
- **Repetition bug fixed.** Rewrote the offline engine (`backend/app/services/claude_service.py`):
  arc-based, deterministic-but-non-repeating (6/6 unique openings, cliffhangers, choices
  per story). `_pick_distinct` guarantees no chapter collisions until a pool is exhausted.
- **Animals are central.** Per-world animal casts; each chapter stars a named animal;
  16 new animal scene SVGs in `backend/static/images/scene_{world}_{animal}.svg`.
  `image_service` picks the SVG by world + animal named in `scene_description`.
- **Age tiers incl. under-4:** 0–2 (lullaby), 3–4 (toddler), 5–7, 8–10, 11–12. Chapter
  length + vocabulary scale with age. Mirrored in `STORY_SYSTEM_PROMPT` (online path).
- **Book experience** (`frontend/src/components/story/StoryBook.tsx`): large two-page
  spread, chapter title in a big square cover box, page-turn by click / page corners /
  ← → keys, flip back through completed chapters. Replaces the old small `StoryCanvas`.
- **Soft female narrator** (`frontend/src/hooks/useAudio.ts`): warm female voice
  (Samantha/Karen/Zira…), rate ≈ 0.85, pitch ≈ 1.15, async `voiceschanged` loading.
- **Welcome copy:** "Welcome to Fantasy Story Land ✨" + whimsical microcopy; visual
  world/theme cards at Setup.
- **Shreyu ♥** default child auto-created; heart shown next to the name. Maya removed.
- **Finished storybook + download** (`frontend/src/components/story/FinishedStorybook.tsx`,
  `frontend/src/lib/downloadStorybook.ts`): flip-through completed book + certificate +
  "Download my storybook" → self-contained printable HTML (Print → Save as PDF).
- Fixed `max_tokens` dead-parameter warning in `claude_service.complete`.

---

## ▶️ Next steps / TODO

### Wire live AI (when keys are ready) — copy `backend/.env.example` → `backend/.env`
- `ANTHROPIC_API_KEY` → live Claude story generation (model `claude-sonnet-4-5`). Code
  path already exists; it swaps in automatically. **No code change needed.**
- `REPLICATE_API_TOKEN` → real FLUX animal-scene image generation (replaces SVGs).
- `ELEVENLABS_API_KEY` → character voice synthesis (currently browser speechSynthesis).

### Phase 2 (enrich) — partially stubbed
- ElevenLabs voice synthesis + Howler.js playback of returned audio URLs
  (`useAudio.playUrl` already wired; backend `/api/media/voice/{character}` returns 501).
- Curiosity + vocab agents using live Claude (canned versions exist).
- **Desktop app** (requested 2026-06-09 — _do not implement yet_): package StoryWeaver
  as a downloadable/installable desktop app while still running the local backend.
  Likely **Tauri** (lightweight, Rust shell) or **Electron** wrapping the existing
  Vite frontend; bundle/launch the FastAPI backend as a sidecar (or keep it on
  localhost) so the app works offline as a single click-to-run experience.
  Decide: Tauri vs Electron; how to ship/start the Python backend (PyInstaller
  sidecar vs bundled `uv`); auto-start + port management.

### Phase 3 (polish)
- Parent dashboard with real aggregated data (currently basic).
- Story certificate as a true PDF (ReportLab) in addition to the HTML download.
- Per-route page-transition animations at the router boundary.
- Persist/resume an in-progress story (only the active profile persists today).
- Real parent-PIN verification against the backend (currently any 4 digits pass).
- Tighter word-level narration sync (currently per-sentence).
- Code-split the frontend bundle.
- Slightly vary `scene_description` phrasing (animal differs per chapter, but the
  "...crossing a sparkling path in..." frame repeats — minor).

---

## Key files
- Backend story engine: `backend/app/services/claude_service.py`
- Agentic loop: `backend/app/agents/story_agent.py`
- Prompts (versioned): `backend/app/core/prompts.py`
- Image selection: `backend/app/services/image_service.py`, `app/agents/image_agent.py`
- Settings/env: `backend/app/core/config.py`, `backend/.env.example`
- Book UI: `frontend/src/components/story/StoryBook.tsx`
- Finished book + download: `FinishedStorybook.tsx`, `frontend/src/lib/downloadStorybook.ts`
- Narration: `frontend/src/hooks/useAudio.ts`
- Story state: `frontend/src/store/storyStore.ts`
- API client + types: `frontend/src/api/client.ts`, `frontend/src/api/types.ts`

## Verify quickly
- Backend health: `curl http://localhost:8000/health` → `{"status":"ok"}`
- Variety check: start a story, stream chapters 1–2 — animals & choices should differ.
- Frontend: open http://localhost:5173 → Shreyu ♥ default; build with `npm run build`.
