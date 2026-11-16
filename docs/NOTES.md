# Notes: metrics and the time split

For each known duplicate D we query the service with D's title and body and look at the ranked list
of earlier issues it returns. The "right answer" is the original issue O that maintainers pointed D to.

## hit@5
Share of queries whose original appears in the top 5 results.
Example: 4 duplicates; the original is found at rank 1, 3, 7 and not at all. Ranks 1 and 3 are
inside the top 5, so hit@5 = 2 / 4 = 0.50.

## hit@10
Same, with the top 10. In the example ranks 1, 3 and 7 are inside the top 10, so
hit@10 = 3 / 4 = 0.75. hit@10 is always >= hit@5.

## MRR (mean reciprocal rank)
For each query take 1 / rank of the original (0 if it is not returned), then average.
Example: (1/1 + 1/3 + 1/7 + 0) / 4 = (1 + 0.333 + 0.143 + 0) / 4 = 0.369.
MRR rewards putting the original first: rank 1 scores 1.0, rank 2 only 0.5, rank 10 only 0.1.
We compute it over the top 10 results (anything below rank 10 counts as 0).

## Why the split is by time
Two different "time" rules apply.

1. No looking into the future inside a query. When a real user files D, only issues created before
   D exist. So the search for D may only see issues with created_at < D.created_at, and never D
   itself. Without this filter the service could return later duplicates of the same bug (or D),
   which looks like a hit in an offline test but is impossible in production.
2. Tuning vs held-out split. Pairs are sorted by the duplicate's creation time; the older 70% are
   used for tuning and the newest 30% are evaluated once at the end. A random split would let us
   tune on pairs that are newer than some test pairs. Bugs come in waves (a release breaks
   something, 20 people report it), so a random split puts reports of the same wave on both sides
   and the test result is too optimistic. Splitting by time mimics real use: tune on the past,
   get judged on the future, where topics, wording and features have moved on.
