/**
 * Inline citations. Pass to {@link ChatWidget} via the `citations` prop (or
 * `true` for the defaults). `[n]` markers in a grounded reply become chips
 * and its sources become a footer of cards.
 */
export interface CitationsOptions {
  /**
   * Source cards shown before the "Show all" control. Positive integer.
   * @defaultValue `5`
   */
  maxSources?: number;
  /**
   * Show each source's favicon, fetched from `/favicon.ico` on the source's
   * own origin with no referrer. Set to `false` to make no such requests.
   * @defaultValue `true`
   */
  favicons?: boolean;
}

/** {@link CitationsOptions} with every field filled in. */
export type ResolvedCitationsConfig = Required<CitationsOptions>;

/** Defaults applied when citations are enabled with `true` or a partial config. */
export const DEFAULT_CITATIONS_OPTIONS: ResolvedCitationsConfig = {
  maxSources: 5,
  favicons: true,
};

/**
 * Turn the `citations` prop into a full config, or `null` when citations are
 * off. Fails closed: only `true` or a plain object enables them, so a
 * templated string such as `"false"` cannot.
 */
export function resolveCitationsConfig(
  input: boolean | CitationsOptions | undefined | null,
): ResolvedCitationsConfig | null {
  const isOptions =
    typeof input === "object" && input !== null && !Array.isArray(input);
  if (input !== true && !isOptions) return null;
  const options: CitationsOptions = input === true ? {} : input;
  const max = options.maxSources;
  return {
    maxSources:
      typeof max === "number" && Number.isInteger(max) && max >= 1
        ? max
        : DEFAULT_CITATIONS_OPTIONS.maxSources,
    favicons: options.favicons !== false,
  };
}

/**
 * Build the `citations` option from `<claudius-chat>` attributes. `citations`
 * switches it on only when present with no value or `"true"` (trimmed, any
 * case), like `conversation-export`; `citations-max-sources` takes a positive
 * integer and `citations-favicons="false"` turns favicons off.
 */
export function citationsOptionsFromAttributes(
  getAttribute: (name: string) => string | null,
): boolean | CitationsOptions | undefined {
  const raw = getAttribute("citations");
  if (raw === null) return undefined;
  const value = raw.trim().toLowerCase();
  if (value !== "" && value !== "true") return false;

  const options: CitationsOptions = {};
  const max = getAttribute("citations-max-sources");
  if (max !== null && /^\s*\d+\s*$/.test(max)) {
    const parsed = Number(max);
    if (parsed >= 1) options.maxSources = parsed;
  }
  const favicons = getAttribute("citations-favicons");
  if (favicons !== null && favicons.trim().toLowerCase() === "false") {
    options.favicons = false;
  }
  return Object.keys(options).length > 0 ? options : true;
}

/** One piece of a text run: plain text, or a group of citation markers. */
export type CitationSegment =
  | { type: "text"; value: string }
  | {
      type: "cite";
      /** Zero-based source indexes, in the order written, without repeats. */
      indexes: number[];
      /** The marker as written, e.g. `"[1, 3]"`. */
      raw: string;
    };

// `[1]`, `[12]`, `[1, 3]`: one to three digits, no leading zero. Models write
// both `[1][3]` and `[1, 3]`, so a comma list is one group.
const CITATION_GROUP = /\[([1-9]\d{0,2}(?:\s*,\s*[1-9]\d{0,2})*)\]/g;

/**
 * Split text into plain runs and citation groups. A group counts only when
 * every number is between 1 and `sourceCount`; anything else stays text, so
 * `[7]` with three sources, `[0]`, and every bracket in a reply without
 * sources render as written.
 */
export function parseCitations(
  text: string,
  sourceCount: number,
): CitationSegment[] {
  if (!text) return [];
  if (sourceCount <= 0 || !text.includes("[")) {
    return [{ type: "text", value: text }];
  }
  const segments: CitationSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(CITATION_GROUP)) {
    const numbers = match[1].split(",").map((n) => Number(n.trim()));
    if (numbers.some((n) => n > sourceCount)) continue;
    const start = match.index ?? 0;
    if (start > last) {
      segments.push({ type: "text", value: text.slice(last, start) });
    }
    segments.push({
      type: "cite",
      indexes: [...new Set(numbers)].map((n) => n - 1),
      raw: match[0],
    });
    last = start + match[0].length;
  }
  if (last < text.length) {
    segments.push({ type: "text", value: text.slice(last) });
  }
  return segments;
}

/**
 * Text without its citation markers, for screen-reader announcements and
 * read-aloud: the marker goes, and so does the space before it.
 */
export function stripCitationMarkers(
  text: string,
  sourceCount: number,
): string {
  let out = "";
  for (const segment of parseCitations(text, sourceCount)) {
    if (segment.type === "text") out += segment.value;
    else out = out.replace(/[ \t]+$/, "");
  }
  return out;
}

/**
 * Hide an unfinished marker at the very end of streaming text (`[`, `[1`,
 * `[1, `), the way the bold stabilizer hides a bare `**`. The characters
 * return with the next token.
 */
export function hideTrailingCitationOpener(text: string): string {
  return text.replace(/[ \t]?\[[\d,\s]*$/, "");
}

/** Longest snippet a card shows; the worker applies the same cut. */
export const SNIPPET_MAX_CHARS = 200;

/**
 * Collapse whitespace and cut at the last space before `maxChars` (hard when
 * there is none), adding an ellipsis. A no-op for snippets the worker
 * already cut; protects against long ones from plugins or custom workers.
 */
export function truncateSnippet(
  text: string,
  maxChars: number = SNIPPET_MAX_CHARS,
): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxChars) return collapsed;
  const cut = collapsed.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  const head = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(
    /[\s,;:]+$/,
    "",
  );
  return `${head}…`;
}

/** `/favicon.ico` on the source's origin, or null unless the URL is http(s). */
export function faviconUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return `${parsed.origin}/favicon.ico`;
  } catch {
    return null;
  }
}

/** The hostname shown under a card's title, or the input when it is not a URL. */
export function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
