import { Client } from "@elastic/elasticsearch";
import { createApp } from "./app.js";
import { loadParams } from "./config.js";

const client = new Client({
  node: process.env.ES_URL ?? "http://127.0.0.1:9200",
  maxRetries: 1,
  requestTimeout: 5000,
});
const port = Number(process.env.PORT ?? 3187);
const app = createApp({ client, index: process.env.ES_INDEX ?? "issues", params: loadParams() });

// Bound to localhost only: this is a local development service.
app.listen(port, "127.0.0.1", () => {
  console.log(`listening on http://127.0.0.1:${port}`);
});
