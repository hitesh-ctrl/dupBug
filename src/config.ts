// Search parameters. Tuned only against the older 70% of pairs (see logs and README).
export interface SearchParams {
  /** Boost of the title-vs-title match. */
  titleBoost: number;
  /** Weight of the body-vs-body match. */
  bodyWeight: number;
  /** Weight of matching the query title against stored bodies. */
  titleToBody: number;
  /** minimum_should_match for the title match ("" = Elasticsearch default). */
  minimumShouldMatch: string;
  /** Adds a more_like_this clause over title and body. */
  mlt: boolean;
  mltWeight: number;
  mltMaxQueryTerms: number;
}

export const DEFAULT_PARAMS: SearchParams = {
  titleBoost: 1,
  bodyWeight: 1,
  titleToBody: 1,
  minimumShouldMatch: "",
  mlt: false,
  mltWeight: 1,
  mltMaxQueryTerms: 25,
};

/** SEARCH_PARAMS (JSON) overrides single values; used by the tuning script only. */
export function loadParams(env: NodeJS.ProcessEnv = process.env): SearchParams {
  if (!env.SEARCH_PARAMS) return DEFAULT_PARAMS;
  return { ...DEFAULT_PARAMS, ...(JSON.parse(env.SEARCH_PARAMS) as Partial<SearchParams>) };
}

export const RESULT_SIZE = 10;
