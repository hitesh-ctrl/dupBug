#!/usr/bin/env python3
"""Fetch public issues (no pull requests) from one GitHub repository into data/ (gitignored).

Usage: python scripts/fetch_issues.py [--repo microsoft/terminal] [--count 8000] [--direction asc]

Writes:
  data/issues.jsonl           one issue per line (number, title, body, labels, state,
                              state_reason, created_at, url)
  data/comments/<number>.json comments of duplicate candidates (to find "duplicate of #N")
  manifest/issues_manifest.json  committed: repo, date, counts, issue numbers only
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
API = "https://api.github.com"


def load_token() -> str:
    tok = os.environ.get("GITHUB_TOKEN", "")
    env = ROOT / ".env"
    if not tok and env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("GITHUB_TOKEN="):
                tok = line.split("=", 1)[1].strip()
    if not tok:
        sys.exit("GITHUB_TOKEN missing: put it in .env (see .env.example)")
    return tok


def get(session: requests.Session, url: str, params: dict | None = None) -> requests.Response:
    """GET with backoff: honours Retry-After / X-RateLimit-Reset, retries 5xx exponentially."""
    delay = 2.0
    for attempt in range(8):
        try:
            r = session.get(url, params=params, timeout=30)
        except requests.RequestException as e:
            print(f"  network error {e!r}, retry in {delay:.0f}s", flush=True)
            time.sleep(delay)
            delay = min(delay * 2, 120)
            continue
        if r.status_code == 200:
            return r
        if r.status_code in (403, 429):
            retry_after = r.headers.get("Retry-After")
            remaining = r.headers.get("X-RateLimit-Remaining")
            if retry_after:
                wait = float(retry_after) + 1
            elif remaining == "0":
                wait = max(1.0, float(r.headers["X-RateLimit-Reset"]) - time.time() + 2)
            else:
                wait = delay
                delay = min(delay * 2, 120)
            print(f"  rate limited ({r.status_code}), waiting {wait:.0f}s", flush=True)
            time.sleep(wait)
            continue
        if r.status_code >= 500:
            print(f"  server error {r.status_code}, retry in {delay:.0f}s", flush=True)
            time.sleep(delay)
            delay = min(delay * 2, 120)
            continue
        r.raise_for_status()
    raise RuntimeError(f"giving up on {url}")


def is_dup_candidate(issue: dict) -> bool:
    return issue.get("state_reason") == "duplicate" or any(
        "duplicate" in label.lower() for label in issue["labels"]
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default="microsoft/terminal")
    ap.add_argument("--direction", default="asc", choices=["asc", "desc"],
                    help="asc = oldest issues first (window starts at the repository's first issue)")
    ap.add_argument("--count", type=int, default=8000)
    ap.add_argument("--from-manifest", action="store_true",
                    help="re-create data/issues.jsonl for exactly the issue numbers in the committed manifest "
                         "(no comments, manifest not rewritten); used by CI and for clean re-installs")
    ap.add_argument("--out-dir", default=str(DATA))
    args = ap.parse_args()
    out_dir = Path(args.out_dir)
    wanted: set[int] | None = None
    if args.from_manifest:
        m = json.loads((ROOT / "manifest" / "issues_manifest.json").read_text())
        args.repo, args.direction, args.count = m["repository"], m["direction"], m["issue_count"]
        wanted = set(m["issue_numbers"])

    s = requests.Session()
    s.headers.update(
        {
            "Authorization": f"Bearer {load_token()}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "dup-finder-fetch",
        }
    )
    out_dir.mkdir(exist_ok=True, parents=True)

    issues: list[dict] = []
    url: str | None = f"{API}/repos/{args.repo}/issues"
    params: dict | None = {"state": "all", "sort": "created", "direction": args.direction, "per_page": 100}
    pages = prs = 0
    while url and len(issues) < args.count:
        r = get(s, url, params)
        params = None  # the Link header already carries the query
        pages += 1
        for it in r.json():
            if "pull_request" in it:
                prs += 1
                continue
            if wanted is not None and it["number"] not in wanted:
                continue
            issues.append(
                {
                    "number": it["number"],
                    "title": it["title"] or "",
                    "body": it["body"] or "",
                    "labels": [l["name"] for l in it["labels"]],
                    "state": it["state"],
                    "state_reason": it.get("state_reason"),
                    "created_at": it["created_at"],
                    "url": it["html_url"],
                }
            )
        url = r.links.get("next", {}).get("url")
        if pages % 10 == 0:
            print(f"page {pages}: {len(issues)} issues, {prs} PRs skipped", flush=True)
    issues = issues[: args.count]
    with (out_dir / "issues.jsonl").open("w") as f:
        for it in issues:
            f.write(json.dumps(it, ensure_ascii=False) + "\n")
    print(f"issues: {len(issues)} (pages {pages}, PRs skipped {prs})", flush=True)

    if wanted is not None:
        missing = wanted - {it["number"] for it in issues}
        print(f"from manifest: {len(issues)} of {len(wanted)} issues found, {len(missing)} missing", flush=True)
        if missing:
            sys.exit(f"issues no longer available: {sorted(missing)[:20]}")
        return

    (out_dir / "comments").mkdir(exist_ok=True)
    cands = [it for it in issues if is_dup_candidate(it)]
    fetched = 0
    for i, it in enumerate(cands):
        out = out_dir / "comments" / f"{it['number']}.json"
        if out.exists():
            continue
        r = get(s, f"{API}/repos/{args.repo}/issues/{it['number']}/comments", {"per_page": 100})
        out.write_text(
            json.dumps(
                [
                    {"user": c["user"]["login"] if c.get("user") else None,
                     "created_at": c["created_at"], "body": c["body"] or ""}
                    for c in r.json()
                ],
                ensure_ascii=False,
            )
        )
        fetched += 1
        if fetched % 100 == 0:
            print(f"comments: {i + 1}/{len(cands)}", flush=True)
    print(f"duplicate candidates: {len(cands)} (comments fetched now: {fetched})", flush=True)

    created = sorted(it["created_at"] for it in issues)
    manifest = {
        "repository": args.repo,
        "fetched_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "direction": args.direction,
        "issue_count": len(issues),
        "pull_requests_skipped": prs,
        "duplicate_candidates": len(cands),
        "created_at_min": created[0],
        "created_at_max": created[-1],
        "issue_numbers": sorted(it["number"] for it in issues),
    }
    (ROOT / "manifest").mkdir(exist_ok=True)
    (ROOT / "manifest" / "issues_manifest.json").write_text(json.dumps(manifest) + "\n")
    print("manifest written", flush=True)


if __name__ == "__main__":
    main()
