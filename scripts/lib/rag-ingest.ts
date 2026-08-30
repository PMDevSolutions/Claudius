/**
 * Pure helpers for the RAG ingestion CLI (`pnpm rag:ingest`). Parsing,
 * chunking, and record building live here so they can be unit tested; the
 * CLI entry (scripts/rag-ingest.ts) adds file walking and network calls.
 */

export interface Frontmatter {
  title?: string;
  url?: string;
  type?: string;
  [key: string]: string | undefined;
}

export interface ParsedDocument {
  frontmatter: Frontmatter;
  body: string;
}

export interface VectorRecord {
  /** Vector id: `<relative-path>#<chunk-index>`. */
  id: string;
  /** Text that gets embedded. */
  text: string;
  /** Metadata stored with the vector (what the Worker's retriever reads). */
  metadata: {
    content: string;
    title: string;
    url?: string;
    type?: string;
  };
}

export const DEFAULT_CHUNK_CHARS = 1200;

/** Extensions the ingester picks up. */
export const INGESTABLE_EXTENSIONS = [".md", ".mdx", ".txt"];

/**
 * Parses a simple `key: value` YAML frontmatter block delimited by `---`
 * lines. Nested YAML is not supported — ingestion metadata is flat.
 */
export function parseFrontmatter(raw: string): ParsedDocument {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { frontmatter: {}, body: raw };

  const frontmatter: Frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) frontmatter[key] = value;
  }

  return { frontmatter, body: raw.slice(match[0].length) };
}

/** First markdown heading in the body, if any. */
export function firstHeading(body: string): string | undefined {
  const match = /^#{1,6}\s+(.+)$/m.exec(body);
  return match?.[1].trim();
}

/**
 * Splits text into chunks of at most `maxChars`, preferring paragraph
 * boundaries (blank lines) and hard-splitting only paragraphs that are
 * individually oversized. Whitespace-only chunks are dropped.
 */
export function chunkText(
  body: string,
  maxChars: number = DEFAULT_CHUNK_CHARS
): string[] {
  const paragraphs = body
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      flush();
      for (let i = 0; i < paragraph.length; i += maxChars) {
        chunks.push(paragraph.slice(i, i + maxChars).trim());
      }
      continue;
    }
    if (current && current.length + paragraph.length + 2 > maxChars) {
      flush();
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  flush();

  return chunks;
}

/**
 * Builds the vector records for one file: frontmatter wins for title/url/
 * type, falling back to the first heading (title) and `baseUrl` + path
 * (url). Files that yield no chunks produce no records.
 */
export function buildVectorRecords(
  relativePath: string,
  raw: string,
  options: { baseUrl?: string; maxChars?: number } = {}
): VectorRecord[] {
  const { frontmatter, body } = parseFrontmatter(raw);

  const title =
    frontmatter.title ??
    firstHeading(body) ??
    relativePath.replace(/\.[^.]+$/, "");

  let url = frontmatter.url;
  if (!url && options.baseUrl) {
    const slug = relativePath
      .replace(/\\/g, "/")
      .replace(/\.[^.]+$/, "")
      .replace(/(^|\/)index$/, "$1");
    url = `${options.baseUrl.replace(/\/$/, "")}/${slug}`.replace(/\/$/, "");
  }

  return chunkText(body, options.maxChars).map((content, index) => ({
    id: `${relativePath.replace(/\\/g, "/")}#${index}`,
    text: content,
    metadata: {
      content,
      title,
      ...(url ? { url } : {}),
      ...(frontmatter.type ? { type: frontmatter.type } : {}),
    },
  }));
}

/** Serializes records + vectors into Vectorize's NDJSON upsert format. */
export function toNdjson(
  records: VectorRecord[],
  vectors: number[][]
): string {
  if (records.length !== vectors.length) {
    throw new Error(
      `Record/vector count mismatch: ${records.length} vs ${vectors.length}`
    );
  }
  return records
    .map((record, i) =>
      JSON.stringify({
        id: record.id,
        values: vectors[i],
        metadata: record.metadata,
      })
    )
    .join("\n");
}
