import { Client } from "@elastic/elasticsearch";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createIndex, bulkIndex } from "../src/indexer.js";
import { FIXTURES } from "./fixtures.js";

const ES_URL = process.env.ES_URL ?? "http://127.0.0.1:9200";
const INDEX = `issues_test_${process.pid}`;
const client = new Client({ node: ES_URL });
const app = createApp({ client, index: INDEX });

beforeAll(async () => {
  await client.indices.delete({ index: INDEX }, { ignore: [404] });
  await createIndex(client, INDEX);
  await bulkIndex(client, INDEX, FIXTURES);
  await client.indices.refresh({ index: INDEX }); // explicit refresh, no sleeps
});

afterAll(async () => {
  await client.indices.delete({ index: INDEX }, { ignore: [404] });
  await client.close();
});

describe("POST /similar: response shape", () => {
  it("returns ranked results with the documented fields", async () => {
    const res = await request(app)
      .post("/similar")
      .send({ title: "Terminal crashes when pasting large text", body: "crash on paste" });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(res.body.results.length).toBeGreaterThan(0);
    expect(res.body.results.length).toBeLessThanOrEqual(10);
    for (const r of res.body.results) {
      expect(Object.keys(r).sort()).toEqual(["created_at", "number", "score", "title", "url"]);
      expect(typeof r.number).toBe("number");
      expect(typeof r.title).toBe("string");
      expect(typeof r.url).toBe("string");
      expect(typeof r.score).toBe("number");
      expect(Number.isNaN(Date.parse(r.created_at))).toBe(false);
    }
    const scores = res.body.results.map((r: { score: number }) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    // Issues 1, 3, 5 and 7 describe the same paste crash with near-identical stemmed terms, so which of
    // them is first depends on length normalisation. The top hit must be one of them, not an unrelated issue.
    expect([1, 3, 5, 7]).toContain(res.body.results[0].number);
    expect(res.body.results.map((r: { number: number }) => r.number)).toContain(1);
  });

  it("accepts a missing body and an empty body", async () => {
    const a = await request(app).post("/similar").send({ title: "cursor colour setting" });
    const b = await request(app).post("/similar").send({ title: "cursor colour setting", body: "" });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.results[0].number).toBe(2);
  });
});

