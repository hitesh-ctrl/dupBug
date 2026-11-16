#!/usr/bin/env bash
# Start the API on a local port, run the evaluation against it, stop the API.
# Usage: scripts/run_eval.sh [evaluate.py arguments...]     e.g. scripts/run_eval.sh --final
# Environment (SEARCH_PARAMS, BUG_* flags, ES_URL, ES_INDEX, PORT) is passed on to the server.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PORT="${PORT:-3187}"
PY="${PYTHON:-$ROOT/.venv/bin/python}"
PORT="$PORT" node --import tsx src/server.ts >"${SERVER_LOG:-/dev/null}" 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
for _ in $(seq 1 100); do
  curl -fs "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break
  kill -0 "$SERVER_PID" 2>/dev/null || { echo "server exited early" >&2; exit 1; }
  sleep 0.2
done
"$PY" eval/evaluate.py --api "http://127.0.0.1:$PORT" --es "${ES_URL:-http://127.0.0.1:9200}" "$@"
