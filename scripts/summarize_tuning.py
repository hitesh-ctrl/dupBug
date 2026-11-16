#!/usr/bin/env python3
"""Collect results/tuning/*.json (gitignored, one file per tuning run) into results/tuning_summary.json."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
runs = []
for f in sorted((ROOT / "results" / "tuning").glob("*.json"), key=lambda p: p.stat().st_mtime):
    if f.name.endswith(".failures.json"):
        continue
    m = json.loads(f.read_text())
    runs.append({"run": f.stem, "generated_at": m["generated_at"], "params": m["note"], **m["service"]["tuning"]})
out = {
    "note": "Every tuning run, in order. Tuning pairs only; held-out pairs were not evaluated in any of these runs. "
    "Runs 00-03 used an index with raw bodies; from 04 on bodies are stored without HTML comments.",
    "runs": runs,
}
(ROOT / "results" / "tuning_summary.json").write_text(json.dumps(out, indent=1) + "\n")
for r in runs:
    print(f"{r['run']:<26} hit@5 {r['hit_at_5']:.4f} hit@10 {r['hit_at_10']:.4f} MRR {r['mrr']:.4f}  {r['params']}")
