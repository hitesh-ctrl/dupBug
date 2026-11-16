"""Unit tests for the metric maths, pair extraction rules and the gate (no network)."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gate  # noqa: E402
import pairs  # noqa: E402
from metrics import hit_at, mrr, percentile, summarize  # noqa: E402

RANKS = [1, 3, 7, None]  # the worked example in docs/NOTES.md


def test_worked_example_from_notes():
    assert hit_at(RANKS, 5) == 0.5
    assert hit_at(RANKS, 10) == 0.75
    assert mrr(RANKS) == pytest.approx((1 + 1 / 3 + 1 / 7) / 4)
    assert summarize(RANKS) == {"n": 4, "hit_at_5": 0.5, "hit_at_10": 0.75, "mrr": 0.369}


def test_ranks_beyond_ten_count_as_miss():
    assert mrr([11]) == 0.0 and hit_at([11], 10) == 0.0


def test_empty():
    assert summarize([])["mrr"] == 0.0


def test_percentile_nearest_rank():
    v = list(range(1, 101))
    assert percentile(v, 50) == 50 and percentile(v, 95) == 95 and percentile([7.0], 95) == 7.0


@pytest.mark.parametrize(
    "text,expected",
    [
        ("/dup #123", {123}),
        ("/dupe #123", {123}),
        ("/duplicate #123", {123}),
        ("Duplicate of #123", {123}),
        ("This is a dupe of #45, thanks!", {45}),
        ("duplicate of https://github.com/microsoft/terminal/issues/99", {99}),
        ("duplicate of https://github.com/other/repo/issues/99", set()),
        ("/dup #1 and also /dup #2", {1, 2}),
        ("This is not a duplicate of #123", set()),
        ("Might be a duplicate of #123", set()),
        ("Is this a duplicate of #123?", {123}),  # hedge only looks backwards; "Is this" is not a hedge word
        ("so this is a /dupe of #531, #3411", {531, 3411}),
        ("/dup #878, #4287, and #6132.", {878, 4287, 6132}),
        ("/dup #5 or #6", {5, 6}),
        ("/dup #5. See also #6", {5}),
        ("see #123", set()),
        ("fixed in #123", set()),
    ],
)
def test_reference_patterns(text, expected):
    assert pairs.referenced_originals(text, "microsoft/terminal") == expected


def test_split_is_by_time_70_30():
    ps = [{"duplicate": i, "original": 0, "created_at": f"2020-01-{i:02d}"} for i in range(1, 11)]
    tune, held = pairs.split(ps)
    assert len(tune) == 7 and len(held) == 3
    assert max(p["created_at"] for p in tune) < min(p["created_at"] for p in held)


def _m(mrr_value, rows):
    return {"service": {"tuning": {"mrr": mrr_value, "hit_at_10": 0}}, "pairs": {"tuning": rows}}


def test_gate_passes_when_equal_or_better():
    base = _m(0.50, [[1, 2, 3], [4, 5, None]])
    assert gate.compare(base, _m(0.49, [[1, 2, 10], [4, 5, None]])) == []
    assert gate.compare(base, _m(0.60, [[1, 2, 1], [4, 5, 1]])) == []


def test_gate_fails_on_mrr_drop():
    assert len(gate.compare(_m(0.50, []), _m(0.47, []))) == 1


def test_gate_fails_when_a_passing_pair_breaks_even_if_mrr_improves():
    base = _m(0.50, [[1, 2, 3], [4, 5, None]])
    problems = gate.compare(base, _m(0.70, [[1, 2, None], [4, 5, 1]]))
    assert len(problems) == 1 and "#1" in problems[0] and "#2" in problems[0]
