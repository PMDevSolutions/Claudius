import { describe, it, expect } from "vitest";
import { stabilizeStreamingMarkdown } from "../stabilizeStreamingMarkdown";

describe("stabilizeStreamingMarkdown", () => {
  it("returns balanced text unchanged", () => {
    expect(stabilizeStreamingMarkdown("plain text")).toBe("plain text");
    expect(stabilizeStreamingMarkdown("**bold** and *italic*")).toBe(
      "**bold** and *italic*",
    );
    expect(stabilizeStreamingMarkdown("")).toBe("");
  });

  it("closes an unclosed bold span so it renders bold while streaming", () => {
    expect(stabilizeStreamingMarkdown("see **important det")).toBe(
      "see **important det**",
    );
  });

  it("hides a bare bold opener until content arrives", () => {
    expect(stabilizeStreamingMarkdown("see **")).toBe("see ");
    expect(stabilizeStreamingMarkdown("see ** ")).toBe("see  ");
  });

  it("closes an unclosed italic span", () => {
    expect(stabilizeStreamingMarkdown("very *importa")).toBe("very *importa*");
  });

  it("hides a bare italic opener", () => {
    expect(stabilizeStreamingMarkdown("very *")).toBe("very ");
  });

  it("resolves a half-streamed bold closer without leaking asterisks", () => {
    // "**bo" + "*" — the closing "**" has only half-arrived.
    expect(stabilizeStreamingMarkdown("**bo*")).toBe("**bo**");
  });

  it("only stabilizes the last line", () => {
    expect(stabilizeStreamingMarkdown("**stray line\nnow **bold te")).toBe(
      "**stray line\nnow **bold te**",
    );
  });

  it("handles mixed complete and incomplete spans on one line", () => {
    expect(stabilizeStreamingMarkdown("**done** and **more com")).toBe(
      "**done** and **more com**",
    );
    expect(stabilizeStreamingMarkdown("*done* then *hal")).toBe(
      "*done* then *hal*",
    );
  });
});
