// Added in Phase 4 after the first planted-bug pass: structural checks on the query that is sent to
// Elasticsearch. They need no index, so they also run where the evaluation data is not available.
import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS } from "../src/config.js";
import { buildQuery, limitTerms } from "../src/query.js";

const BEFORE = "2020-01-05T00:00:00Z";
const q = buildQuery({ title: "title words", body: "body words" }, BEFORE, DEFAULT_PARAMS) as {
  bool: { filter: unknown[]; should: Record<string, any>[]; minimum_should_match: number };
};

describe("buildQuery", () => {
  it("always filters on created_at strictly before the cutoff", () => {
    expect(q.bool.filter).toEqual([{ range: { created_at: { lt: BEFORE } } }]);
  });

  it("boosts the title-to-title match above every other clause", () => {
    const boosts = q.bool.should.map((c) => {
      const [field, spec] = Object.entries(c.match)[0] as [string, { query: string; boost: number }];
      return { field, query: spec.query, boost: spec.boost };
    });
    const titleTitle = boosts.find((b) => b.field === "title" && b.query === "title words")!;
    expect(titleTitle.boost).toBe(DEFAULT_PARAMS.titleBoost);
    expect(DEFAULT_PARAMS.titleBoost).toBeGreaterThan(1);
    for (const other of boosts.filter((b) => b !== titleTitle)) {
      expect(titleTitle.boost).toBeGreaterThan(other.boost);
    }
  });

  it("uses only match clauses with the user text as a value", () => {
    const hostile = '{"match_all":{}} OR *:*';
    const json = JSON.stringify(buildQuery({ title: hostile, body: hostile }, BEFORE, DEFAULT_PARAMS));
    expect(json).not.toContain("query_string");
    const built = buildQuery({ title: hostile, body: hostile }, BEFORE, DEFAULT_PARAMS) as typeof q;
    for (const clause of built.bool.should) {
      expect(Object.keys(clause)).toEqual(["match"]);
      const spec = Object.values(clause.match)[0] as { query: unknown };
      expect(spec.query).toBe(hostile);
    }
  });
});

describe("limitTerms", () => {
  it("keeps short text and cuts text with too many terms", () => {
    expect(limitTerms("one two three", 10)).toBe("one two three");
    expect(limitTerms("one two three four", 2).trim()).toBe("one two");
    expect([...limitTerms("漢".repeat(50), 10)].length).toBe(10);
  });
});
