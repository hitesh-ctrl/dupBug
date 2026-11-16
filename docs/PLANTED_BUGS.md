# Planted bugs

Three bugs sit behind environment flags in `src/flags.ts`, all off by default. `scripts/planted_bugs.sh <label>` turns each on and runs the API tests, the evaluation and the gate.

| flag | effect |
|---|---|
| `BUG_NO_TITLE_BOOST=1` | title match loses its boost |
| `BUG_NO_STEMMING=1` | index built with the `standard` analyzer (needs re-index; the script does it) |
| `BUG_NO_TIME_FILTER=1` | created_at cutoff not applied |

## First pass (no tests added): caught 3 of 3

| bug | caught by | tuning MRR change | pairs broken in gate |
|---|---|---|---|
| `BUG_NO_TITLE_BOOST=1` | gate | -0.0061 | 62 |
| `BUG_NO_STEMMING=1` | gate | -0.0114 | 114 |
| `BUG_NO_TIME_FILTER=1` | api_tests, evaluation | None | 0 |

Caveats: the title-boost and stemming bugs passed all API tests and their MRR drops were below the gate's 0.02 threshold; they were caught only by the gate rule that a baseline-passing pair must not fail. That rule needs the issue data. For the time filter, the evaluation aborted on its own future-leak check, so the gate had no metrics to compare and is not counted.

Time filter removed, leak check turned into a counter (`--count-leaks`): tuning MRR 0.0701 vs baseline 0.1967; 1886 queries returned newer or same issues. On this data the scores got worse, not better, mainly because the query issue itself takes a slot. The dedicated no-future test is still what catches it independent of scores.

## Final (after adding tests): caught 3 of 3

Added `tests/query.test.ts` (query structure: cutoff filter, title boost, match-only clauses) and a stemming API test.

| bug | caught by |
|---|---|
| `BUG_NO_TITLE_BOOST=1` | api_tests, gate |
| `BUG_NO_STEMMING=1` | api_tests, gate |
| `BUG_NO_TIME_FILTER=1` | api_tests, evaluation |

## Gate demonstration

A deliberate regression (body clauses switched off in `src/config.ts`) was evaluated; the gate failed and listed the broken pairs. Full output: `results/gate_demo.txt`. The change was reverted with `git checkout` and the gate passed again.
