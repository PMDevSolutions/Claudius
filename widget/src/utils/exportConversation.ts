import type { ChatAttachment, ChatMessage, Source } from "../api/types";
import { formatBytes, stripAttachmentData } from "./attachments";
import { interpolate } from "./interpolate";
import { sanitizeUrl } from "./sanitize";

/**
 * The strings a transcript is written with. `attachments`, `sources`, and
 * `toolUsed` carry their own colon, because French puts a space before it.
 */
export interface TranscriptLabels {
  title: string;
  /** Takes `{date}`. */
  exported: string;
  user: string;
  assistant: string;
  attachments: string;
  sources: string;
  toolUsed: string;
}

export interface MarkdownExportOptions {
  labels: TranscriptLabels;
  /** BCP-47 tag for dates. An invalid tag falls back to the browser default. */
  locale?: string;
  /** IANA zone. Defaults to the visitor's. */
  timeZone?: string;
  /** The export time. Defaults to now. */
  now?: Date;
  /** Replaces the built-in date formatting. The result is still normalized. */
  formatDate?: (date: Date) => string;
}

interface OpenFence {
  indent: string;
  /** The opener's indentation in columns, tabs expanded. */
  indentColumns: number;
  char: string;
  length: number;
}

const FENCE_OPEN = /^([ \t]*)(`{3,}|~{3,})(.*)$/;
// A line-leading "<" that CommonMark could read as the start of an HTML block.
// An autolink (<scheme:host/path> or <user@host>) never opens one, and
// escaping it would show the brackets and link the wrong destination.
const HTML_BLOCK_START =
  /^( {0,3})<(?![A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>\s]*>|[^\s<>@]+@[^\s<>]+>)(?=[A-Za-z!?/])/;
const INDENTED = /^(?: {4}|\t)/;

/** Leading whitespace as columns, with tabs at four-column stops. */
function indentColumns(line: string): number {
  let columns = 0;
  for (const ch of line) {
    if (ch === " ") columns += 1;
    else if (ch === "\t") columns += 4 - (columns % 4);
    else break;
  }
  return columns;
}

/** `line` without its trailing spaces and tabs. Linear, unlike a regex. */
function trimTrailingSpace(line: string): string {
  let end = line.length;
  while (end > 0 && (line[end - 1] === " " || line[end - 1] === "\t")) end -= 1;
  return end === line.length ? line : line.slice(0, end);
}

/**
 * CommonMark fences, except that any indentation is accepted: models indent
 * fences inside list items all the time and almost never write indented code.
 */
function parseFenceOpen(line: string): OpenFence | null {
  const match = FENCE_OPEN.exec(line);
  if (!match) return null;
  const [, indent, run, info] = match;
  // A backtick fence's info string cannot contain a backtick. Such a line is
  // inline code that happens to start the line.
  if (run[0] === "`" && info.includes("`")) return null;
  return {
    indent,
    indentColumns: indentColumns(indent),
    char: run[0],
    length: run.length,
  };
}

/**
 * A closer is the opener's character alone, at least as many times, and
 * indented at most three columns beyond the opener. CommonMark reads a run
 * four or more columns past its container as code, so without the indent
 * limit a fence inside a Markdown example would end the block around it.
 */
function closesFence(line: string, fence: OpenFence): boolean {
  const trimmed = line.trim();
  if (trimmed.length < fence.length) return false;
  for (const ch of trimmed) {
    if (ch !== fence.char) return false;
  }
  return indentColumns(line) <= fence.indentColumns + 3;
}

/**
 * Prepare one message's text for a Markdown transcript. The text is kept as
 * written, with protections that stop it damaging the rest of the file or
 * rendering differently from how the widget showed it:
 *
 * - an unclosed code fence is closed, so a reply stopped inside a code block
 *   does not swallow every later message;
 * - a single newline becomes a hard line break, because the widget shows
 *   every newline as a line break while Markdown treats it as a space;
 * - a line-leading `<` is escaped, so an unterminated HTML block or comment
 *   cannot hide what follows it;
 * - line endings are normalized, and trailing blank lines are dropped unless
 *   the text ends inside an open code block, whose content is left alone.
 *
 * Text inside a fenced block is never modified.
 */
export function protectMessageText(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let fence: OpenFence | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (fence) {
      out.push(line);
      if (closesFence(line, fence)) fence = null;
      continue;
    }

    const opened = parseFenceOpen(line);
    if (opened) {
      fence = opened;
      out.push(line);
      continue;
    }

    let result = line.replace(HTML_BLOCK_START, "$1\\<");
    const next = lines[i + 1];
    const breakable =
      line.trim() !== "" &&
      next !== undefined &&
      next.trim() !== "" &&
      // Possibly indented code, where trailing spaces would be content.
      !INDENTED.test(line) &&
      // Already a hard break.
      !line.endsWith("\\");
    if (breakable) result = trimTrailingSpace(result) + "  ";
    out.push(result);
  }

  if (fence) {
    // The text ended inside the block. A final line terminator leaves one empty
    // string at the end of the split array. That empty string is not a blank
    // line of code, so drop it if present; everything else inside the block
    // stays untouched.
    if (out[out.length - 1] === "") out.pop();
    out.push(fence.indent + fence.char.repeat(fence.length));
  } else {
    // Pop trailing blank lines, then trim trailing spaces from the new last line.
    while (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
    if (out.length > 0) {
      out[out.length - 1] = trimTrailingSpace(out[out.length - 1]);
    }
  }

  return out.join("\n");
}

// Some engines separate the time from AM/PM with U+202F. It looks like a
// space but breaks string comparison and some plain-text tools.
const NO_BREAK_SPACES = /[\u00a0\u202f]/g;

function rawDateFormatter(
  options: MarkdownExportOptions,
): (date: Date) => string {
  if (options.formatDate) return options.formatDate;

  const build = (locale?: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: options.timeZone,
    });
  let built: Intl.DateTimeFormat | null = null;
  try {
    built = build(options.locale);
  } catch {
    try {
      // The tag was rejected. The retry can fail in its turn, on an engine
      // that does not know the time zone, and a date is not worth a throw.
      built = build(undefined);
    } catch {
      built = null;
    }
  }
  const formatter = built;
  return formatter
    ? (date) => formatter.format(date)
    : (date) => date.toISOString();
}

/**
 * Both the built-in and the injected formatter go through one wrapper, so
 * the no-break space normalization is applied, and covered by its test,
 * whichever one is in use.
 */
function makeDateFormatter(
  options: MarkdownExportOptions,
): (date: Date) => string {
  const format = rawDateFormatter(options);
  return (date) => format(date).replace(NO_BREAK_SPACES, " ");
}

/**
 * "GMT+01:00" for the zone at that moment. A second formatter is needed
 * because `timeZoneName` cannot be combined with `dateStyle`/`timeStyle`. An
 * offset tells a reader in another zone what they need; an IANA name would
 * also disclose roughly where the visitor is.
 */
function utcOffset(date: Date, timeZone?: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone,
      timeZoneName: "longOffset",
    }).formatToParts(date);
    return parts.find((part) => part.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

/**
 * A code span whose delimiter is one backtick longer than the longest run
 * inside it, so nothing in the text needs escaping.
 */
function codeSpan(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean === "") return "";
  const longest = Math.max(
    0,
    ...(clean.match(/`+/g) ?? []).map((run) => run.length),
  );
  const ticks = "`".repeat(longest + 1);
  const pad = clean.startsWith("`") || clean.endsWith("`") ? " " : "";
  return `${ticks}${pad}${clean}${pad}${ticks}`;
}

