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

    it("does not end a fence at a fence four columns further in", () => {
      // Markdown about Markdown: the inner block belongs to the list item and
      // is indented past it. CommonMark reads a run four or more columns
      // beyond its container as code, so it cannot close the outer block.
      const text = [
        "```markdown",
        "1. Add the snippet:",
        "",
        "    ```html",
        "    <p>hi</p>",
        "    ```",
        "",
        "<details>",
        "<summary>More</summary>",
        "```",
      ].join("\n");
      expect(protectMessageText(text)).toBe(text);
    });

    it("keeps scanning past a run of fence characters indented out of reach", () => {
      expect(protectMessageText("```\ncode\n    ```\nmore\n```")).toBe(
        "```\ncode\n    ```\nmore\n```",
      );
    });

    it("ends a fence at a closer up to three columns further in", () => {
      expect(protectMessageText("1. Run:\n\n   ```\n   npm i\n      ```")).toBe(
        "1. Run:\n\n   ```\n   npm i\n      ```",
      );
    });

    it("measures both indents in columns, with tabs at four-column stops", () => {
      // One tab is four columns, so this closer is out of the opener's reach.
      expect(protectMessageText("```\ncode\n\t```")).toBe(
        "```\ncode\n\t```\n```",
      );
      // Seven spaces are three columns past a tab-indented opener, so they
      // are still within it.
      expect(protectMessageText("\t```\n\tcode\n       ```\nnext")).toBe(
        "\t```\n\tcode\n       ```\nnext",
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

    it("leaves a line-leading autolink alone, which cannot open a block", () => {
      expect(protectMessageText("<https://example.com/docs>")).toBe(
        "<https://example.com/docs>",
      );
      expect(protectMessageText("<mailto:a@b.co>")).toBe("<mailto:a@b.co>");
      expect(protectMessageText("<help@example.com>")).toBe(
        "<help@example.com>",
      );
      expect(protectMessageText("<a.b-c+d@example.co.uk>")).toBe(
        "<a.b-c+d@example.co.uk>",
      );
    });

    it("still escapes a block opener dressed up as an email autolink", () => {
      // Each of these opens an HTML block that runs across blank lines until a
      // terminator that never comes, so it would hide every later message.
      expect(protectMessageText("<!--a@b>")).toBe("\\<!--a@b>");
      expect(protectMessageText("<!--noreply@example.com>")).toBe(
        "\\<!--noreply@example.com>",
      );
      expect(protectMessageText("<?a@b>")).toBe("\\<?a@b>");
      expect(protectMessageText("<![CDATA[a@b>")).toBe("\\<![CDATA[a@b>");
      expect(protectMessageText("<!--https://user@host/x>")).toBe(
        "\\<!--https://user@host/x>",
      );
    });

    it("escapes an address that is a valid autolink and a block opener at once", () => {
      // CommonMark allows "?" and "!" in an address, so these really are
      // autolinks. They also open a processing instruction and a declaration
      // that never close, and hiding the transcript is the worse outcome.
      expect(protectMessageText("<?q@example.com>")).toBe("\\<?q@example.com>");
      expect(protectMessageText("<!weird@example.com>")).toBe(
        "\\<!weird@example.com>",
      );
    });
  });

  it("trims trailing whitespace without backtracking over it", () => {
    // A long run of spaces that is not at the end of the line makes a
    // backtracking regex quadratic. The bound is generous on purpose: this
    // pins the shape of the algorithm, not the speed of the machine.
    const line = "a" + " ".repeat(50_000) + "b";
    const started = performance.now();
    expect(protectMessageText(`${line}   \nnext`)).toBe(`${line}  \nnext`);
    expect(performance.now() - started).toBeLessThan(1000);
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

  it("escapes a < in a title, so it cannot autolink or emit raw HTML", () => {
    const md = conversationToMarkdown(
      [
        {
          id: "1",
          role: "assistant",
          content: "x",
          sources: [
            {
              title: "<javascript:alert(1)>",
              url: "https://ok.example/",
              type: "page",
            },
            {
              title: "<img src=x onerror=alert(1)>",
              url: "https://ok.example/",
              type: "page",
            },
          ],
        },
      ],
      base,
    );
    expect(md).toContain("1. [\\<javascript:alert(1)>](https://ok.example/)");
    expect(md).toContain(
      "2. [\\<img src=x onerror=alert(1)>](https://ok.example/)",
    );
  });

  it("encodes a backslash in a URL, which would escape the closing paren", () => {
    const md = conversationToMarkdown(
      [
        {
          id: "1",
          role: "assistant",
          content: "x",
          sources: [
            { title: "Docs", url: "https://example.com/a\\", type: "page" },
          ],
        },
      ],
      base,
    );
    expect(md).toContain("1. [Docs](https://example.com/a%5C)");
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

// `loadMessages` hands back whatever sessionStorage held, unvalidated, so
// every shape JSON.parse can produce has to come out as a file, not a throw
// on the host page.
describe("history that is not what the types promise", () => {
  const cases: Array<[string, unknown[]]> = [
    ["a number for content", [{ id: "1", role: "user", content: 42 }]],
    ["an object for content", [{ id: "1", role: "user", content: { a: 1 } }]],
    ["an array for content", [{ id: "1", role: "user", content: ["a"] }]],
    ["a null message", [null]],
    ["a string for a whole message", ["hi"]],
    [
      "sources that are not a list",
      [{ id: "1", role: "assistant", content: "x", sources: { length: 1 } }],
    ],
    [
      "an empty source",
      [{ id: "1", role: "assistant", content: "x", sources: [{}] }],
    ],
    [
      "a null source",
      [{ id: "1", role: "assistant", content: "x", sources: [null] }],
    ],
    [
      "a number for a source title",
      [
        {
          id: "1",
          role: "assistant",
          content: "x",
          sources: [{ title: 5, url: "https://a.b" }],
        },
      ],
    ],
    [
      "an empty attachment",
      [{ id: "1", role: "user", content: "x", attachments: [{}] }],
    ],
    [
      "a null attachment",
      [{ id: "1", role: "user", content: "x", attachments: [null] }],
    ],
    [
      "an empty tool use",
      [{ id: "1", role: "assistant", content: "x", toolUses: [{}] }],
    ],
    [
      "tool uses that are not a list",
      [{ id: "1", role: "assistant", content: "x", toolUses: "abc" }],
    ],
  ];

  it.each(cases)("exports %s", (_name, messages) => {
    const list = messages as ChatMessage[];
    expect(conversationToMarkdown(list, base)).toContain("# Chat transcript");
    expect(JSON.parse(conversationToJson(list))).toBeInstanceOf(Array);
  });

  it("writes a content that is not a string as text", () => {
    const md = conversationToMarkdown(
      [{ id: "1", role: "user", content: 42 } as unknown as ChatMessage],
      base,
    );
    expect(md).toContain("## User\n\n42");
  });

  it("skips an entry that is not a message at all", () => {
    const md = conversationToMarkdown(
      [null, { id: "1", role: "user", content: "Hi" }] as ChatMessage[],
      base,
    );
    expect(md).toContain("## User\n\nHi");
    expect(md.match(/^## /gm)).toHaveLength(1);
  });

  it("lists an attachment whose fields are missing, with no bytes to show", () => {
    const md = conversationToMarkdown(
      [
        {
          id: "1",
          role: "user",
          content: "x",
          attachments: [{}],
        } as unknown as ChatMessage,
      ],
      base,
    );
    expect(md).toContain("Attachments:\n\n- ");
    expect(md).toContain("0 B");
  });

  it("falls back to an ISO date where the engine rejects the time zone", () => {
    const md = conversationToMarkdown(
      [{ id: "1", role: "user", content: "Hi", createdAt: T }],
      { ...base, timeZone: "Not/AZone" },
    );
    expect(md).toContain("## User · 2026-09-19T14:03:00.000Z");
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
