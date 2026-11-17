# Final report

All numbers below are copied from `results/*.json` and `manifest/*.json` as produced by the final run from a clean
install (Elasticsearch data folder deleted, `node_modules` removed, new Python virtualenv).

## What was built

- A fetch script that pulls public issues of one repository (`microsoft/terminal`, the oldest 8,000 issues, pull
  requests excluded) through the GitHub REST API with backoff, and caches them outside version control.
- Ground-truth extraction: issues labelled or closed as duplicate whose comments contain exactly one
  `duplicate of #N` style reference to an older issue in the data. 2,600 candidates gave 1,886 pairs
  (503 had no reference, 133 named several originals, 52 pointed to a newer issue, 24 pointed outside the data,
  2 were removed after manual reading). Pairs are split by time: 1,320 for tuning, 566 held out (from 2020-08-26).
- An indexer (Elasticsearch 8.19.25, single node, `english` analyzer on title and body, HTML comments removed from bodies).
- `POST /similar` (Express, zod): four `match` clauses (title/title, title/body, body/body, body/title) plus a
  mandatory `created_at < before` filter; returns up to 10 issues.
- An evaluation script (hit@5, hit@10, MRR, naive baseline, failure list, local latency), a regression gate, a CI
  workflow, and three planted bugs behind flags.

## What was tested, and the result

| check | result |
|---|---|
| API tests (vitest + supertest, real Elasticsearch): shape, validation, hostile strings, 503 when Elasticsearch is down, no-future, stemming, query structure, demo page served | 38 of 38 pass |
| Unit tests for metrics, reference patterns, split and gate logic (pytest) | 25 of 25 pass |
| Tuning pairs (n=1,320): hit@5 / hit@10 / MRR | 0.2955 / 0.3788 / 0.1967 (naive 0.1742 / 0.2455 / 0.1206) |
| Held-out pairs (n=566): hit@5 / hit@10 / MRR | 0.2208 / 0.3074 / 0.1429 (naive 0.1396 / 0.1767 / 0.0981) |
| No-future rule during evaluation (every returned issue older than the query issue) | held for all 1,886 queries |
| Label spot check | 28 of 30 sampled pairs correct |
| Planted bugs | first pass 3 of 3, final 3 of 3 |
| Gate on the baseline | pass; fails with 282 listed problems on a deliberate regression (`results/gate_demo.txt`) |
| Local latency of `/similar` (n=1,886, sequential, same machine) | p50 3.6 ms, p95 6.2 ms |
| Reproducibility | clean-install run gave per-pair ranks identical to `results/baseline.json` |

Reading the main result: the original report is in the top 10 for about 31% of held-out duplicates, against about 18%
for a title-only search. The original is missing from the top 10 for 392 of 566 held-out pairs and 820 of 1,320
tuning pairs (`results/failures.json`). Held-out results are lower than tuning results on every metric.

## What was NOT tested

- **One repository only.** Parameters and the template clean-up were chosen on `microsoft/terminal`. Nothing is known
  about other projects, other issue templates or other languages.
- **Noisy duplicate labels.** The spot check covered 30 of 1,925 pairs and was done by the AI assistant that built the
  project, not by a maintainer. 2 of 30 were doubtful. Duplicates closed without a numbered reference (503 candidates)
  are absent, and only precision of the labels was checked.
- **Scoring is strict and the pair set is skewed.** Only the one issue named by the maintainer counts as a hit; returning
  another earlier report of the same bug counts as a miss. 957 of the 1,886 pairs point to an original that has five or
  more duplicates (681 distinct originals in total), so a few large tracking issues weigh heavily.
- **Issue text only.** No labels, comments, stack traces, screenshots, version numbers or links are used. Several
  spot-checked pairs share a root cause but almost no wording; text search cannot find those.
- **No user feedback.** Whether the returned list helps a person filing or triaging a bug was not measured.
- **Single node, small index.** 8,000 documents on one local node with security disabled. No test of larger indexes,
  concurrent load, index updates while serving, or failure and recovery beyond "Elasticsearch unreachable gives 503".
- **Local latency only.** Client and server on one laptop, sequential requests; no network, no concurrency.
- **CI was not executed.** `.github/workflows/ci.yml` was written and parses as YAML, and the container image tag exists,
  but nothing was pushed, so the workflow has never run.
- **The gate threshold.** Title-boost and stemming bugs changed tuning MRR by -0.0061 and -0.0114, below the 0.02
  threshold. They were caught in the first pass only by the per-pair rule.
- **Statistical uncertainty.** No confidence intervals were computed. With 566 held-out pairs the standard error of
  hit@10 is roughly 0.02; tuning differences of a few thousandths are not meaningful.

## Added after the final run

A static demo page (`public/index.html`, served by the API at `/`) was added at the owner's request; the original scope
had no web page. It was checked by hand in a browser with one example query (ten results, no console errors) and by one
API test. It has no automated browser tests, and it changes nothing in the search or the measured numbers.

## Open issues

1. CI depends on re-fetching issue text. If upstream text is edited or issues are deleted, CI metrics can drift from the
   committed baseline and the gate can fail without a code change.
2. `npm audit` reports one high-severity advisory for zod 3.25.76 (GHSA-mrhx-c7xc-m3w5, memory use when validating
   oversized collections). The API validates two length-limited strings behind a 64 kB body limit; the impact here was
   not analysed further. The fix is a major-version upgrade.
3. The local Elasticsearch config disables security and the disk-watermark check. It is for local development only.
4. The fetch for this build used the developer's GitHub CLI token passed through the environment (not written to
   disk), which has wider scopes than the read-only token the README asks for.
5. More-like-this and minimum-should-match did not help on the tuning pairs and are off; the code paths remain.
6. The `before` cutoff is a query parameter because the JSON body is restricted to title and body.
7. Removing the time filter lowered the scores on this data (tuning MRR 0.0701) instead of raising them; the case where
   a missing filter inflates scores was therefore not observed, only guarded against by the no-future tests.
