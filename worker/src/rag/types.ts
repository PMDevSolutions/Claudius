/**
 * One retrieved chunk of customer-supplied content (FAQ entry, docs section,
 * product description) with its similarity score.
 */
export interface RagDocument {
  /** Stable identifier of the chunk (e.g. `"pricing.md#2"`). */
  id: string;
  /** The chunk's text, injected into the system prompt as grounding context. */
  content: string;
  /**
   * Arbitrary metadata stored at ingestion time. `url`, `title`, and `type`
   * (`"blog" | "page" | "external"`) are used to render source links in the
   * widget; everything else is passed through untouched.
   */
  metadata?: Record<string, unknown>;
  /** Similarity score from the vector store (higher is more relevant). */
  score: number;
}

/** Options passed to {@link Retriever.retrieve}. */
export interface RetrieveOptions {
  /** Maximum number of documents to return. */
  topK?: number;
}

/**
 * Pluggable retrieval backend. Implement this to plug in any vector store —
 * the Vectorize reference implementation ships in `rag/vectorize.ts`, and
 * the docs show Pinecone and Turbopuffer adapters.
 */
export interface Retriever {
  retrieve(query: string, opts?: RetrieveOptions): Promise<RagDocument[]>;
}

/**
 * Optional hook to reorder (or further filter) retrieved documents before
 * they are injected — e.g. a cross-encoder rerank, recency boost, or
 * category filter. Return the documents in their new order.
 */
export type Reranker = (
  query: string,
  documents: RagDocument[]
) => Promise<RagDocument[]> | RagDocument[];

/**
 * RAG settings for a chat request. When present, the worker retrieves
 * context for the latest user message and injects it into the system prompt;
 * retrieved documents with a `url` come back to the widget as `sources`.
 */
export interface RagConfig {
  retriever: Retriever;
  /**
   * How many documents to request from the retriever.
   * @defaultValue `4`
   */
  topK?: number;
  /**
   * Drop documents scoring below this (applied after retrieval, before the
   * reranker). Unset disables the filter.
   */
  scoreThreshold?: number;
  /** Optional rerank/filter hook applied after the score threshold. */
  reranker?: Reranker;
  /**
   * Template for the context block appended to the system prompt. `{context}`
   * is replaced with the formatted documents. The default template labels
   * the excerpts as reference material and tells the model to ignore any
   * instructions inside them (prompt-injection guard) — custom templates
   * should keep an equivalent warning.
   */
  contextTemplate?: string;
  /**
   * Cap on the formatted context's length in characters; documents that
   * don't fit are dropped (lowest-ranked first).
   * @defaultValue `6000`
   */
  maxContextChars?: number;
}