const URL_ESCAPES: Record<string, string> = {
  "(": "%28",
  ")": "%29",
  "<": "%3C",
  ">": "%3E",
  "\\": "%5C",
};

function sourceLine(source: Source, index: number): string {
  // The title must not close the link text, span lines, start an autolink,
  // or open a tag a viewer would render.
  const title = asText(source.title || source.url)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\\[\]<]/g, "\\$&");
  const safe = sanitizeUrl(asText(source.url));
  if (!safe) return `${index + 1}. ${title}`;
  // Nor may the URL end the link destination, or escape the paren that does.
  const url = safe
    .replace(/[()<>\\]/g, (ch) => URL_ESCAPES[ch])
    .replace(/\s/g, "%20");
  return `${index + 1}. [${title}](${url})`;
}

function attachmentLine(attachment: ChatAttachment): string {
  const name = codeSpan(asText(attachment.name));
  const size = formatBytes(Number(attachment.size));
  return `- ${name} (${asText(attachment.mediaType)}, ${size})`;
}

/**
 * A value as text. Persisted history is restored from `sessionStorage`
 * without validation, so any field can hold anything `JSON.parse` produces,
 * and an export must still be a file rather than a throw on the host page.
 */
function asText(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

/** The entries of a field that should hold a list of objects. */
function objectsIn<T>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry) => entry !== null && typeof entry === "object",
  ) as T[];
}

