"""Ranking metrics. `ranks` holds, per query, the 1-based rank of the expected original or None."""
from __future__ import annotations

TOP_K = 10


def hit_at(ranks: list[int | None], k: int) -> float:
    return sum(1 for r in ranks if r is not None and r <= k) / len(ranks) if ranks else 0.0


def mrr(ranks: list[int | None], k: int = TOP_K) -> float:
    return sum(1.0 / r for r in ranks if r is not None and r <= k) / len(ranks) if ranks else 0.0


def summarize(ranks: list[int | None]) -> dict:
    return {
        "n": len(ranks),
        "hit_at_5": round(hit_at(ranks, 5), 4),
        "hit_at_10": round(hit_at(ranks, 10), 4),
        "mrr": round(mrr(ranks), 4),
    }


def percentile(values: list[float], p: float) -> float:
    """Nearest-rank percentile, p in (0, 100]."""
    if not values:
        return 0.0
    s = sorted(values)
    idx = max(0, -(-len(s) * p // 100) - 1)  # ceil(n*p/100) - 1
    return s[int(idx)]
