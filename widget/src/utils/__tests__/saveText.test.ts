import { describe, it, expect, vi, afterEach } from "vitest";
import { copyText, downloadTextFile } from "../saveText";

type Doc = Document & { execCommand?: (command: string) => boolean };

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", { value, configurable: true });
}

/** jsdom's Blob has no text(), so read it the long way. */
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

afterEach(() => {
  setClipboard(undefined);
  delete (document as Doc).execCommand;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("copyText", () => {
  it("uses the async clipboard API", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });

    await expect(copyText("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("calls writeText before yielding, inside the caller's user activation", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });

    void copyText("hello");

    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it("falls back to execCommand when the API refuses", async () => {
    setClipboard({
      writeText: vi
        .fn()
        .mockRejectedValue(new DOMException("no", "NotAllowedError")),
    });
    let copied = "";
    (document as Doc).execCommand = vi.fn(() => {
      copied = (document.activeElement as HTMLTextAreaElement).value;
      return true;
    });

    await expect(copyText("hello")).resolves.toBe(true);
    expect(copied).toBe("hello");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("falls back when there is no clipboard API, as on an insecure origin", async () => {
    (document as Doc).execCommand = vi.fn(() => true);

    await expect(copyText("hello")).resolves.toBe(true);
    expect((document as Doc).execCommand).toHaveBeenCalledWith("copy");
  });

  it("resolves false, never rejects, when both paths fail", async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error("no")) });
    (document as Doc).execCommand = vi.fn(() => {
      throw new Error("blocked");
    });

    await expect(copyText("hello")).resolves.toBe(false);
  });

  it("resolves false and tidies up when the DOM itself refuses", async () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();
    // A locked-down document can refuse any step of the fallback, not just
    // the copy command.
    vi.spyOn(HTMLTextAreaElement.prototype, "select").mockImplementation(() => {
      throw new Error("blocked");
    });
    (document as Doc).execCommand = vi.fn(() => true);

    await expect(copyText("hello")).resolves.toBe(false);
    expect(document.querySelector("textarea")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("still resolves when returning focus after the fallback throws", async () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();
    vi.spyOn(button, "focus").mockImplementation(() => {
      throw new Error("blocked");
    });
    (document as Doc).execCommand = vi.fn(() => true);

    // The copy itself worked, so tidying up must not turn it into a failure.
    await expect(copyText("hello")).resolves.toBe(true);
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("resolves false when even reading the focused element throws", async () => {
    // Nothing in the fallback may reach the caller as a rejection, including
    // the statements that run before its own try block.
    vi.spyOn(document, "activeElement", "get").mockImplementation(() => {
      throw new Error("blocked");
    });
    (document as Doc).execCommand = vi.fn(() => true);

    await expect(copyText("hello")).resolves.toBe(false);
  });

  it("keeps the temporary textarea out of the tab order", async () => {
    // If it can ever be left behind, it must not become a keyboard stop that
    // holds the whole transcript while hidden from assistive technology.
    let tabIndex: number | undefined;
    (document as Doc).execCommand = vi.fn(() => {
      tabIndex = document.querySelector("textarea")?.tabIndex;
      return true;
    });

    await copyText("hello");

    expect(tabIndex).toBe(-1);
  });

  it("returns focus even when removing the textarea throws", async () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();
    vi.spyOn(HTMLTextAreaElement.prototype, "remove").mockImplementation(() => {
      throw new Error("blocked");
    });
    (document as Doc).execCommand = vi.fn(() => true);

    await expect(copyText("hello")).resolves.toBe(true);
    expect(document.activeElement).toBe(button);
  });

  it("returns focus to where it was after the fallback", async () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();
    (document as Doc).execCommand = vi.fn(() => true);

    await copyText("hello");

    expect(document.activeElement).toBe(button);
  });
});

describe("downloadTextFile", () => {
  it("clicks a temporary download link to a Blob of the text", async () => {
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((b: Blob) => {
      blob = b;
      return "blob:claudius-test";
    });
    URL.revokeObjectURL = vi.fn();
    // Mocked so jsdom does not try to navigate. `contexts` holds each call's
    // `this`, which is the link that was clicked.
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    downloadTextFile("chat.md", "# Hi", "text/markdown;charset=utf-8");

    const clicked = click.mock.contexts[0] as HTMLAnchorElement;
    expect(clicked.download).toBe("chat.md");
    expect(clicked.href).toBe("blob:claudius-test");
    expect(blob?.type).toBe("text/markdown;charset=utf-8");
    await expect(readBlob(blob as Blob)).resolves.toBe("# Hi");
    expect(document.querySelector("a")).toBeNull();
  });

  it("revokes the object URL later, not before the download starts", () => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => "blob:claudius-test");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadTextFile("chat.json", "[]", "application/json");

    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(40_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:claudius-test");
  });
});
