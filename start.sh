#!/usr/bin/env bash
# StoryWeaver — one-shot local launcher.
# Drag this file into a terminal and press Enter (or run ./start.sh).
# It pulls the latest code, syncs dependencies, starts backend + frontend
# with live reload, and opens the app. Press Ctrl+C to stop everything.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
BACKEND_PORT=8000
FRONTEND_PORT=5173
LOG_DIR="$ROOT/.logs"
mkdir -p "$LOG_DIR"

say()  { printf '\033[1;35m▶ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✖ %s\033[0m\n' "$*"; exit 1; }

# ---------------------------------------------------------------- toolchain
# Non-interactive shells don't load ~/.zshrc, so wire up PATH ourselves.
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

# Node: Vite 6 + Tailwind v4 need Node 20+. Prefer nvm's newest install.
node_major() { node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/'; }
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
  nvm use 22 >/dev/null 2>&1 || nvm use 20 >/dev/null 2>&1 || true
fi
if [ "$(node_major || echo 0)" -lt 20 ] 2>/dev/null; then
  for d in /opt/homebrew/opt/node@22/bin /opt/homebrew/opt/node/bin; do
    [ -x "$d/node" ] && export PATH="$d:$PATH" && break
  done
fi
command -v node >/dev/null || die "Node.js not found. Install Node 22 (e.g. 'nvm install 22')."
[ "$(node_major)" -ge 20 ] || die "Node $(node -v) is too old — need 20+. Run 'nvm install 22'."

command -v uv >/dev/null || die "uv not found. Install: curl -LsSf https://astral.sh/uv/install.sh | sh"

say "Node $(node -v) · $(uv --version)"

# ---------------------------------------------------------------- latest code
cd "$ROOT"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1 && git remote get-url origin >/dev/null 2>&1; then
  say "Pulling latest code ($(git rev-parse --abbrev-ref HEAD))…"
  if ! git pull --ff-only 2>&1 | sed 's/^/   /'; then
    warn "git pull skipped (offline, local changes conflict, or branch diverged) — running local code."
  fi
fi

# ---------------------------------------------------------------- free ports
# Old runs can be left behind — even *frozen* (Ctrl+Z), which still holds the
# ports but never answers. Frozen processes ignore a normal stop, so wake them
# first (CONT), ask nicely (TERM), then force (KILL) if they're still there.
stop_pids() {
  [ -z "$1" ] && return
  kill -CONT $1 2>/dev/null || true
  kill -TERM $1 2>/dev/null || true
  for _ in 1 2 3 4 5 6; do
    sleep 0.5
    alive=""
    for p in $1; do kill -0 "$p" 2>/dev/null && alive="$alive $p"; done
    [ -z "$alive" ] && return
  done
  kill -KILL $alive 2>/dev/null || true
  sleep 0.5
}

# Earlier copies of this launcher (frozen or orphaned) — stop them and their children.
old_launchers="$(pgrep -f "$ROOT/start.sh" 2>/dev/null | grep -vx "$$" || true)"
if [ -n "$old_launchers" ]; then
  warn "Stopping an earlier StoryWeaver run…"
  for p in $old_launchers; do stop_pids "$(pgrep -P "$p" 2>/dev/null || true)"; done
  stop_pids "$old_launchers"
fi

for port in "$BACKEND_PORT" "$FRONTEND_PORT"; do
  pids="$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    warn "Port $port in use — stopping old process(es): $(echo $pids)"
    stop_pids "$pids"
  fi
  if lsof -ti tcp:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    die "Port $port is still busy (another app?). Close it, then run start.sh again."
  fi
done

# ---------------------------------------------------------------- dependencies
say "Syncing backend dependencies (uv)…"
(cd "$BACKEND" && uv sync --quiet)

if [ ! -f "$BACKEND/.env" ] && [ -f "$BACKEND/.env.example" ]; then
  warn "No backend/.env — running in offline mode (no API keys). Copy .env.example → .env to enable live AI."
fi

say "Syncing frontend dependencies (npm)…"
LOCK_HASH="$(cat "$FRONTEND/package.json" "$FRONTEND/package-lock.json" 2>/dev/null | shasum | cut -d' ' -f1)"
STAMP="$FRONTEND/node_modules/.storyweaver-deps"
if [ ! -d "$FRONTEND/node_modules" ] || [ "$(cat "$STAMP" 2>/dev/null)" != "$LOCK_HASH" ]; then
  (cd "$FRONTEND" && npm install --no-audit --no-fund --loglevel=error)
  echo "$LOCK_HASH" > "$STAMP"
else
  echo "   up to date"
fi

# ---------------------------------------------------------------- run
PIDS=()
CLEANED=0
cleanup() {
  [ "$CLEANED" = 1 ] && return; CLEANED=1
  echo
  say "Shutting down…"
  for pid in "${PIDS[@]:-}"; do
    [ -n "$pid" ] && { pkill -P "$pid" 2>/dev/null; kill "$pid" 2>/dev/null; } || true
  done
  # uvicorn --reload / vite spawn grandchildren — free the ports for sure.
  for port in "$BACKEND_PORT" "$FRONTEND_PORT"; do
    lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
  done
  exit 0
}
trap cleanup INT TERM EXIT
# Ignore Ctrl+Z: suspending would freeze the servers while they still hold
# their ports. The ignore is inherited by the servers started below.
trap '' TSTP

say "Starting backend  → http://localhost:$BACKEND_PORT  (log: .logs/backend.log)"
(cd "$BACKEND" && exec uv run uvicorn app.main:app --reload --port "$BACKEND_PORT") \
  > "$LOG_DIR/backend.log" 2>&1 &
PIDS+=($!)

say "Starting frontend → http://localhost:$FRONTEND_PORT  (log: .logs/frontend.log)"
(cd "$FRONTEND" && exec npx vite --port "$FRONTEND_PORT" --strictPort) \
  > "$LOG_DIR/frontend.log" 2>&1 &
PIDS+=($!)

wait_for() { # url name logfile
  for _ in $(seq 1 60); do
    curl -s -o /dev/null "$1" && return 0
    sleep 0.5
  done
  echo; tail -30 "$3"; die "$2 did not start — see log above."
}
wait_for "http://localhost:$BACKEND_PORT/health" "Backend"  "$LOG_DIR/backend.log"
wait_for "http://localhost:$FRONTEND_PORT/"      "Frontend" "$LOG_DIR/frontend.log"

APP_URL="http://localhost:$FRONTEND_PORT"
printf '\n\033[1;32m✔ StoryWeaver is running → %s\033[0m\n' "$APP_URL"
echo "  Code changes reload automatically. Press Ctrl+C to stop (not Ctrl+Z)."
echo
# Open the app in the default browser (macOS `open`, Linux `xdg-open`).
if command -v open >/dev/null; then
  open "$APP_URL" || warn "Couldn't open the browser — visit $APP_URL"
elif command -v xdg-open >/dev/null; then
  xdg-open "$APP_URL" >/dev/null 2>&1 || warn "Couldn't open the browser — visit $APP_URL"
else
  warn "Open $APP_URL in your browser."
fi

# Stream both logs; exit if either server dies.
tail -n 0 -f "$LOG_DIR/backend.log" "$LOG_DIR/frontend.log" &
PIDS+=($!)
while kill -0 "${PIDS[0]}" 2>/dev/null && kill -0 "${PIDS[1]}" 2>/dev/null; do sleep 2; done
warn "A server exited — check .logs/. Stopping."
