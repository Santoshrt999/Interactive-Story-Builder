# StoryWeaver Backend

Agentic AI interactive story builder for kids — FastAPI backend (Phase 1 MVP).

## Quickstart

```bash
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

The app runs fully offline with deterministic canned fallbacks when no API keys
are present (`ANTHROPIC_API_KEY`, `REPLICATE_API_TOKEN`, `ELEVENLABS_API_KEY`).

See `.env.example` for configuration.
