/**
 * Planted bugs for testing the test suite (docs/PLANTED_BUGS.md). All off by default.
 * Each is switched on with an environment variable set to "1".
 */
export interface BugFlags {
  /** BUG_NO_TITLE_BOOST: the title match loses its boost. */
  noTitleBoost: boolean;
  /** BUG_NO_STEMMING: the index is created with the `standard` analyzer instead of `english`. */
  noStemming: boolean;
  /** BUG_NO_TIME_FILTER: the created_at cutoff is not applied. */
  noTimeFilter: boolean;
}

export function loadFlags(env: NodeJS.ProcessEnv = process.env): BugFlags {
  return {
    noTitleBoost: env.BUG_NO_TITLE_BOOST === "1",
    noStemming: env.BUG_NO_STEMMING === "1",
    noTimeFilter: env.BUG_NO_TIME_FILTER === "1",
  };
}
