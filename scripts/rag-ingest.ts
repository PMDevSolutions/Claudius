#!/usr/bin/env tsx
/**
 * RAG ingestion CLI: chunks a directory of markdown/text content, embeds the
 * chunks with Workers AI, and upserts them into a Cloudflare Vectorize index
 * in the shape the Worker's VectorizeRetriever expects.
 *
 * Usage:
 *   pnpm rag:ingest ./content --index claudius-rag [--base-url https://example.com] [--dry-run]
 *
 * Requires (unless --dry-run):
 *   CLOUDFLARE_ACCOUNT_ID   account id
 *   CLOUDFLARE_API_TOKEN    token with Workers AI + Vectorize permissions
 *
 * Frontmatter keys read per file: title, url, type (blog|page|external).
 * Without a url (or --base-url to derive one) a chunk still grounds answers
 * but renders no source link in the widget.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

import {
  buildVectorRecords,
  toNdjson,
  INGESTABLE_EXTENSIONS,
  type VectorRecord,
} from "./lib/rag-ingest.js";

const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
const EMBED_BATCH_SIZE = 50;
const API_BASE = "https://api.cloudflare.com/client/v4";

interface CliArgs {
  dir: string;
  index?: string;
  baseUrl?: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dir: "", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--index") args.index = argv[++i];
    else if (arg === "--base-url") args.baseUrl = argv[++i];
    else if (arg === "--dry-run") args.dryRun = true;
    else if (!arg.startsWith("--") && !args.dir) args.dir = arg;
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return args;
}

function walk(dir: string, root: string = dir): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full, root));
    } else if (INGESTABLE_EXTENSIONS.includes(extname(entry))) {
      files.push(full);
    }
  }
  return files.sort();
}

async function cfApi(path: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
      ...init.headers,
    },
  });
  const body = (await response.json()) as {
    success: boolean;
    errors?: Array<{ message: string }>;
    result?: unknown;
  };
  if (!response.ok || !body.success) {
    const message = body.errors?.map((e) => e.message).join("; ");
    throw new Error(`Cloudflare API ${path} failed: ${message ?? response.status}`);
  }
  return body.result;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const result = (await cfApi(`/accounts/${account}/ai/run/${EMBEDDING_MODEL}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: texts }),
  })) as { data?: number[][] };
  if (!result.data || result.data.length !== texts.length) {
    throw new Error("Embedding response is missing vectors");
  }
  return result.data;
}

async function upsert(index: string, ndjson: string): Promise<void> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  await cfApi(`/accounts/${account}/vectorize/v2/indexes/${index}/upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/x-ndjson" },
    body: ndjson,
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.dir) {
    console.error(
      "Usage: pnpm rag:ingest <dir> --index <name> [--base-url <url>] [--dry-run]"
    );
    process.exit(1);
  }

  const files = walk(args.dir);
  if (files.length === 0) {
    console.error(`No ${INGESTABLE_EXTENSIONS.join("/")} files under ${args.dir}`);
    process.exit(1);
  }

  const records: VectorRecord[] = [];
  for (const file of files) {
    const rel = relative(args.dir, file);
    const fileRecords = buildVectorRecords(rel, readFileSync(file, "utf8"), {
      baseUrl: args.baseUrl,
    });
    console.log(`  ${rel}: ${fileRecords.length} chunk(s)`);
    records.push(...fileRecords);
  }
  console.log(`${files.length} file(s) → ${records.length} chunk(s)`);

  if (args.dryRun) {
    for (const record of records) {
      const url = record.metadata.url ? `  [${record.metadata.url}]` : "";
      console.log(`\n--- ${record.id}${url}\n${record.text.slice(0, 200)}…`);
    }
    console.log("\nDry run: nothing uploaded.");
    return;
  }

  if (!args.index) {
    console.error("Missing --index <name> (the Vectorize index to upsert into)");
    process.exit(1);
  }
  if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) {
    console.error(
      "Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (or use --dry-run)."
    );
    process.exit(1);
  }

  for (let i = 0; i < records.length; i += EMBED_BATCH_SIZE) {
    const batch = records.slice(i, i + EMBED_BATCH_SIZE);
    const vectors = await embedBatch(batch.map((r) => r.text));
    await upsert(args.index, toNdjson(batch, vectors));
    console.log(
      `Upserted ${Math.min(i + EMBED_BATCH_SIZE, records.length)}/${records.length}`
    );
  }

  console.log(
    `Done. ${records.length} vectors upserted into "${args.index}" (mutations apply asynchronously).`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
