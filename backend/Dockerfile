FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_LINK_MODE=copy

# Install uv.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Install dependencies first (better layer caching).
COPY pyproject.toml README.md ./
RUN uv sync --no-install-project --no-dev

# Copy the application.
COPY . .
RUN uv sync --no-dev

EXPOSE 8000

# One worker: parent-lock tokens, cool-down and reset challenges live in process memory.
CMD ["uv", "run", "gunicorn", "app.main:app", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--workers", "1", \
     "--bind", "0.0.0.0:8000", \
     "--timeout", "120"]
