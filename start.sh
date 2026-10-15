#!/usr/bin/env bash
#
# Start the whole Job Tracker stack with one command:
#   ./start.sh
#
# Runs the FastAPI backend and the Vite frontend together, and best-effort
# ensures Postgres and Ollama are running. Press Ctrl+C to stop everything.

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "▶ Ensuring Postgres is running..."
brew services start postgresql@17 >/dev/null 2>&1 || true

echo "▶ Ensuring Ollama is running..."
if ! curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
  (ollama serve >/dev/null 2>&1 &) || true
  sleep 2
fi

# --- Backend -------------------------------------------------------------
echo "▶ Starting backend on http://localhost:8000"
cd "$ROOT/backend"
# shellcheck disable=SC1091
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!

# --- Frontend ------------------------------------------------------------
echo "▶ Starting frontend on http://localhost:5173"
cd "$ROOT/frontend"
npm run dev &
FRONTEND_PID=$!

# Stop both when this script is interrupted.
cleanup() {
  echo ""
  echo "■ Stopping..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo ""
echo "✅ Up. Open http://localhost:5173  (API: http://localhost:8000/docs)"
echo "   Press Ctrl+C to stop both."
wait
