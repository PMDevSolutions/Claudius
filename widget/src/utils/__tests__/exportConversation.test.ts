import { describe, it, expect, vi } from "vitest";
import {
  conversationToJson,
  conversationToMarkdown,
  exportFilename,
  protectMessageText,
  type TranscriptLabels,
} from "../exportConversation";
import type { ChatMessage } from "../../api/types";

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

    it("leaves trailing spaces alone inside a fence that was never closed", () => {
      expect(protectMessageText("```js\nconst a = 1;   ")).toBe(
        "```js\nconst a = 1;   \n```",
      );
    });

    it("keeps blank lines inside a fence that was never closed, minus the final line terminator", () => {
      expect(protectMessageText("```js\nconst a = 1;\n\n\n")).toBe(
        "```js\nconst a = 1;\n\n\n```",
      );
      expect(protectMessageText("```js\nconst a = 1;\n")).toBe(
        "```js\nconst a = 1;\n```",
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

const labels: TranscriptLabels = {
  title: "Chat transcript",
  exported: "Exported {date}",
  user: "User",
  assistant: "Assistant",
  attachments: "Attachments:",
  sources: "Sources:",
  toolUsed: "Used tool:",
};

// Asia/Kolkata is a fixed +05:30 with no DST, so exact strings are stable
// across ICU versions. 14:32 UTC is 8:02 PM there.
const base = {
  labels,
  locale: "en-US",
  timeZone: "Asia/Kolkata",
  now: new Date("2026-09-19T14:32:00.000Z"),
};
const T = "2026-09-19T14:03:00.000Z";

describe("conversationToMarkdown", () => {
  it("writes a title, the export time, and one heading per message", () => {
    const messages: ChatMessage[] = [
      { id: "msg-1", role: "user", content: "Hi", createdAt: T },
      { id: "msg-2", role: "assistant", content: "Hello!", createdAt: T },
    ];
    expect(conversationToMarkdown(messages, base)).toBe(
      [
        "# Chat transcript",
        "",
        "Exported Sep 19, 2026, 8:02 PM (GMT+05:30)",
        "",
        "## User · Sep 19, 2026, 7:33 PM",
        "",
        "Hi",
        "",
        "## Assistant · Sep 19, 2026, 7:33 PM",
        "",
        "Hello!",
        "",
      ].join("\n"),
    );
  });

  it("formats dates in the given locale", () => {
    const md = conversationToMarkdown(
      [{ id: "1", role: "user", content: "Hallo", createdAt: T }],
      { ...base, locale: "de-DE" },
    );
    expect(md).toContain("## User · 19.09.2026, 19:33");
  });

  it("falls back to the default locale when the tag is invalid", () => {
    expect(() =>
      conversationToMarkdown(
        [{ id: "1", role: "user", content: "Hi", createdAt: T }],
        { ...base, locale: "not a locale!" },
      ),
    ).not.toThrow();
  });

  it("replaces the no-break spaces some engines put in dates", () => {
    const md = conversationToMarkdown(
      [{ id: "1", role: "user", content: "Hi", createdAt: T }],
      { ...base, formatDate: () => "2:03\u202fPM\u00a0IST" },
    );
    expect(md).toContain("## User · 2:03 PM IST");
    expect(md).not.toMatch(/[\u00a0\u202f]/);
  });

  it("omits the offset where longOffset is unsupported", () => {
    const Real = Intl.DateTimeFormat;
    // A regular function, not an arrow: it is called with `new`.
    const spy = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (
      locale?: string | string[],
      options?: Intl.DateTimeFormatOptions,
    ) {
      if (options?.timeZoneName) throw new RangeError("unsupported");
      return new Real(locale, options);
    } as unknown as typeof Intl.DateTimeFormat);

    const md = conversationToMarkdown([], base);
    spy.mockRestore();

    expect(md).toBe("# Chat transcript\n\nExported Sep 19, 2026, 8:02 PM\n");
  });

  it("shows the role alone when a message has no usable time", () => {
    const md = conversationToMarkdown(
      [
        { id: "1", role: "user", content: "old" },
        { id: "2", role: "assistant", content: "bad", createdAt: "nonsense" },
      ],
      base,
    );
    expect(md).toContain("## User\n\nold");
    expect(md).toContain("## Assistant\n\nbad");
  });

  it("applies the text protections to each message", () => {
    const md = conversationToMarkdown(
      [
        { id: "1", role: "assistant", content: "```js\nconst a = 1;" },
        { id: "2", role: "user", content: "Thanks.\nBye." },
      ],
      base,
    );
    expect(md).toContain("```js\nconst a = 1;\n```\n\n## User");
    expect(md).toContain("Thanks.  \nBye.");
  });

  it("lists attachments by name, type, and size, and never their bytes", () => {
    const md = conversationToMarkdown(
      [
        {
          id: "1",
          role: "user",
          content: "",
          attachments: [
            {
              id: "att-1",
              name: "_draft_*final*.png",
              mediaType: "image/png",
              size: 49152,
              data: "QUJDREVGRw==",
              url: "https://files.example.com/att/1?sig=secret",
            },
          ],
        },
      ],
      base,
    );
    expect(md).toContain(
      "## User\n\nAttachments:\n\n- `_draft_*final*.png` (image/png, 48 KB)",
    );
    expect(md).not.toContain("QUJDREVGRw==");
    expect(md).not.toContain("sig=secret");
  });

  it("sizes a code span to the backticks inside the name", () => {
    const md = conversationToMarkdown(
      [
        {
          id: "1",
          role: "user",
          content: "",
          attachments: [
            {
              id: "a",
              name: "we`ird``.pdf",
              mediaType: "application/pdf",
              size: 10,
            },
            { id: "b", name: "`edge`", mediaType: "application/pdf", size: 10 },
          ],
        },
      ],
      base,
    );
    expect(md).toContain("- ```we`ird``.pdf``` (application/pdf, 10 B)");
    expect(md).toContain("- `` `edge` `` (application/pdf, 10 B)");
  });

  it("names the tools a reply used, without their inputs or results", () => {
    const md = conversationToMarkdown(
      [
        {
          id: "1",
          role: "assistant",
          content: "It is noon.",
          toolUses: [
            { name: "get_current_time", input: { tz: "UTC" }, result: "12:00" },
            { name: "search_knowledge_base" },
          ],
        },
      ],
      base,
    );
    expect(md).toContain(
      "Used tool: `get_current_time`  \nUsed tool: `search_knowledge_base`",
    );
    expect(md).not.toContain("12:00");
  });

  it("writes citations as a numbered list of escaped links", () => {
    const md = conversationToMarkdown(
      [
        {
          id: "1",
          role: "assistant",
          content: "See these.",
          sources: [
            {
              title: "Parsing [JSON]\nguide \\ notes",
              url: "https://example.com/json_(format)?q=a b&x=<y>",
              type: "page",
            },
            {
              title: "MDN",
              url: "https://developer.mozilla.org/",
              type: "external",
            },
          ],
        },
      ],
      base,
    );
    expect(md).toContain(
      "Sources:\n\n" +
        "1. [Parsing \\[JSON\\] guide \\\\ notes](https://example.com/json_%28format%29?q=a%20b&x=%3Cy%3E)\n" +
        "2. [MDN](https://developer.mozilla.org/)",
    );
  });

  it("drops the link, not the citation, when a URL is not http(s)", () => {
    const md = conversationToMarkdown(
      [
        {
          id: "1",
          role: "assistant",
          content: "x",
          sources: [
            { title: "Click me", url: "javascript:alert(1)", type: "external" },
          ],
        },
      ],
      base,
    );
    expect(md).toContain("1. Click me");
    expect(md).not.toContain("javascript:");
  });

  it("exports an empty conversation as the header alone", () => {
    expect(conversationToMarkdown([], base)).toBe(
      "# Chat transcript\n\nExported Sep 19, 2026, 8:02 PM (GMT+05:30)\n",
    );
  });
});

describe("conversationToJson", () => {
  const messages: ChatMessage[] = [
    {
      id: "msg-1",
      role: "user",
      content: 'Quote " slash \\ emoji 👋 separator \u2028 end',
      createdAt: T,
      attachments: [
        {
          id: "att-1",
          name: "a.png",
          mediaType: "image/png",
          size: 3,
          data: "QUJD",
        },
      ],
    },
    {
      id: "msg-2",
      role: "assistant",
      content: "Hello!",
      createdAt: T,
      sources: [{ title: "Docs", url: "https://example.com", type: "page" }],
    },
  ];

  it("is the message array itself, pretty-printed, ending in a newline", () => {
    const json = conversationToJson(messages);
    expect(json.endsWith("\n")).toBe(true);
    expect(json).toContain('\n  {\n    "id": "msg-1"');
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].content).toBe(messages[0].content);
    expect(parsed[1]).toEqual(messages[1]);
  });

  it("never includes inline attachment bytes", () => {
    const json = conversationToJson(messages);
    expect(json).not.toContain("QUJD");
    expect(JSON.parse(json)[0].attachments[0]).toEqual({
      id: "att-1",
      name: "a.png",
      mediaType: "image/png",
      size: 3,
    });
  });

  it("does not modify the messages it was given", () => {
    conversationToJson(messages);
    expect(messages[0].attachments?.[0].data).toBe("QUJD");
  });
});

describe("exportFilename", () => {
  it("uses the visitor's local date, not the UTC date", () => {
    const now = new Date("2026-09-19T14:03:00.000Z");
    expect(exportFilename("md", { now, timeZone: "Pacific/Auckland" })).toBe(
      "chat-transcript-2026-09-20.md",
    );
    expect(
      exportFilename("json", { now, timeZone: "America/Los_Angeles" }),
    ).toBe("chat-transcript-2026-09-19.json");
  });
});
