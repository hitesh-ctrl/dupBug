#!/usr/bin/env python3
"""Evaluate the running /similar service against known duplicate pairs.

For every (duplicate, original) pair the service is queried with the duplicate's title and body and
`before` = the duplicate's created_at. We record the rank of the original (top 10) and compute
hit@5, hit@10 and MRR. A naive baseline (title-only match on an index with default settings) is
computed by the same script, with the same created_at filter.

Default: tuning pairs only. The held-out pairs are evaluated only with --final.

Usage: python eval/evaluate.py [--final] [--out results/metrics.json]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from metrics import percentile, summarize  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
NAIVE_INDEX = "issues_naive"
TITLE_MAX, BODY_MAX = 200, 5000


def load_issues() -> dict[int, dict]:
    path = ROOT / "data" / "issues.jsonl"
    if not path.exists():
        sys.exit("data/issues.jsonl missing: run scripts/fetch_issues.py first")
    with path.open() as f:
        return {i["number"]: i for i in map(json.loads, f)}


def ensure_naive_index(es: str, issues: dict[int, dict]) -> None:
    """Title-only index with Elasticsearch defaults (dynamic mapping, standard analyzer)."""
    r = requests.get(f"{es}/{NAIVE_INDEX}/_count", timeout=10)
    if r.status_code == 200 and r.json()["count"] == len(issues):
        return
    requests.delete(f"{es}/{NAIVE_INDEX}", timeout=30)
    lines = []
    for i in issues.values():
        lines.append(json.dumps({"index": {"_id": str(i["number"])}}))
        lines.append(json.dumps({"number": i["number"], "title": i["title"], "created_at": i["created_at"]}))
    r = requests.post(
        f"{es}/{NAIVE_INDEX}/_bulk?refresh=true",  # explicit refresh, no sleep
        data=("\n".join(lines) + "\n").encode(),
        headers={"Content-Type": "application/x-ndjson"},
        timeout=120,
    )
    r.raise_for_status()
    if r.json()["errors"]:
        sys.exit("bulk indexing of naive index reported errors")


def query_service(api: str, dup: dict) -> tuple[list[int], float]:
    t0 = time.perf_counter()
    r = requests.post(
        f"{api}/similar",
        params={"before": dup["created_at"]},
        json={"title": dup["title"][:TITLE_MAX], "body": dup["body"][:BODY_MAX]},
        timeout=30,
    )
    ms = (time.perf_counter() - t0) * 1000
    if r.status_code != 200:
        sys.exit(f"/similar returned {r.status_code} for #{dup['number']}: {r.text[:200]}")
    return [x["number"] for x in r.json()["results"]], ms


def query_naive(es: str, dup: dict) -> list[int]:
    body = {
        "size": 10,
        "_source": False,
        "query": {
            "bool": {
                "must": {"match": {"title": dup["title"][:TITLE_MAX]}},
                "filter": {"range": {"created_at": {"lt": dup["created_at"]}}},
            }
        },
    }
    r = requests.post(f"{es}/{NAIVE_INDEX}/_search", json=body, timeout=30)
    r.raise_for_status()
    return [int(h["_id"]) for h in r.json()["hits"]["hits"]]


def rank_of(original: int, returned: list[int]) -> int | None:
    return returned.index(original) + 1 if original in returned else None


def run_split(name: str, pairs: list[list[int]], issues: dict[int, dict], api: str, es: str):
    rows, naive_rows, failures, lat = [], [], [], []
    for dup_n, orig_n in pairs:
        dup = issues[dup_n]
        returned, ms = query_service(api, dup)
        lat.append(ms)
        newer = [n for n in returned if issues[n]["created_at"] >= dup["created_at"]]
        if newer:
            sys.exit(f"FUTURE LEAK: query #{dup_n} returned newer or same issue(s) {newer}")
        rank = rank_of(orig_n, returned)
        rows.append([dup_n, orig_n, rank])
        naive_rows.append([dup_n, orig_n, rank_of(orig_n, query_naive(es, dup))])
        if rank is None:
            failures.append({"split": name, "duplicate": dup_n, "expected_original": orig_n, "returned": returned})
    return rows, naive_rows, failures, lat


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://127.0.0.1:3187")
    ap.add_argument("--es", default="http://127.0.0.1:9200")
    ap.add_argument("--final", action="store_true", help="also evaluate the held-out pairs")
    ap.add_argument("--out", default="results/metrics.json")
    ap.add_argument("--failures", default="results/failures.json")
    ap.add_argument("--note", default="")
    args = ap.parse_args()

    issues = load_issues()
    manifest = json.loads((ROOT / "manifest" / "pairs.json").read_text())
    try:
        ensure_naive_index(args.es, issues)
        requests.get(f"{args.api}/health", timeout=5).raise_for_status()
    except requests.RequestException as e:
        sys.exit(f"service or Elasticsearch not reachable: {e}")

    out: dict = {
        "generated_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "repository": manifest["repository"],
        "note": args.note,
        "top_k": 10,
        "service": {},
        "naive_baseline": {},
        "improvement_over_naive": {},
        "pairs": {},
        "naive_pairs": {},
    }
    failures, latencies = [], []
    for name in ["tuning"] + (["heldout"] if args.final else []):
        rows, naive_rows, fails, lat = run_split(name, manifest[name], issues, args.api, args.es)
        s = summarize([r[2] for r in rows])
        n = summarize([r[2] for r in naive_rows])
        out["service"][name] = s
        out["naive_baseline"][name] = n
        out["improvement_over_naive"][name] = {
            k: round(s[k] - n[k], 4) for k in ("hit_at_5", "hit_at_10", "mrr")
        }
        out["pairs"][name] = rows
        out["naive_pairs"][name] = naive_rows
        failures += fails
        latencies += lat
    out["latency_ms_local"] = {
        "n": len(latencies),
        "p50": round(percentile(latencies, 50), 1),
        "p95": round(percentile(latencies, 95), 1),
        "note": "client-side, localhost, sequential requests; not a network measurement",
    }
    (ROOT / args.out).parent.mkdir(exist_ok=True, parents=True)
    (ROOT / args.out).write_text(json.dumps(out, indent=1) + "\n")
    (ROOT / args.failures).write_text(json.dumps(failures, indent=1) + "\n")
    print(json.dumps({k: out[k] for k in ("service", "naive_baseline", "improvement_over_naive", "latency_ms_local")}, indent=1))
    print(f"failures (original not in top 10): {len(failures)} -> {args.failures}")


if __name__ == "__main__":
    main()