/**
 * The conversation as a Markdown transcript: a title, the export time, then
 * one `##` heading per message with its text, attachments, tools, and
 * citations. Never throws on message content.
 */
export function conversationToMarkdown(
  messages: readonly ChatMessage[],
  options: MarkdownExportOptions,
): string {
  const { labels } = options;
  const formatDate = makeDateFormatter(options);
  const now = options.now ?? new Date();
  const offset = utcOffset(now, options.timeZone);
  const exportedAt = formatDate(now) + (offset ? ` (${offset})` : "");

  const blocks: string[] = [
    `# ${labels.title}`,
    interpolate(labels.exported, { date: exportedAt }),
  ];

  for (const message of messages) {
    if (message === null || typeof message !== "object") continue;

    const role = message.role === "user" ? labels.user : labels.assistant;
    const created = message.createdAt ? new Date(message.createdAt) : null;
    const time =
      created && !Number.isNaN(created.getTime())
        ? ` · ${formatDate(created)}`
        : "";
    blocks.push(`## ${role}${time}`);

    const body = protectMessageText(asText(message.content));
    if (body) blocks.push(body);

    const attachments = objectsIn<ChatAttachment>(message.attachments);
    if (attachments.length) {
      blocks.push(
        labels.attachments,
        attachments.map(attachmentLine).join("\n"),
      );
    }
    const toolUses = objectsIn<{ name?: string }>(message.toolUses);
    if (toolUses.length) {
      blocks.push(
        toolUses
          .map(
            (toolUse) => `${labels.toolUsed} ${codeSpan(asText(toolUse.name))}`,
          )
          .join("  \n"),
      );
    }
    const sources = objectsIn<Source>(message.sources);
    if (sources.length) {
      blocks.push(labels.sources, sources.map(sourceLine).join("\n"));
    }
  }

  return blocks.join("\n\n") + "\n";
}

/**
 * The conversation as JSON: the `ChatMessage[]` the widget persists, which
 * means without inline attachment bytes.
 */
export function conversationToJson(messages: readonly ChatMessage[]): string {
  const usable = messages
    .filter((message) => message !== null && typeof message === "object")
    .map((message) =>
      message.attachments === undefined
        ? message
        : {
            ...message,
            attachments: objectsIn<ChatAttachment>(message.attachments),
          },
    );
  return JSON.stringify(stripAttachmentData(usable), null, 2) + "\n";
}

/** `chat-transcript-YYYY-MM-DD.<extension>`, by the visitor's local date. */
export function exportFilename(
  extension: "md" | "json",
  options: { now?: Date; timeZone?: string } = {},
): string {
  const now = options.now ?? new Date();
  let stamp: string;
  try {
    // Assembled from parts so it does not depend on any locale's pattern.
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: options.timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const get = (type: string) =>
      parts.find((part) => part.type === type)?.value ?? "";
    stamp = `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    stamp = now.toISOString().slice(0, 10);
  }
  return `chat-transcript-${stamp}.${extension}`;
}
