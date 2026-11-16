import type { SearchParams } from "./config.js";

export interface SimilarInput {
  title: string;
  body: string;
}

/** Upper bound of query terms taken from the body. Elasticsearch rejects queries above 4096 clauses. */
export const MAX_BODY_TERMS = 1500;

/**
 * Cuts `text` after about `budget` analysed terms. ASCII/Latin words count once; every other character
 * (CJK, emoji, ...) is counted as its own term, because the tokenizer emits one token per such character.
 */
export function limitTerms(text: string, budget: number): string {
  let terms = 0;
  let inWord = false;
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp > 0x024f) {
      terms++;
      inWord = false;
    } else if (/[\p{L}\p{N}]/u.test(ch)) {
      if (!inWord) terms++;
      inWord = true;
    } else {
      inWord = false;
    }
    if (terms > budget) break;
    out += ch;
  }
  return out;
}

/**
 * Builds the Elasticsearch query. User text is only ever placed in the `query` / `like` value of
 * match and more_like_this clauses, which analyse it as plain text. No query_string, no raw JSON.
 * `before` is always applied: only issues created strictly before it can be returned.
 */
export function buildQuery(input: SimilarInput, before: string, p: SearchParams): Record<string, unknown> {
  const title = input.title;
  const body = limitTerms(input.body, MAX_BODY_TERMS);
  const titleMatch: Record<string, unknown> = { query: title, boost: p.titleBoost };
  if (p.minimumShouldMatch) titleMatch.minimum_should_match = p.minimumShouldMatch;

  const should: Record<string, unknown>[] = [
    { match: { title: titleMatch } },
    { match: { body: { query: title, boost: p.titleToBody } } },
  ];
  if (body.trim().length > 0) {
    should.push({ match: { body: { query: body, boost: p.bodyWeight } } });
  }
  if (p.mlt) {
    should.push({
      more_like_this: {
        fields: ["title", "body"],
        like: `${title}\n${body}`,
        min_term_freq: 1,
        min_doc_freq: 2,
        max_query_terms: p.mltMaxQueryTerms,
        boost: p.mltWeight,
      },
    });
  }
  return {
    bool: {
      filter: [{ range: { created_at: { lt: before } } }],
      should,
      minimum_should_match: 1,
    },
  };
}
