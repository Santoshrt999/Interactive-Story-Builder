<div align="center">

# 📖✨ StoryWeaver

### _Welcome to Fantasy Story Land_ — where the child is the **co-author**, not the audience.

An agentic, AI-powered interactive storybook for children **ages 0–12**. Claude weaves an original
adventure, pauses at every chapter, listens to the child's voice to decide what happens next,
illustrates each scene with friendly animals, and asks gentle curiosity questions that grow
imagination and vocabulary — then hands back a downloadable keepsake storybook.

<br/>

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-v4-38BDF8?logo=tailwindcss&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-async-009688?logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.12+-3776AB?logo=python&logoColor=white)
![Claude](https://img.shields.io/badge/Claude-Sonnet_4.5-D97757?logo=anthropic&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-success)

<br/>

<img src="docs/screenshots/05-story-book.png" alt="StoryWeaver storybook — a two-page spread with a fox illustration and branching choices" width="85%"/>

<sub>A real two-page storybook: square title cover, scene illustration, streaming text, and three branching choices.</sub>

</div>

---

## ✨ Highlights

- 🪄 **Agentic, not a chatbot.** A coordinated loop of specialized agents (story · curiosity · image · vocabulary) with persistent memory and media generation.
- 📚 **A real book.** Big two-page spread, a square title cover, page-turn by click / arrows / `← →` keys, and flip-back through every chapter.
- 🦊 **Animal-led adventures.** Each chapter stars a named animal companion with its own scene illustration.
- 🎙️ **Voice-first & soft narration.** Children speak their choices (Web Speech API); a warm, gentle voice reads **every sentence in order**, with pause/play and re-reading when you flip back a page. Natural Apple voices (Zoe / Ava Premium) are picked automatically, and parents can choose the storyteller's voice.
- 🌙 **Bedtime mode.** A dim, warm screen, a slower narrator, a soft lullaby, and a story that wraps up after **3 chapters** with a goodnight ending — suggested automatically in the evening.
- 📖 **Continue where you left off.** Fell asleep at chapter 2? The home screen offers _Continue_ the next night — even after the app restarts.
- 🎵 **Generated background music.** A gentle music-box tune (no audio files) that quiets under the narrator, with a 🎵 on/off button on every screen.
- 🔒 **Real parent corner.** A household PIN checked by the server unlocks per-child insights, **Manage profiles** (rename, age, avatar, delete) and the voice picker.
- 🧠 **Curiosity over plot.** After each chapter, one open-ended Socratic question — never a yes/no — with an always-available _Skip_.
- 👶 **Ages 0–12.** Five age tiers from soothing infant lullabies to layered tween moral choices; length and vocabulary scale with age.
- 🏆 **Keepsake ending.** A finished, flip-through storybook + a **Certificate of Adventure** + a one-click **downloadable, printable storybook**.
- 🔌 **Runs fully offline.** No API keys required — a built-in story engine, animal SVGs, and browser narration power everything; keys simply upgrade to live AI.

---

## 📸 A tour

| | |
|---|---|
| **Welcome — pick your storyteller** <br/> <img src="docs/screenshots/01-home.png" width="100%"/> | **Meet your hero** <br/> <img src="docs/screenshots/02-setup-hero.png" width="100%"/> |
| **Choose a world** <br/> <img src="docs/screenshots/03-setup-world.png" width="100%"/> | **Pick a theme** <br/> <img src="docs/screenshots/04-setup-theme.png" width="100%"/> |
| **The storybook** <br/> <img src="docs/screenshots/05-story-book.png" width="100%"/> | **A curious thought** <br/> <img src="docs/screenshots/06-curiosity.png" width="100%"/> |
| **The finished keepsake** <br/> <img src="docs/screenshots/09-finished.png" width="100%"/> | **Certificate + download** <br/> <img src="docs/screenshots/10-certificate.png" width="100%"/> |

> 💡 The downloaded keepsake (`docs/storybook-sample.html`) is a self-contained, print-friendly file — open it and **Print → Save as PDF** for a real book.

---

## 🚀 Quickstart (local, no Docker)

> **Prereqs:** Python 3.12+, Node 20+ (via [nvm](https://github.com/nvm-sh/nvm) is fine), and [`uv`](https://docs.astral.sh/uv/)
> (`curl -LsSf https://astral.sh/uv/install.sh | sh` → installs to `~/.local/bin/uv` on macOS).
> Redis is **optional** — the backend falls back to an in-memory store automatically.

**One command** — drag `start.sh` into a terminal (or run `./start.sh`):

```bash
./start.sh
```

It pulls the latest code, syncs dependencies, starts the backend and frontend with live reload, and opens **http://localhost:5173**. Press **Ctrl+C** to stop both. Logs go to `.logs/`.

<details>
<summary>Or start the two servers by hand</summary>

**Backend** → http://localhost:8000
```bash
cd backend
~/.local/bin/uv sync
~/.local/bin/uv run uvicorn app.main:app --reload --port 8000
```

**Frontend** → http://localhost:5173  ← _open this_
```bash
cd frontend
npm install
npm run dev
```
</details>

The default storyteller **Shreyanvi ❤️** is created automatically. That's it — start an adventure.

> 🗣️ **Nicer narrator voice (Mac):** System Settings → Accessibility → **Read & Speak** (called *Spoken Content* on older macOS) → ⓘ next to *System voice* → English → download **Zoe (Premium)** and **Ava (Premium)**. Restart the browser; StoryWeaver uses them automatically.
>
> 👪 **Parent corner:** the first visit asks you to create a 4-digit household PIN.

> 🔑 To unlock live AI, copy `backend/.env.example` → `backend/.env` and add keys. No code changes needed — the services detect keys and swap in.

<details>
<summary>Run with Docker instead</summary>

```bash
docker compose up --build   # then open http://localhost:5173
```
</details>

---

## 🧩 How it works

```
storyweaver/
├── frontend/                 # React 19 + Vite SPA
│   └── src/
│       ├── pages/            # Home · Setup · Story · ParentView
│       ├── components/story/  # StoryBook, ChapterReveal, VoiceInput, Curiosity…
│       ├── components/parent/ # PinPad, ManageProfiles, ChildSwitcher, VoicePicker
│       ├── hooks/            # useStoryStream (SSE) · useAudio · useMusic · useParentLock
│       ├── lib/              # speechQueue · music engine · voices · bedtime helpers
│       └── store/            # Zustand session + settings (bedtime, music, voice)
├── backend/                  # FastAPI (async) — agentic engine + API
│   └── app/
│       ├── main.py           # app, CORS, /static mount, routers under /api
│       ├── agents/           # story · curiosity · image · vocab
│       ├── services/         # claude · elevenlabs · image · redis (+ fallbacks)
│       ├── routers/          # profiles · story · media · dashboard · parent
│       ├── models/           # SQLAlchemy async models + Pydantic schemas
│       └── core/             # config (pydantic-settings) · prompts · logging
│   └── static/images/        # animal scene SVGs + generated art
└── docker-compose.yml
```

The **frontend** talks to the **backend** over JSON + **SSE** (chapters stream in sentence-by-sentence).
**Redis** holds live agentic session context (in-memory fallback); **SQLite** persists profiles, stories, and vocabulary.

### The agentic loop

1. **SETUP** — collect the child's profile, hero, world & theme; seed the persistent story universe.
2. **CHAPTER** _(repeats, up to 8)_ — `story_agent` streams the next chapter, `image_agent` illustrates the scene, `curiosity_agent` poses one question, and three branching choices appear.
3. **VOICE / CHOICE** — the child speaks or taps; the transcript is woven back into the next chapter.
4. **ENDING** — `story_agent` writes a satisfying conclusion, a certificate is minted, and `vocab_agent` recaps the new words.

| Agent | Responsibility |
|-------|----------------|
| `story_agent` | Drives the narrative arc, streams chapters, writes the ending. |
| `curiosity_agent` | One age-appropriate Socratic question per chapter. |
| `image_agent` | Scene illustration (Replicate FLUX → animal-SVG fallback). |
| `vocab_agent` | Extracts & explains the new words for the recap. |

---

## 🛠️ Tech stack

**Frontend** — React 19 · TypeScript · Vite · Tailwind CSS v4 · Framer Motion · shadcn-style UI · Web Speech API · Howler.js · TanStack Query v5 · Zustand · React Router v7

**Backend** — FastAPI (async) · Pydantic v2 · Anthropic SDK (`claude-sonnet-4-5`, streaming) · ElevenLabs · Replicate FLUX · SQLAlchemy async + aiosqlite · redis-py · structlog · `uv`

**Infra** — Docker Compose · Python 3.12+ · Node 20+

---

## ⚙️ Environment

Copy `backend/.env.example` → `backend/.env` and fill only what you need. **Everything works with zero keys.**

| Variable | Purpose | Without it |
|----------|---------|------------|
| `ANTHROPIC_API_KEY` | Live Claude story generation | Built-in canned story engine |
| `REPLICATE_API_TOKEN` | FLUX scene images | Animal placeholder SVGs |
| `ELEVENLABS_API_KEY` | Character voice synthesis | Browser `speechSynthesis` |
| `REDIS_URL` | Session / agentic context store | In-memory fallback |
| `DATABASE_URL` | SQLAlchemy async URL | `sqlite+aiosqlite:///./storyweaver.db` |
| `PARENT_DASHBOARD_SECRET` | Parent dashboard secret | — |
| `CORS_ORIGINS` | Allowed origins | `http://localhost:5173` |
| `LOG_LEVEL` | structlog level | `INFO` |

---

## 🔌 API

Base `/api` — backend `:8000`, frontend `:5173`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` / `GET` | `/api/profiles/` | Create / list child profiles |
| `PATCH` / `DELETE` | `/api/profiles/{id}` | Edit / delete a profile 🔒 (default profile can't be deleted) |
| `POST` | `/api/story/start` | Begin a story (`bedtime: true` → 3 chapters) → `{session_id, story_id, title, bedtime, max_chapters}` |
| `GET`  | `/api/story/active/{child_id}` | Latest unfinished story (for _Continue_) |
| `POST` | `/api/story/resume` | Rebuild an unfinished story's session (survives restarts) |
| `GET`  | `/api/story/stream/{session_id}` | SSE chapter stream (`sentence` · `meta` · `done`) |
| `POST` | `/api/story/choice` | Submit a choice (text or voice transcript) |
| `POST` | `/api/story/curiosity-answer` | Submit a curiosity response |
| `POST` | `/api/story/end` | Generate ending + certificate |
| `GET`  | `/api/story/history/{child_id}` | List past stories 🔒 |
| `POST` | `/api/media/image` | Scene image (FLUX; placeholder fallback) |
| `POST` | `/api/media/voice/{character}` | Character voice (ElevenLabs; Phase 2) |
| `GET`  | `/api/dashboard/{child_id}` | Parent dashboard data 🔒 |
| `GET` / `POST` | `/api/parent/status` · `pin` · `unlock` · `lock` · `change-pin` · `reset-challenge` · `reset` | Household parent PIN; `unlock` returns a 10-minute token sent as `X-Parent-Token` |

🔒 = requires the `X-Parent-Token` header.

### Tests

```bash
cd backend  && ~/.local/bin/uv run pytest          # API, migration, parent lock, bedtime, resume
cd frontend && npm test                              # narrator queue, music engine, voices, helpers
cd frontend && npx tsc -p tsconfig.app.json --noEmit # type check
```

---

## 🗺️ Roadmap

- ✅ **Phase 1 — MVP:** story loop, SSE streaming, voice input, SQLite, the book UI, animal art, age tiers, downloadable keepsake.
- ✅ **Phase 1.5 — Family-ready:** Bedtime mode, continue-after-restart, generated music, sentence-by-sentence narration with natural voices, editable profiles, server-checked parent PIN.
- 🔜 **Phase 2:** live Claude stories, FLUX image generation, ElevenLabs voices, deeper curiosity & vocab agents (all key-activated, no code changes).
- 🔮 **Phase 3:** parent dashboard analytics, certificate PDF export, story replay, production hardening.

See [`PROGRESS.md`](PROGRESS.md) for the detailed handoff log.

---

## 📄 License

Released under the [MIT License](LICENSE). © 2026 Santosh Goteti.

<div align="center"><sub>Made with 🪄 for curious little storytellers.</sub></div>
