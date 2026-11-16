#!/usr/bin/env bash
# Turn each planted bug on, run the three checks (API tests, evaluation, gate) and record the outcome.
# Usage: scripts/planted_bugs.sh <label>     -> results/planted/<label>.json   (label: first_pass | final)
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
LABEL="${1:?label}"
PY="${PYTHON:-$ROOT/.venv/bin/python}"
OUT="$ROOT/results/planted"; mkdir -p "$OUT"
ROWS=()
for BUG in BUG_NO_TITLE_BOOST BUG_NO_STEMMING BUG_NO_TIME_FILTER; do
  echo "=== $BUG=1"
  export "$BUG=1"
  [ "$BUG" = BUG_NO_STEMMING ] && npm run -s index
  npx vitest run >"$OUT/$LABEL.$BUG.api.log" 2>&1; API=$?
  rm -f "$OUT/$LABEL.$BUG.metrics.json"
  scripts/run_eval.sh --final --out "results/planted/$LABEL.$BUG.metrics.json" \
    --failures "results/planted/$LABEL.$BUG.failures.json" >"$OUT/$LABEL.$BUG.eval.log" 2>&1; EVAL=$?
  "$PY" eval/gate.py --current "results/planted/$LABEL.$BUG.metrics.json" >"$OUT/$LABEL.$BUG.gate.log" 2>&1; GATE=$?
  unset "$BUG"
  [ "$BUG" = BUG_NO_STEMMING ] && npm run -s index
  echo "api tests exit $API | evaluation exit $EVAL | gate exit $GATE"
  grep -E "Tests |FAIL " "$OUT/$LABEL.$BUG.api.log" | head -6
  tail -1 "$OUT/$LABEL.$BUG.eval.log" | cut -c1-200
  head -3 "$OUT/$LABEL.$BUG.gate.log" | cut -c1-200
  ROWS+=("{\"bug\":\"$BUG\",\"api_tests_exit\":$API,\"evaluation_exit\":$EVAL,\"gate_exit\":$GATE}")
done
"$PY" - "$LABEL" "${ROWS[@]}" <<'PY'
import json, sys
from pathlib import Path
label, rows = sys.argv[1], [json.loads(r) for r in sys.argv[2:]]
root = Path("results/planted")
for r in rows:
    mf = root / f"{label}.{r['bug']}.metrics.json"
    r["metrics"] = json.loads(mf.read_text())["service"] if mf.exists() else None
    if r["metrics"] is None:
        r["gate_exit"] = None  # evaluation aborted, so the gate had nothing to compare: not an independent catch
    r["caught_by"] = [n for n, k in (("api_tests", "api_tests_exit"), ("evaluation", "evaluation_exit"), ("gate", "gate_exit")) if r[k]]
    eval_log = (root / f"{label}.{r['bug']}.eval.log").read_text().strip().splitlines()
    r["evaluation_last_line"] = eval_log[-1][:120] if r["evaluation_exit"] else ""
    api_log = (root / f"{label}.{r['bug']}.api.log").read_text()
    r["api_tests_failed"] = sorted({l.split(" > ", 1)[1].strip() for l in api_log.splitlines() if l.strip().startswith("FAIL") and " > " in l})
    base = json.loads(Path("results/baseline.json").read_text())["service"]
    r["tuning_mrr_change"] = round(r["metrics"]["tuning"]["mrr"] - base["tuning"]["mrr"], 4) if r["metrics"] else None
    gate_log = (root / f"{label}.{r['bug']}.gate.log").read_text()
    r["gate_problem_count"] = sum(1 for line in gate_log.splitlines() if line.startswith("  - "))
    r["caught"] = bool(r["caught_by"])
out = {"label": label, "total": len(rows), "caught": sum(r["caught"] for r in rows), "bugs": rows}
(root / f"{label}.json").write_text(json.dumps(out, indent=1) + "\n")
print(json.dumps({"label": label, "caught": out["caught"], "total": out["total"], "by": {r["bug"]: r["caught_by"] for r in rows}}))
PY
