#!/usr/bin/env python3
"""Regression gate: compare results/metrics.json with results/baseline.json.

Fails (exit 1) if
  - tuning MRR dropped by more than 0.02, or
  - any pair that passed in the baseline (original in the top 10) now fails.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAX_MRR_DROP = 0.02


def passed(rank) -> bool:
    return rank is not None and rank <= 10


def compare(baseline: dict, current: dict) -> list[str]:
    problems = []
    b, c = baseline["service"]["tuning"]["mrr"], current["service"]["tuning"]["mrr"]
    if b - c > MAX_MRR_DROP:
        problems.append(f"tuning MRR dropped by {b - c:.4f} (baseline {b:.4f} -> now {c:.4f}, allowed {MAX_MRR_DROP})")
    for split, rows in baseline["pairs"].items():
        if split not in current["pairs"]:
            continue  # e.g. held-out pairs not evaluated in this run
        now = {(d, o): r for d, o, r in current["pairs"][split]}
        for d, o, r in rows:
            if not passed(r):
                continue
            if (d, o) not in now:
                problems.append(f"[{split}] pair duplicate #{d} -> original #{o}: missing from current results")
            elif not passed(now[(d, o)]):
                problems.append(f"[{split}] pair duplicate #{d} -> original #{o}: was rank {r}, now not in top 10")
    return problems


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", default="results/baseline.json")
    ap.add_argument("--current", default="results/metrics.json")
    args = ap.parse_args()
    for p in (args.baseline, args.current):
        if not (ROOT / p).exists():
            print(f"GATE FAIL: {p} does not exist")
            sys.exit(1)
    baseline = json.loads((ROOT / args.baseline).read_text())
    current = json.loads((ROOT / args.current).read_text())
    problems = compare(baseline, current)
    b, c = baseline["service"]["tuning"], current["service"]["tuning"]
    print(f"tuning MRR baseline {b['mrr']:.4f} -> now {c['mrr']:.4f}; hit@10 {b['hit_at_10']:.4f} -> {c['hit_at_10']:.4f}")
    if problems:
        print(f"GATE FAIL: {len(problems)} problem(s)")
        for p in problems:
            print("  - " + p)
        sys.exit(1)
    print("GATE PASS")


if __name__ == "__main__":
    main()
