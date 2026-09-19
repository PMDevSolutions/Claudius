import { describe, it, expect } from "vitest";
import { protectMessageText } from "../exportConversation";

describe("protectMessageText", () => {
  describe("code fences", () => {
    it("keeps a long code block byte for byte", () => {
      const code = Array.from(
        { length: 5000 },
        (_, i) => `  line ${i}   `,
      ).join("\n");
      const text = "Here:\n\n```txt\n" + code + "\n```";
      expect(protectMessageText(text)).toBe(text);
    });

    it("closes a fence left open by a stopped reply", () => {
      expect(protectMessageText("Try:\n\n```js\nconst a = 1;")).toBe(
        "Try:\n\n```js\nconst a = 1;\n```",
      );
    });

    it("closes with the opener's character, length, and indentation", () => {
      expect(protectMessageText("1. Run:\n\n   ~~~~bash\n   npm i")).toBe(
        "1. Run:\n\n   ~~~~bash\n   npm i\n   ~~~~",
      );
    });

    it("does not end a longer fence at a shorter one inside it", () => {
      const text = "````md\n```js\ncode\n```\n````";
      expect(protectMessageText(text)).toBe(text);
    });

    it("does not end a fence at a line that carries an info string", () => {
      expect(protectMessageText("```\n```js\nx")).toBe("```\n```js\nx\n```");
    });

    it("does not end a backtick fence with tildes", () => {
      expect(protectMessageText("```\n~~~\nx")).toBe("```\n~~~\nx\n```");
    });

    it("treats three backticks followed by more backticks as inline code", () => {
      expect(protectMessageText("```not a fence``` here\nnext")).toBe(
        "```not a fence``` here  \nnext",
      );
    });
  });

  describe("hard line breaks", () => {
    it("turns a single newline into a hard break, and leaves blank lines", () => {
      expect(protectMessageText("One.\nTwo.\n\nThree.")).toBe(
        "One.  \nTwo.\n\nThree.",
      );
    });

    it("adds none inside code, on indented lines, or after a backslash", () => {
      expect(protectMessageText("```\na\nb\n```")).toBe("```\na\nb\n```");
      expect(protectMessageText("    a\n    b")).toBe("    a\n    b");
      expect(protectMessageText("\ta\n\tb")).toBe("\ta\n\tb");
      expect(protectMessageText("a\\\nb")).toBe("a\\\nb");
    });

    it("replaces existing trailing whitespace instead of stacking on it", () => {
      expect(protectMessageText("One. \t\nTwo.")).toBe("One.  \nTwo.");
    });
  });

  describe("HTML blocks", () => {
    it("escapes a line-leading < that could open an unterminated block", () => {
      expect(protectMessageText("<!-- note")).toBe("\\<!-- note");
      expect(protectMessageText("<script>alert(1)")).toBe("\\<script>alert(1)");
      expect(protectMessageText("</div>")).toBe("\\</div>");
      expect(protectMessageText("  <?php")).toBe("  \\<?php");
    });

    it("leaves < alone inside code, mid-line, and when it is not a tag", () => {
      expect(protectMessageText("```html\n<script>\n```")).toBe(
        "```html\n<script>\n```",
      );
      expect(protectMessageText("a < b and <b>bold</b>")).toBe(
        "a < b and <b>bold</b>",
      );
      expect(protectMessageText("< 5 items")).toBe("< 5 items");
    });
  });

  it("normalizes CRLF and drops trailing blank lines", () => {
    expect(protectMessageText("One.\r\nTwo.\r\n\r\n")).toBe("One.  \nTwo.");
  });

  it("passes emoji and right-to-left text through untouched", () => {
    const text = "שלום 👋 مرحبا";
    expect(protectMessageText(text)).toBe(text);
  });

  it("returns an empty string for empty or whitespace-only text", () => {
    expect(protectMessageText("")).toBe("");
    expect(protectMessageText("  \n\n")).toBe("");
  });
});
