---
title: RAG
description: Ground answers in your own content with a pluggable retriever interface and the Cloudflare Vectorize reference implementation.
---

Retrieval-augmented generation grounds the bot's answers in customer-supplied
content — an FAQ, knowledge base, or product catalog — instead of relying on
the system prompt alone. On every question the Worker retrieves the most
relevant chunks, injects them into the system prompt, and returns the pages
they came from as `sources`, which the widget renders as a source icon with a
slide-out sidebar.

The retrieval backend is pluggable: a small `Retriever` interface with a
Cloudflare Vectorize reference implementation shipped in the Worker, and
[adapter examples below](#other-vector-stores) for Pinecone and Turbopuffer.

## Quick start (Vectorize)

**1. Create the index.** Dimensions must match the embedding model — 768 for
the default `@cf/baai/bge-base-en-v1.5`:

```bash
wrangler vectorize create claudius-rag --dimensions=768 --metric=cosine
```

**2. Enable the bindings** in `worker/wrangler.toml` (both are required —
RAG stays off until they exist):

```toml
[[vectorize]]
binding = "VECTORIZE_INDEX"
index_name = "claudius-rag"

[ai]
binding = "AI"
```

**3. Ingest your content.** Point the CLI at a directory of `.md`/`.mdx`/
`.txt` files:

```bash
export CLOUDFLARE_ACCOUNT_ID=...   # account id
export CLOUDFLARE_API_TOKEN=...    # token with Workers AI + Vectorize perms

pnpm rag:ingest ./content --index claudius-rag --base-url https://example.com
```

The CLI chunks each file at paragraph boundaries (~1200 chars), embeds the
chunks with Workers AI, and upserts them with the metadata the retriever
reads. Add `--dry-run` to preview chunks without uploading.

Per-file frontmatter controls the source link the widget shows:

```markdown
---
title: Pricing
url: https://example.com/pricing
type: page        # "blog" | "page" | "external"
---
```

Without a `url` (or a `--base-url` to derive one from the file path), a chunk
still grounds answers but renders no source link.

**4. Deploy** (`pnpm deploy`). Ask the bot something covered by your content:
the reply is grounded in the retrieved chunks and carries their pages as
sources.

## How it works

For each chat request (blocking and streaming alike), the Worker:

1. Takes the **latest user message** as the retrieval query.
2. Calls the retriever (`topK`, default 4), drops results under the
   **score threshold**, applies the optional **reranker hook**, and re-caps
   at `topK`.
3. Renders the surviving chunks into a **context template** appended to the
   system prompt.
4. Returns deduplicated `sources` (one per page) on the response — the JSON
   body for `/api/chat`, the `done` SSE event for `/api/chat/stream`.

Retrieval failures are contained: if the vector store is down, the chat
proceeds ungrounded rather than erroring.

The default context template labels the excerpts as reference material and
instructs the model to ignore any instructions inside them (a prompt-injection
guard — your ingested content is treated as data, not commands) and to prefer
saying "I don't know" over guessing. Custom templates should keep an
equivalent warning.

## Configuration

Via `wrangler.toml` vars:

| Var | Default | Meaning |
|-----|---------|---------|
| `RAG_TOP_K` | `4` | Documents requested per question |
| `RAG_SCORE_THRESHOLD` | unset | Drop matches scoring below this (cosine, 0–1) |
| `RAG_CONTEXT_TEMPLATE` | built-in | Context block template; `{context}` is replaced with the formatted chunks |

In code (`worker/src/rag/index.ts`, `createRagFromEnv`), the full `RagConfig`
adds a `reranker` hook and `maxContextChars` (default 6000):

```ts
return {
  retriever: new VectorizeRetriever({ index: env.VECTORIZE_INDEX, ai: env.AI }),
  topK: 6,
  scoreThreshold: 0.5,
  // Rerank hook: reorder or filter retrieved documents before injection —
  // e.g. a cross-encoder, recency boost, or category filter.
  reranker: async (query, documents) => {
    return documents.sort(/* your ordering */);
  },
};
```

## The Retriever interface

Everything backend-specific sits behind one interface
(`worker/src/rag/types.ts`):

```ts
interface RagDocument {
  id: string;                          // e.g. "pricing.md#2"
  content: string;                     // chunk text injected as context
  metadata?: Record<string, unknown>;  // url/title/type drive source links
  score: number;                       // similarity, higher = better
}

interface Retriever {
  retrieve(query: string, opts?: { topK?: number }): Promise<RagDocument[]>;
}
```

Implement `retrieve` and return scored documents; the pipeline (threshold,
reranker, template, sources) is shared. Wire your implementation in
`createRagFromEnv`.

## Other vector stores

| | Cloudflare Vectorize | Pinecone | Turbopuffer |
|---|---|---|---|
| **Hosting** | Cloudflare-native (zero egress from the Worker) | Managed SaaS | Managed SaaS (object-storage backed) |
| **Latency from a Worker** | Lowest (same network) | One HTTPS hop | One HTTPS hop; cold namespaces slower, warm cache fast |
| **Embeddings** | Bring your own (Workers AI is one call away) | Optional hosted embedding + reranking models | Bring your own |
| **Pricing model** | Queried vector dimensions + stored dimensions | Serverless read/write units + storage | Storage + writes + queries (aggressively cheap at rest) |
| **Free tier** | Included in Workers paid plan; generous limits | Starter tier | Trial credits |
| **Best when** | You're already on Workers (this widget is) | You want managed embeddings/reranking in one place | Large corpora with modest query rates |

The bundled `VectorizeRetriever` is the recommended default here — it runs on
bindings, with no extra credentials or network egress. Swapping it out is one
class:

### Pinecone adapter

```ts
// worker/src/rag/pinecone.ts
import type { RagDocument, Retriever, RetrieveOptions } from "./types";

export class PineconeRetriever implements Retriever {
  constructor(
    private readonly options: {
      /** e.g. "https://my-index-abc123.svc.us-east-1-aws.pinecone.io" */
      indexHost: string;
      apiKey: string;
      /** Embeds the query — reuse Workers AI or Pinecone's hosted models. */
      embed: (text: string) => Promise<number[]>;
      namespace?: string;
    },
  ) {}

  async retrieve(query: string, opts?: RetrieveOptions): Promise<RagDocument[]> {
    const vector = await this.options.embed(query);
    const response = await fetch(`${this.options.indexHost}/query`, {
      method: "POST",
      headers: {
        "Api-Key": this.options.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        vector,
        topK: opts?.topK ?? 4,
        includeMetadata: true,
        namespace: this.options.namespace,
      }),
    });
    if (!response.ok) throw new Error(`Pinecone query failed: ${response.status}`);
    const body = (await response.json()) as {
      matches: Array<{ id: string; score: number; metadata?: Record<string, unknown> }>;
    };
    return body.matches.map((m) => ({
      id: m.id,
      content: typeof m.metadata?.content === "string" ? m.metadata.content : "",
      metadata: m.metadata,
      score: m.score,
    }));
  }
}
```

### Turbopuffer adapter

```ts
// worker/src/rag/turbopuffer.ts
import type { RagDocument, Retriever, RetrieveOptions } from "./types";

export class TurbopufferRetriever implements Retriever {
  constructor(
    private readonly options: {
      apiKey: string;
      namespace: string;
      embed: (text: string) => Promise<number[]>;
      /** e.g. "gcp-us-central1" */
      region?: string;
    },
  ) {}

  async retrieve(query: string, opts?: RetrieveOptions): Promise<RagDocument[]> {
    const region = this.options.region ?? "gcp-us-central1";
    const vector = await this.options.embed(query);
    const response = await fetch(
      `https://${region}.turbopuffer.com/v2/namespaces/${this.options.namespace}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rank_by: ["vector", "ANN", vector],
          top_k: opts?.topK ?? 4,
          include_attributes: true,
        }),
      },
    );
    if (!response.ok) throw new Error(`turbopuffer query failed: ${response.status}`);
    const body = (await response.json()) as {
      rows: Array<{ id: string | number; $dist: number } & Record<string, unknown>>;
    };
    // turbopuffer returns cosine *distance*; convert to a similarity score.
    return body.rows.map((row) => ({
      id: String(row.id),
      content: typeof row.content === "string" ? row.content : "",
      metadata: row,
      score: 1 - row.$dist,
    }));
  }
}
```

Both adapters plug into `createRagFromEnv` in place of `VectorizeRetriever`
(store the API keys as
[Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/),
not vars). Score scales differ per store — tune `RAG_SCORE_THRESHOLD` to the
backend you use.

## Related

- **Inline citations and source cards** rendered from RAG results are
  tracked in [#56](https://github.com/PMDevSolutions/Claudius/issues/56).
- For small knowledge bases, the
  [system prompt](/configuration/worker/#system-prompt) alone remains a
  solid, zero-infrastructure option.
