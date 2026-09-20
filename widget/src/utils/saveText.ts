/**
 * Copy through a hidden textarea, for where the async API is unavailable.
 * Every step is inside the try, not just the copy command: a locked-down
 * document can refuse any of them, and this is the caller's last resort, so
 * it answers with `false` rather than throwing on the host page.
 */
function legacyCopy(text: string): boolean {
  const previous = document.activeElement as HTMLElement | null;
  let area: HTMLTextAreaElement | null = null;
  try {
    area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.setAttribute("aria-hidden", "true");
    // Out of the tab order: if removal ever fails, it must not be left behind
    // as a keyboard stop holding the transcript, hidden from assistive tech.
    area.tabIndex = -1;
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.left = "0";
    area.style.opacity = "0";
    document.body.appendChild(area);
    // select() alone does not focus the field everywhere (iOS Safari), and the
    // copy command acts on the focused element's selection.
    area.focus({ preventScroll: true });
    area.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    // In a finally, so a refusal cannot leave the textarea on the page or
    // the visitor's focus inside it. Each step is guarded on its own: a throw
    // here would replace the result above and reject the caller's promise,
    // and a failed removal must not cost the visitor their focus as well.
    try {
      area?.remove();
    } catch {
      // Nothing more can be done about the textarea.
    }
    try {
      previous?.focus();
    } catch {
      // Nor about focus.
    }
  }
}

/**
 * Copy text to the clipboard. Resolves to whether it worked and never
 * rejects.
 *
 * Call it synchronously from a click handler: `writeText` runs before the
 * first `await`, while the transient activation Firefox and Safari require is
 * still present. The async API is missing on insecure origins and refuses in
 * an iframe without `clipboard-write`, so both cases fall back to
 * `execCommand`.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Refused. Try the legacy path.
  }
  try {
    return legacyCopy(text);
  } catch {
    // legacyCopy guards its own steps, but "never rejects" should not depend
    // on auditing each statement in it, including the ones before its try.
    return false;
  }
}

// Revoking straight away cancels the download in some browsers. FileSaver.js
// settled on 40 seconds, and a pending timer costs nothing.
const REVOKE_AFTER_MS = 40_000;

/** Save text as a file through a temporary `<a download>`. */
export function downloadTextFile(
  filename: string,
  text: string,
  mimeType: string,
): void {
  // No byte-order mark: it is invalid in JSON and breaks some Markdown tools.
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}
