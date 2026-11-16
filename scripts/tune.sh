#!/usr/bin/env bash
# One tuning run on the TUNING pairs only (never --final): scripts/tune.sh <name> '<SEARCH_PARAMS json>'
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="$1"; PARAMS="${2:-{\}}"
mkdir -p "$ROOT/results/tuning"
SEARCH_PARAMS="$PARAMS" "$ROOT/scripts/run_eval.sh" --out "results/tuning/$NAME.json" \
  --failures "results/tuning/$NAME.failures.json" --note "$PARAMS" >/dev/null
"${PYTHON:-$ROOT/.venv/bin/python}" - "$ROOT/results/tuning/$NAME.json" "$NAME" "$PARAMS" <<'PY'
import json, sys
m = json.load(open(sys.argv[1]))["service"]["tuning"]
print(f"{sys.argv[2]:<28} hit@5 {m['hit_at_5']:.4f}  hit@10 {m['hit_at_10']:.4f}  MRR {m['mrr']:.4f}   {sys.argv[3]}")
PY
