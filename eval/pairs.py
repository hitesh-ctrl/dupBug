#!/usr/bin/env python3
"""Extract (duplicate, original) pairs and split them by time.

A candidate duplicate is an issue with a label containing "duplicate" or closed with
state_reason == "duplicate". The original comes from an explicit "duplicate of #N" style
reference in the candidate's comments. A pair is kept only if:
  - exactly one distinct original is referenced (otherwise ambiguous -> dropped)
  - the original is in the fetched data and was created before the duplicate

Writes manifest/pairs.json (issue numbers only).
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
TUNE_FRACTION = 0.7

# "/duplicate #1", "/duplicate of #1", "Duplicate of #1", "dupe of https://github.com/o/r/issues/1"
DUP_REF = re.compile(
    r"(?<![a-z])(?:duplicates?|dupe?)\s+(?:of\s+)?:?\s*"
    r"(?:#(\d+)|https://github\.com/([\w.-]+/[\w.-]+)/issues/(\d+))",
    re.IGNORECASE,
)
# "/dup #1, #2 and #3": further numbers in the same list (found by the manual spot check)
LIST_CONT = re.compile(r"\s*(?:,\s*(?:and\s+)?|and\s+|&\s*|or\s+|/\s*)#(\d+)", re.IGNORECASE)
# "not a duplicate of #1", "might be a duplicate of", "possible duplicate of" are not statements of fact
HEDGE = re.compile(r"(?:\bnot\b|n't|\bmight\b|\bmaybe\b|\bpossibl[ey]\b|\bprobably\b|\bcould\b|\bmay\b|\bseems\b|\bif\b|\?)[^.\n]{0,40}$", re.IGNORECASE)


def load_issues() -> dict[int, dict]:
    with (DATA / "issues.jsonl").open() as f:
        return {i["number"]: i for i in map(json.loads, f)}


def is_candidate(issue: dict) -> bool:
    return issue.get("state_reason") == "duplicate" or any(
        "duplicate" in l.lower() for l in issue["labels"]
    )


def referenced_originals(text: str, repo: str) -> set[int]:
    out: set[int] = set()
    for m in DUP_REF.finditer(text):
        if HEDGE.search(text[max(0, m.start() - 60): m.start()]):
            continue
        if m.group(1):
            out.add(int(m.group(1)))
            pos = m.end()
            while (nxt := LIST_CONT.match(text, pos)):
                out.add(int(nxt.group(1)))
                pos = nxt.end()
        elif m.group(2).lower() == repo.lower():
            out.add(int(m.group(3)))
    return out


def extract(issues: dict[int, dict], repo: str) -> tuple[list[dict], Counter]:
    stats: Counter = Counter()
    pairs = []
    for num, issue in issues.items():
        if not is_candidate(issue):
            continue
        stats["candidates"] += 1
        cfile = DATA / "comments" / f"{num}.json"
        comments = json.loads(cfile.read_text()) if cfile.exists() else []
        refs: set[int] = set()
        for c in comments:
            refs |= referenced_originals(c["body"], repo)
        refs.discard(num)
        if not refs:
            stats["dropped_no_reference"] += 1
            continue
        if len(refs) > 1:
            stats["dropped_ambiguous_multiple_originals"] += 1
            continue
        orig = refs.pop()
        if orig not in issues:
            stats["dropped_original_not_in_data"] += 1
            continue
        if issues[orig]["created_at"] >= issue["created_at"]:
            stats["dropped_original_not_older"] += 1
            continue
        stats["kept"] += 1
        pairs.append({"duplicate": num, "original": orig, "created_at": issue["created_at"]})
    pairs.sort(key=lambda p: (p["created_at"], p["duplicate"]))
    return pairs, stats


def split(pairs: list[dict]) -> tuple[list[dict], list[dict]]:
    cut = int(len(pairs) * TUNE_FRACTION)
    return pairs[:cut], pairs[cut:]


def main() -> None:
    manifest = json.loads((ROOT / "manifest" / "issues_manifest.json").read_text())
    issues = load_issues()
    pairs, stats = extract(issues, manifest["repository"])
    excl_file = ROOT / "manifest" / "excluded_pairs.json"
    excluded = {e["duplicate"] for e in json.loads(excl_file.read_text())} if excl_file.exists() else set()
    before = len(pairs)
    pairs = [p for p in pairs if p["duplicate"] not in excluded]
    stats["dropped_after_manual_check"] = before - len(pairs)
    stats["kept"] = len(pairs)
    tune, held = split(pairs)
    strip = lambda ps: [[p["duplicate"], p["original"]] for p in ps]
    out = {
        "repository": manifest["repository"],
        "stats": dict(stats),
        "split": {
            "rule": "sorted by duplicate created_at; oldest 70% tuning, newest 30% held-out",
            "tuning_count": len(tune),
            "heldout_count": len(held),
            "heldout_starts_at": held[0]["created_at"] if held else None,
        },
        "tuning": strip(tune),
        "heldout": strip(held),
    }
    (ROOT / "manifest" / "pairs.json").write_text(json.dumps(out, indent=1) + "\n")
    print(json.dumps({k: out[k] for k in ("stats", "split")}, indent=1))


if __name__ == "__main__":
    main()
