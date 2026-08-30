import type { RagConfig } from "./types";
import {
  VectorizeRetriever,
  type VectorizeIndexLike,
  type WorkersAiLike,
} from "./vectorize";

export type {
  RagDocument,
  RetrieveOptions,
  Retriever,
  Reranker,
  RagConfig,
} from "./types";
export {
  retrieveRagDocuments,
  formatRagContext,
  ragDocumentsToSources,
  DEFAULT_CONTEXT_TEMPLATE,
  type ChatSource,
} from "./retrieval";
export {
  VectorizeRetriever,
  DEFAULT_EMBEDDING_MODEL,
  type VectorizeRetrieverOptions,
  type VectorizeIndexLike,
  type WorkersAiLike,
} from "./vectorize";

/** Env slice consumed by {@link createRagFromEnv}. */
export interface RagEnv {
  /** Vectorize index binding (uncomment `[[vectorize]]` in wrangler.toml). */
  VECTORIZE_INDEX?: VectorizeIndexLike;
  /** Workers AI binding (uncomment `[ai]` in wrangler.toml). */
  AI?: WorkersAiLike;
  RAG_TOP_K?: string;
  RAG_SCORE_THRESHOLD?: string;
  RAG_CONTEXT_TEMPLATE?: string;
}

/**
 * Builds the request RAG config from Worker bindings. RAG activates when
 * both the Vectorize index and Workers AI bindings exist; otherwise the
 * chat runs exactly as before. To plug in a different vector store or add
 * a reranker, replace the returned config here (see the RAG docs page for
 * Pinecone/Turbopuffer adapter examples).
 */
export function createRagFromEnv(env: RagEnv): RagConfig | undefined {
  if (!env.VECTORIZE_INDEX || !env.AI) return undefined;

  return {
    retriever: new VectorizeRetriever({
      index: env.VECTORIZE_INDEX,
      ai: env.AI,
    }),
    topK: env.RAG_TOP_K ? parseInt(env.RAG_TOP_K, 10) : undefined,
    scoreThreshold: env.RAG_SCORE_THRESHOLD
      ? parseFloat(env.RAG_SCORE_THRESHOLD)
      : undefined,
    contextTemplate: env.RAG_CONTEXT_TEMPLATE,
    // reranker: add a Reranker hook here to reorder retrieved documents.
  };
}