describe("POST /similar: validation", () => {
  const bad: [string, unknown][] = [
    ["empty title", { title: "", body: "x" }],
    ["missing title", { body: "x" }],
    ["title too long", { title: "a".repeat(201), body: "x" }],
    ["body too long", { title: "ok", body: "b".repeat(5001) }],
    ["title wrong type", { title: 42, body: "x" }],
    ["title is an object", { title: { match_all: {} }, body: "x" }],
    ["body wrong type", { title: "ok", body: ["x"] }],
    ["extra field", { title: "ok", body: "x", size: 1000 }],
    ["extra field that looks like a query", { title: "ok", query: { match_all: {} } }],
    ["array instead of object", [{ title: "ok" }]],
  ];
  it.each(bad)("rejects %s with 400", async (_name, payload) => {
    const res = await request(app).post("/similar").send(payload as object);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_request");
    expect(res.body.results).toBeUndefined();
  });

  it("accepts the limits exactly (title 200, body 5000)", async () => {
    const res = await request(app)
      .post("/similar")
      .send({ title: "a".repeat(200), body: "b".repeat(5000) });
    expect(res.status).toBe(200);
  });

  it("counts characters, not UTF-16 units (emoji at the limit)", async () => {
    const ok = await request(app).post("/similar").send({ title: "🚨".repeat(200), body: "🚨".repeat(5000) });
    expect(ok.status).toBe(200);
    const tooLong = await request(app).post("/similar").send({ title: "🚨".repeat(201) });
    expect(tooLong.status).toBe(400);
    const bodyTooLong = await request(app).post("/similar").send({ title: "ok", body: "🚨".repeat(5001) });
    expect(bodyTooLong.status).toBe(400);
  });

  it("handles maximum-size input where every character is its own term (CJK, emoji)", async () => {
    for (const ch of ["漢", "🚨", "a "]) {
      const res = await request(app)
        .post("/similar")
        .send({ title: ch.repeat(200).slice(0, 200), body: ch.repeat(5000).slice(0, 5000) });
      expect(res.status).toBe(200);
    }
  });

  it("rejects malformed JSON with a clean 400", async () => {
    const res = await request(app)
      .post("/similar")
      .set("Content-Type", "application/json")
      .send('{"title": "oops"');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_request");
    expect(JSON.stringify(res.body)).not.toMatch(/SyntaxError|\bat\s+\S+\s+\(/);
  });

  it("rejects a bad `before` query parameter", async () => {
    const res = await request(app).post("/similar?before=yesterday").send({ title: "ok" });
    expect(res.status).toBe(400);
    const res2 = await request(app).post("/similar?before=2020-01-05T00:00:00Z&x=1").send({ title: "ok" });
    expect(res2.status).toBe(400);
  });
});

describe("POST /similar: hostile strings are treated as plain text", () => {
  const hostile = [
    "*",
    "*:*",
    "title:* OR _exists_:body",
    "a* AND (b OR c) NOT d~2 \"unterminated",
    '{"match_all": {}}',
    '"}}, "size": 10000, "query": {"match_all": {',
    "/.*/ [* TO *] +- && || ! ( ) { } [ ] ^ ~ ? : \\",
    "<script>alert(1)</script>",
    "'; DROP TABLE issues; --",
    "\u0000\u0001 ￿ 🚀",
  ];
  it.each(hostile)("returns safely for %j", async (text) => {
    const res = await request(app).post("/similar").send({ title: text, body: text });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(res.body.results.length).toBeLessThanOrEqual(10);
  });

  it("a wildcard does not match everything", async () => {
    const res = await request(app).post("/similar").send({ title: "*", body: "*:*" });
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
  });
});

describe("POST /similar: Elasticsearch down", () => {
  it("answers 503 without a stack trace or internal details", async () => {
    const deadClient = new Client({ node: "http://127.0.0.1:59999", maxRetries: 0, requestTimeout: 1000 });
    const deadApp = createApp({ client: deadClient, index: INDEX });
    const res = await request(deadApp).post("/similar").send({ title: "anything" });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "search_unavailable" });
    expect(res.text).not.toMatch(/ECONNREFUSED|ConnectionError|node_modules|\bat\s+\S+\s+\(|59999/);
    await deadClient.close();
  });
});

describe("POST /similar: no looking into the future", () => {
  // Issue 5 is a duplicate of issue 1. Issues 7 (same bug) and 6, 8 are NEWER than 5.
  const query = FIXTURES.find((f) => f.number === 5)!;

  it("never returns an issue created at or after the query issue, nor the issue itself", async () => {
    const res = await request(app)
      .post(`/similar?before=${encodeURIComponent(query.created_at)}`)
      .send({ title: query.title, body: query.body });
    expect(res.status).toBe(200);
    const numbers = res.body.results.map((r: { number: number }) => r.number);
    expect(numbers).toContain(1); // the older original is found
    expect(numbers).not.toContain(query.number); // never the query issue itself
    for (const r of res.body.results) {
      expect(Date.parse(r.created_at)).toBeLessThan(Date.parse(query.created_at));
    }
  });

  it("holds for every fixture issue used as the query", async () => {
    for (const q of FIXTURES) {
      const res = await request(app)
        .post(`/similar?before=${encodeURIComponent(q.created_at)}`)
        .send({ title: q.title, body: q.body });
      expect(res.status).toBe(200);
      for (const r of res.body.results) {
        expect(r.number).not.toBe(q.number);
        expect(Date.parse(r.created_at)).toBeLessThan(Date.parse(q.created_at));
      }
    }
  });

  it("the oldest issue has nothing before it", async () => {
    const first = FIXTURES[0];
    const res = await request(app)
      .post(`/similar?before=${encodeURIComponent(first.created_at)}`)
      .send({ title: first.title, body: first.body });
    expect(res.body.results).toEqual([]);
  });
});
