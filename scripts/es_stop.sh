#!/usr/bin/env bash
# Stop the local Elasticsearch node started by es_start.sh.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID="$ROOT/tools/es.pid"
[ -f "$PID" ] || { echo "not running (no pid file)"; exit 0; }
P="$(cat "$PID")"
kill "$P" 2>/dev/null || true
for _ in $(seq 1 60); do kill -0 "$P" 2>/dev/null || break; sleep 0.5; done
rm -f "$PID"
echo "stopped"
