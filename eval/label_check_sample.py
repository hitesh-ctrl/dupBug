#!/usr/bin/env python3
"""Print 30 random pairs (fixed seed) for the manual spot check in docs/LABEL_CHECK.md.

Output contains issue text, so it goes to stdout / data/ only and is never committed.
Sampling is done on the pairs BEFORE manual exclusions, so the check measures the extraction.
"""
from __future__ import annotations

import json
import random
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pairs as P  # noqa: E402

SEED, N = 20261117, 30


def clean(text: str, n: int) -> str:
    """Drop HTML comments (issue template boilerplate) and collapse whitespace, for reading only."""
    return ' '.join(re.sub(r'<!--.*?-->', ' ', text, flags=re.S).split())[:n]


def main() -> None:
    issues = P.load_issues()
    manifest = json.loads((P.ROOT / "manifest" / "issues_manifest.json").read_text())
    all_pairs, _ = P.extract(issues, manifest["repository"])
    sample = random.Random(SEED).sample(all_pairs, N)
    for k, p in enumerate(sample, 1):
        d, o = issues[p["duplicate"]], issues[p["original"]]
        comments = json.loads((P.DATA / "comments" / f"{d['number']}.json").read_text())
        ref = [c for c in comments if P.referenced_originals(c["body"], manifest["repository"])]
        print(f"\n===== {k}. DUP #{d['number']} ({d['created_at'][:10]}) -> ORIG #{o['number']} ({o['created_at'][:10]})")
        print(f"DUP  title: {d['title']}\nDUP  body : {clean(d['body'], 600)}")
        print(f"ORIG title: {o['title']}\nORIG body : {clean(o['body'], 600)}")
        for c in ref:
            print(f"REF by {c['user']}: {clean(c['body'], 300)}")


if __name__ == "__main__":
    main()
