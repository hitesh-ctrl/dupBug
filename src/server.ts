import { Client } from "@elastic/elasticsearch";
import { createApp } from "./app.js";
import { loadParams } from "./config.js";

const client = new Client({
  node: process.env.ES_URL ?? "http://127.0.0.1:9200",
  maxRetries: 1,
  requestTimeout: 5000,
});
const port = Number(process.env.PORT ?? 3187);
const app = createApp({
  client,
  index: process.env.ES_INDEX ?? "issues",
  params: loadParams(),
  rateLimitPerMin: Number(process.env.RATE_LIMIT_PER_MIN ?? 0),
});
// Behind a hosting platform's proxy, set TRUST_PROXY=1 so the rate limit sees the real client address.
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);

// Bound to localhost unless HOST is set (a hosted deployment sets HOST=0.0.0.0).
const host = process.env.HOST ?? "127.0.0.1";
app.listen(port, host, () => {
  console.log(`listening on http://${host}:${port}`);
});
