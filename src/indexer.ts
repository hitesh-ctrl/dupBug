import { Client } from "@elastic/elasticsearch";
import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

export interface IssueDoc {
  number: number;
  title: string;
  body: string;
  created_at: string;
  url: string;
}

/** Title and body use the built-in `english` analyzer (lowercase, stop words, Porter stemming). */
export async function createIndex(client: Client, index: string): Promise<void> {
  await client.indices.create({
    index,
    settings: { number_of_shards: 1, number_of_replicas: 0 },
    mappings: {
      dynamic: "strict",
      properties: {
        number: { type: "integer" },
        title: { type: "text", analyzer: "english" },
        body: { type: "text", analyzer: "english" },
        created_at: { type: "date" },
        url: { type: "keyword", index: false },
      },
    },
  });
}

export async function bulkIndex(client: Client, index: string, docs: IssueDoc[]): Promise<void> {
  const CHUNK = 500;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const operations = docs.slice(i, i + CHUNK).flatMap((d) => [
      { index: { _index: index, _id: String(d.number) } },
      { number: d.number, title: d.title, body: d.body, created_at: d.created_at, url: d.url },
    ]);
    const res = await client.bulk({ operations });
    if (res.errors) {
      const first = res.items.find((it) => it.index?.error)?.index?.error;
      throw new Error(`bulk indexing failed: ${first?.type ?? "unknown"}: ${first?.reason ?? ""}`);
    }
  }
}

async function readIssues(path: string): Promise<IssueDoc[]> {
  const docs: IssueDoc[] = [];
  for await (const line of createInterface({ input: createReadStream(path) })) {
    if (line.trim()) docs.push(JSON.parse(line) as IssueDoc);
  }
  return docs;
}

async function main(): Promise<void> {
  const path = process.argv[2] ?? "data/issues.jsonl";
  if (!existsSync(path)) throw new Error(`${path} not found: run scripts/fetch_issues.py first`);
  const index = process.env.ES_INDEX ?? "issues";
  const client = new Client({ node: process.env.ES_URL ?? "http://127.0.0.1:9200" });
  const docs = await readIssues(path);
  await client.indices.delete({ index }, { ignore: [404] });
  await createIndex(client, index);
  await bulkIndex(client, index, docs);
  await client.indices.refresh({ index });
  const { count } = await client.count({ index });
  console.log(`indexed ${count} issues into "${index}"`);
  await client.close();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
