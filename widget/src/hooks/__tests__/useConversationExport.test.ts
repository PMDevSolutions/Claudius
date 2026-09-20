import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useConversationExport } from "../useConversationExport";
import { copyText, downloadTextFile } from "../../utils/saveText";
import { locales } from "../../locales";
import type { ChatMessage } from "../../api/types";

vi.mock("../../utils/saveText", () => ({
  copyText: vi.fn(),
  downloadTextFile: vi.fn(),
}));

const messages: ChatMessage[] = [
  {
    id: "msg-1",
    role: "user",
    content: "Hi",
    createdAt: "2026-09-19T14:03:00.000Z",
  },
  { id: "msg-2", role: "assistant", content: "Hello!" },
];

const base = { enabled: true, messages, busy: false, locale: "en-US" };

function item(
  result: { current: ReturnType<typeof useConversationExport> },
  id: string,
) {
  const found = result.current.items.find((i) => i.id === id);
  if (!found) throw new Error(`no item ${id}`);
  return found;
}

describe("useConversationExport", () => {
  beforeEach(() => {
    vi.mocked(copyText).mockReset().mockResolvedValue(true);
    vi.mocked(downloadTextFile).mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("offers nothing when the feature is off", () => {
    const { result } = renderHook(() =>
      useConversationExport({ ...base, enabled: false }),
    );
    expect(result.current.items).toEqual([]);
  });

  it("offers copy, Markdown, and JSON, in that order", () => {
    const { result } = renderHook(() => useConversationExport(base));
    expect(
      result.current.items.map((i) => [i.id, i.label, i.disabled]),
    ).toEqual([
      ["copy-markdown", "Copy as Markdown", false],
      ["download-markdown", "Download as Markdown", false],
      ["download-json", "Download as JSON", false],
    ]);
  });

  it("disables every item while the conversation is empty or a reply is in flight", () => {
    const empty = renderHook(() =>
      useConversationExport({ ...base, messages: [] }),
    );
    expect(empty.result.current.items.every((i) => i.disabled)).toBe(true);

    const busy = renderHook(() =>
      useConversationExport({ ...base, busy: true }),
    );
    expect(busy.result.current.items.every((i) => i.disabled)).toBe(true);
  });

  it("copies the Markdown transcript and reports success", async () => {
    const { result } = renderHook(() => useConversationExport(base));

    await act(async () => item(result, "copy-markdown").onSelect());

    const text = vi.mocked(copyText).mock.calls[0][0];
    expect(text).toContain("# Chat transcript");
    expect(text).toContain("## User · ");
    expect(text).toContain("## Assistant\n\nHello!");
    expect(result.current.status).toBe("Copied to clipboard");
  });

  it("hands the text to copyText before yielding, to keep the user activation", async () => {
    const { result } = renderHook(() => useConversationExport(base));
    let calledBeforeYielding = false;

    // Async act, so the status update that follows the copy lands inside it
    // instead of producing an act() warning. The count is read synchronously.
    await act(async () => {
      item(result, "copy-markdown").onSelect();
      calledBeforeYielding = vi.mocked(copyText).mock.calls.length === 1;
    });

    expect(calledBeforeYielding).toBe(true);
  });

  it("reports a failed copy", async () => {
    vi.mocked(copyText).mockResolvedValue(false);
    const { result } = renderHook(() => useConversationExport(base));

    await act(async () => item(result, "copy-markdown").onSelect());

    expect(result.current.status).toBe(
      "Could not copy. Try downloading instead.",
    );
  });

  it("clears the status after four seconds, or on request", async () => {
    // Only the timer the hook uses, so React's act() scheduling is untouched.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { result } = renderHook(() => useConversationExport(base));

    await act(async () => item(result, "copy-markdown").onSelect());
    expect(result.current.status).not.toBeNull();
    act(() => vi.advanceTimersByTime(3999));
    expect(result.current.status).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.status).toBeNull();

    await act(async () => item(result, "copy-markdown").onSelect());
    act(() => result.current.clearStatus());
    expect(result.current.status).toBeNull();
  });

  it("downloads Markdown and JSON with a dated filename and the right type", () => {
    const { result } = renderHook(() => useConversationExport(base));

    act(() => item(result, "download-markdown").onSelect());
    act(() => item(result, "download-json").onSelect());

    const [md, json] = vi.mocked(downloadTextFile).mock.calls;
    expect(md[0]).toMatch(/^chat-transcript-\d{4}-\d{2}-\d{2}\.md$/);
    expect(md[1]).toContain("# Chat transcript");
    expect(md[2]).toBe("text/markdown;charset=utf-8");
    expect(json[0]).toMatch(/^chat-transcript-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(json[1])).toEqual(messages);
    expect(json[2]).toBe("application/json");
    expect(result.current.status).toBeNull();
  });

  it("writes the menu and the transcript in the widget's language", async () => {
    const { result } = renderHook(() =>
      useConversationExport({
        ...base,
        locale: "de-DE",
        translations: locales.de,
      }),
    );
    expect(result.current.items[0].label).toBe("Als Markdown kopieren");

    await act(async () => item(result, "copy-markdown").onSelect());

    const text = vi.mocked(copyText).mock.calls[0][0];
    expect(text).toContain("# Chat-Protokoll");
    expect(text).toContain("## Nutzer · ");
    expect(result.current.status).toBe("In die Zwischenablage kopiert");
  });

  it("does not set state after unmount", async () => {
    let resolve!: (ok: boolean) => void;
    vi.mocked(copyText).mockReturnValue(new Promise((r) => (resolve = r)));
    const { result, unmount } = renderHook(() => useConversationExport(base));

    act(() => item(result, "copy-markdown").onSelect());
    unmount();
    await act(async () => resolve(true));

    expect(result.current.status).toBeNull();
  });
});
