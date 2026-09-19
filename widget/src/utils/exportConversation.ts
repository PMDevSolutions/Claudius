interface OpenFence {
  indent: string;
  char: string;
  length: number;
}

const FENCE_OPEN = /^([ \t]*)(`{3,}|~{3,})(.*)$/;
// A line-leading "<" that CommonMark could read as the start of an HTML block.
const HTML_BLOCK_START = /^( {0,3})<(?=[A-Za-z!?/])/;
const INDENTED = /^(?: {4}|\t)/;

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
  return { indent, char: run[0], length: run.length };
}

/** A closer is the opener's character alone, at least as many times. */
function closesFence(line: string, fence: OpenFence): boolean {
  const trimmed = line.trim();
  if (trimmed.length < fence.length) return false;
  for (const ch of trimmed) {
    if (ch !== fence.char) return false;
  }
  return true;
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
 * - line endings are normalized and trailing blank lines dropped.
 *
 * Text inside a fenced block is never modified.
 */
export function protectMessageText(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").replace(/\s+$/, "").split("\n");
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
    if (breakable) result = result.replace(/[ \t]+$/, "") + "  ";
    out.push(result);
  }

  if (fence) out.push(fence.indent + fence.char.repeat(fence.length));
  return out.join("\n");
}
