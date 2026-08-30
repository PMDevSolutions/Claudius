/**
 * Stabilizes partially streamed message text so the inline-markdown renderer
 * never flashes raw `**`/`*` markers while a reply is still arriving.
 *
 * Only the last line is touched (the renderer formats per line, so earlier
 * lines are already in their final form):
 *
 * - An unclosed `**bold` span is closed, so text renders bold as it streams
 *   instead of showing literal asterisks that later "pop" into bold.
 * - A bare trailing opener with no visible content yet (`"see **"`) is hidden
 *   until content arrives.
 * - The same is applied to single-`*` italic spans.
 *
 * Applied only while a message is streaming; the final text renders verbatim.
 */
export function stabilizeStreamingMarkdown(text: string): string {
  const nl = text.lastIndexOf("\n");
  const head = nl === -1 ? "" : text.slice(0, nl + 1);
  let line = nl === -1 ? text : text.slice(nl + 1);
  line = closeBold(line);
  line = closeItalic(line);
  return head + line;
}

/** Start indexes of `**` markers in the line (non-overlapping). */
function boldMarkerPositions(line: string): number[] {
  const positions: number[] = [];
  for (let i = 0; i < line.length - 1; i++) {
    if (line[i] === "*" && line[i + 1] === "*") {
      positions.push(i);
      i++;
    }
  }
  return positions;
}

/** Indexes of `*` characters that are not part of a `**` marker. */
function loneStarPositions(line: string): number[] {
  const positions: number[] = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== "*") continue;
    if (line[i + 1] === "*") {
      i++;
      continue;
    }
    positions.push(i);
  }
  return positions;
}

function closeBold(line: string): string {
  const markers = boldMarkerPositions(line);
  if (markers.length % 2 === 0) return line;

  const opener = markers[markers.length - 1];
  const after = line.slice(opener + 2);
  if (after.trim() === "") {
    // Opener with no content yet: hide it rather than rendering "****".
    return line.slice(0, opener) + after;
  }
  return line + "**";
}

function closeItalic(line: string): string {
  const stars = loneStarPositions(line);
  if (stars.length % 2 === 0) return line;

  const opener = stars[stars.length - 1];
  const after = line.slice(opener + 1);
  if (after.trim() === "") {
    return line.slice(0, opener) + after;
  }
  return line + "*";
}
