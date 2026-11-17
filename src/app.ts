import { Client, errors } from "@elastic/elasticsearch";
import express, { type ErrorRequestHandler, type Express } from "express";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { DEFAULT_PARAMS, RESULT_SIZE, type SearchParams } from "./config.js";
import { buildQuery } from "./query.js";

// Lengths are counted in Unicode characters (code points), not UTF-16 units: "🚨" is one character.
const charCount = (s: string): number => (s.length > 20000 ? s.length : [...s].length);
const text = (min: number, max: number) =>
  z.string().refine((s) => {
    const n = charCount(s);
    return n >= min && n <= max;
  }, `must be ${min} to ${max} characters`);

const BodySchema = z
  .object({
    title: text(1, 200),
    body: text(0, 5000).default(""),
  })
  .strict();

// `before` is not part of the JSON body (which is title and body only). It is the time cutoff:
// only issues created strictly before it are searched. Defaults to "now".
const QuerySchema = z.object({ before: z.string().datetime({ offset: true }).optional() }).strict();

export interface AppDeps {
  client: Client;
  index: string;
  params?: SearchParams;
}

interface IssueSource {
  number: number;
  title: string;
  url: string;
  created_at: string;
}

export function createApp({ client, index, params = DEFAULT_PARAMS }: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));

  app.get("/health", async (_req, res) => {
    try {
      await client.cluster.health({ timeout: "2s" });
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ error: "search_unavailable" });
    }
  });

  app.post("/similar", async (req, res) => {
    const body = BodySchema.safeParse(req.body);
    const query = QuerySchema.safeParse(req.query);
    if (!body.success || !query.success) {
      const issues = [...(body.success ? [] : body.error.issues), ...(query.success ? [] : query.error.issues)];
      res.status(400).json({
        error: "invalid_request",
        details: issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
      return;
    }
    const before = query.data.before ?? new Date().toISOString();
    try {
      const result = await client.search<IssueSource>({
        index,
        size: RESULT_SIZE,
        _source: ["number", "title", "url", "created_at"],
        query: buildQuery(body.data, before, params),
      });
      res.json({
        results: result.hits.hits.map((h) => ({
          number: h._source!.number,
          title: h._source!.title,
          url: h._source!.url,
          created_at: h._source!.created_at,
          score: h._score ?? 0,
        })),
      });
    } catch (err) {
      if (err instanceof errors.ElasticsearchClientError) {
        console.error(`search failed: ${err.name}`);
        res.status(503).json({ error: "search_unavailable" });
        return;
      }
      console.error(`unexpected error: ${err instanceof Error ? err.name : "unknown"}`);
      res.status(500).json({ error: "internal_error" });
    }
  });

  // Demo page (static files only; the page calls POST /similar like any other client).
  app.use(express.static(fileURLToPath(new URL("../public", import.meta.url)), { index: "index.html" }));

  app.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  // Body-parser and any other errors: never leak a stack trace.
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    const status = typeof err?.status === "number" && err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 413) res.status(413).json({ error: "payload_too_large" });
    else if (status < 500) res.status(400).json({ error: "invalid_request" });
    else res.status(500).json({ error: "internal_error" });
  };
  app.use(onError);

  return app;
}
