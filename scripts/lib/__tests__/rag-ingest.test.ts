import { describe, it, expect } from "vitest";
import {
  parseFrontmatter,
  firstHeading,
  chunkText,
  buildVectorRecords,
  toNdjson,
} from "../rag-ingest.js";

describe("parseFrontmatter", () => {
  it("extracts flat key/value frontmatter and strips it from the body", () => {
    const { frontmatter, body } = parseFrontmatter(
      `---\ntitle: Pricing\nurl: "https://e.com/pricing"\ntype: page\n---\n# Pricing\n\nBody.`,
    );
    expect(frontmatter).toEqual({
      title: "Pricing",
      url: "https://e.com/pricing",
      type: "page",
    });
    expect(body).toBe("# Pricing\n\nBody.");
  });

  it("returns the raw text unchanged without frontmatter", () => {
    const { frontmatter, body } = parseFrontmatter("Just text.");
    expect(frontmatter).toEqual({});
    expect(body).toBe("Just text.");
  });

  it("handles values containing colons", () => {
    const { frontmatter } = parseFrontmatter(
      "---\nurl: https://e.com/a\n---\nx",
    );
    expect(frontmatter.url).toBe("https://e.com/a");
  });
});

describe("firstHeading", () => {
  it("finds the first markdown heading", () => {
    expect(firstHeading("intro\n\n## Hours\ntext")).toBe("Hours");
  });
  it("returns undefined without headings", () => {
    expect(firstHeading("plain text")).toBeUndefined();
  });
});

describe("chunkText", () => {
  it("keeps short documents as a single chunk", () => {
    expect(chunkText("One.\n\nTwo.")).toEqual(["One.\n\nTwo."]);
  });

  it("groups paragraphs up to the budget and splits at boundaries", () => {
    const p1 = "a".repeat(500);
    const p2 = "b".repeat(500);
    const p3 = "c".repeat(500);
    const chunks = chunkText(`${p1}\n\n${p2}\n\n${p3}`, 1100);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe(`${p1}\n\n${p2}`);
    expect(chunks[1]).toBe(p3);
  });

  it("hard-splits an oversized paragraph", () => {
    const chunks = chunkText("x".repeat(2500), 1000);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(1000);
  });

  it("drops whitespace-only content", () => {
    expect(chunkText("   \n\n  \n")).toEqual([]);
  });
});

describe("buildVectorRecords", () => {
  const raw = `---\ntitle: FAQ\nurl: https://e.com/faq\ntype: page\n---\n## Hours\n\nOpen 9-5.`;

  it("builds records with ids, embedded text, and retriever metadata", () => {
    const records = buildVectorRecords("faq.md", raw);
    expect(records).toEqual([
      {
        id: "faq.md#0",
        text: "## Hours\n\nOpen 9-5.",
        metadata: {
          content: "## Hours\n\nOpen 9-5.",
          title: "FAQ",
          url: "https://e.com/faq",
          type: "page",
        },
      },
    ]);
  });

  it("derives title from the first heading and url from --base-url", () => {
    const records = buildVectorRecords("guides/setup.md", "# Setup\n\nSteps.", {
      baseUrl: "https://e.com/",
    });
    expect(records[0].metadata.title).toBe("Setup");
    expect(records[0].metadata.url).toBe("https://e.com/guides/setup");
  });

  it("collapses index files to their directory url", () => {
    const records = buildVectorRecords("pricing/index.md", "Text.", {
      baseUrl: "https://e.com",
    });
    expect(records[0].metadata.url).toBe("https://e.com/pricing");
  });

  it("omits url entirely when there is no frontmatter url or base url", () => {
    const records = buildVectorRecords("notes.txt", "Text.");
    expect(records[0].metadata.url).toBeUndefined();
    expect(records[0].metadata.title).toBe("notes");
  });

  it("numbers multiple chunks of one file", () => {
    const records = buildVectorRecords(
      "long.md",
      `${"a".repeat(900)}\n\n${"b".repeat(900)}`,
      { maxChars: 1000 },
    );
    expect(records.map((r) => r.id)).toEqual(["long.md#0", "long.md#1"]);
  });
});

describe("toNdjson", () => {
  it("pairs records with vectors line by line", () => {
    const records = buildVectorRecords("a.md", "Text.");
    const ndjson = toNdjson(records, [[0.1, 0.2]]);
    expect(JSON.parse(ndjson)).toEqual({
      id: "a.md#0",
      values: [0.1, 0.2],
      metadata: { content: "Text.", title: "a" },
    });
  });

  it("throws on record/vector count mismatch", () => {
    const records = buildVectorRecords("a.md", "Text.");
    expect(() => toNdjson(records, [])).toThrow(/mismatch/);
  });
});
