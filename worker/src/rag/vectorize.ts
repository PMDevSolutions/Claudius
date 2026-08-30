import type { RagDocument, Retriever, RetrieveOptions } from "./types";

/**
 * Structural slice of the Workers AI binding (`env.AI`) the retriever needs.
 * Typed loosely so tests and alternative embedding providers can satisfy it.
 */
export interface WorkersAiLike {
  run(model: string, inputs: { text: string[] }): Promise<unknown>;
}

/** Structural slice of a Vectorize index binding (`env.VECTORIZE_INDEX`). */
export interface VectorizeIndexLike {
  query(
    vector: number[],
    options: { topK: number; returnMetadata: "all" | "indexed" | "none" }
  ): Promise<{
    matches: Array<{
      id: string;
      score: number;
      metadata?: Record<string, unknown>;
    }>;
  }>;
}

export interface VectorizeRetrieverOptions {
  /** Vectorize index binding. */
  index: VectorizeIndexLike;
  /** Workers AI binding, used to embed the query. */
  ai: WorkersAiLike;
  /**
   * Embedding model — must match the model used at ingestion time
   * (`pnpm rag:ingest` uses the same default).
   * @defaultValue `"@cf/baai/bge-base-en-v1.5"`
   */
  embeddingModel?: string;
}

export const DEFAULT_EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";

/**
 * Reference {@link Retriever} backed by Cloudflare Vectorize + Workers AI
 * embeddings. Expects vectors ingested with chunk text in `metadata.content`
 * (plus optional `url`/`title`/`type` for source links) — the shape
 * `pnpm rag:ingest` produces.
 */
export class VectorizeRetriever implements Retriever {
  private readonly index: VectorizeIndexLike;
  private readonly ai: WorkersAiLike;
  private readonly embeddingModel: string;

  constructor(options: VectorizeRetrieverOptions) {
    this.index = options.index;
    this.ai = options.ai;
    this.embeddingModel = options.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
  }

  async retrieve(
    query: string,
    opts: RetrieveOptions = {}
  ): Promise<RagDocument[]> {
    const embedding = await this.embed(query);
    const result = await this.index.query(embedding, {
      topK: opts.topK ?? 4,
      returnMetadata: "all",
    });

    return result.matches.map((match) => ({
      id: match.id,
      content:
        typeof match.metadata?.content === "string"
          ? match.metadata.content
          : "",
      metadata: match.metadata,
      score: match.score,
    }));
  }

  private async embed(text: string): Promise<number[]> {
    const response = (await this.ai.run(this.embeddingModel, {
      text: [text],
    })) as { data?: number[][] };

    const vector = response?.data?.[0];
    if (!Array.isArray(vector) || vector.length === 0) {
      throw new Error(
        `Embedding model ${this.embeddingModel} returned no vector`
      );
    }
    return vector;
  }
}
