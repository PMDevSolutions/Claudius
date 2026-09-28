import { describe, it, expect } from "vitest";
import {
  DEFAULT_CITATIONS_OPTIONS,
  citationsOptionsFromAttributes,
  faviconUrl,
  hideTrailingCitationOpener,
  parseCitations,
  resolveCitationsConfig,
  sourceDomain,
  stripCitationMarkers,
  truncateSnippet,
} from "../citations";

describe("resolveCitationsConfig", () => {
  it("is off for anything but true or an options object", () => {
    for (const value of [
      undefined,
      null,
      false,
      "true",
      "false",
      1,
      0,
      [],
      [true],
    ]) {
      expect(resolveCitationsConfig(value as never)).toBeNull();
    }
  });

  it("uses the defaults for true and an empty object", () => {
    expect(resolveCitationsConfig(true)).toEqual({
      maxSources: 5,
      favicons: true,
    });
    expect(resolveCitationsConfig({})).toEqual(DEFAULT_CITATIONS_OPTIONS);
  });

  it("accepts a positive integer maxSources and falls back otherwise", () => {
    expect(resolveCitationsConfig({ maxSources: 3 })!.maxSources).toBe(3);
    for (const bad of [0, -1, 2.5, "3", NaN, Infinity]) {
      expect(
        resolveCitationsConfig({ maxSources: bad as never })!.maxSources,
      ).toBe(5);
    }
  });

  it("turns favicons off only for the literal false", () => {
    expect(resolveCitationsConfig({ favicons: false })!.favicons).toBe(false);
    expect(resolveCitationsConfig({ favicons: true })!.favicons).toBe(true);
    expect(
      resolveCitationsConfig({ favicons: "false" as never })!.favicons,
    ).toBe(true);
  });
});

describe("citationsOptionsFromAttributes", () => {
  const attrs = (map: Record<string, string>) => (name: string) =>
    name in map ? map[name] : null;

  it("is undefined when the attribute is absent", () => {
    expect(citationsOptionsFromAttributes(attrs({}))).toBeUndefined();
  });

  it.each([[""], ["true"], ["TRUE"], [" true "]])(
    "enables for citations=%j",
    (value) => {
      expect(citationsOptionsFromAttributes(attrs({ citations: value }))).toBe(
        true,
      );
    },
  );

  it.each([["false"], ["False"], ["0"], ["no"], ["yes"], ["1"]])(
    "stays off for citations=%j",
    (value) => {
      expect(citationsOptionsFromAttributes(attrs({ citations: value }))).toBe(
        false,
      );
    },
  );

  it("reads a positive integer max and ignores junk", () => {
    expect(
      citationsOptionsFromAttributes(
        attrs({ citations: "", "citations-max-sources": " 3 " }),
      ),
    ).toEqual({ maxSources: 3 });
    for (const bad of ["0", "-2", "2.5", "many", ""]) {
      expect(
        citationsOptionsFromAttributes(
          attrs({ citations: "", "citations-max-sources": bad }),
        ),
      ).toBe(true);
    }
  });

  it("turns favicons off for citations-favicons=false only", () => {
    expect(
      citationsOptionsFromAttributes(
        attrs({ citations: "", "citations-favicons": "false" }),
      ),
    ).toEqual({ favicons: false });
    expect(
      citationsOptionsFromAttributes(
        attrs({ citations: "", "citations-favicons": " FALSE " }),
      ),
    ).toEqual({ favicons: false });
    expect(
      citationsOptionsFromAttributes(
        attrs({ citations: "", "citations-favicons": "0" }),
      ),
    ).toBe(true);
  });

  it("companion attributes do nothing while citations is off", () => {
    expect(
      citationsOptionsFromAttributes(attrs({ "citations-max-sources": "3" })),
    ).toBeUndefined();
    expect(
      citationsOptionsFromAttributes(
        attrs({ citations: "false", "citations-favicons": "false" }),
      ),
    ).toBe(false);
  });
});

describe("parseCitations", () => {
  it("turns an in-range marker into a citation and keeps the text around it", () => {
    expect(parseCitations("Plans start at $10 [1].", 2)).toEqual([
      { type: "text", value: "Plans start at $10 " },
      { type: "cite", indexes: [0], raw: "[1]" },
      { type: "text", value: "." },
    ]);
  });

  it("leaves out-of-range, zero, and leading-zero markers as text", () => {
    for (const text of ["See [3].", "See [0].", "See [01].", "See [1000]."]) {
      expect(parseCitations(text, 2)).toEqual([{ type: "text", value: text }]);
    }
  });

  it("treats every marker as text when there are no sources", () => {
    expect(parseCitations("See [1].", 0)).toEqual([
      { type: "text", value: "See [1]." },
    ]);
  });

  it("returns nothing for empty text", () => {
    expect(parseCitations("", 3)).toEqual([]);
  });

  it("splits a comma group into one citation with several indexes, deduplicated", () => {
    expect(parseCitations("[1, 2,2]", 2)).toEqual([
      { type: "cite", indexes: [0, 1], raw: "[1, 2,2]" },
    ]);
  });

  it("rejects a comma group when any number is out of range", () => {
    expect(parseCitations("[1, 7]", 3)).toEqual([
      { type: "text", value: "[1, 7]" },
    ]);
  });

  it("reads adjacent markers as separate citations", () => {
    expect(parseCitations("Yes [1][3].", 3)).toEqual([
      { type: "text", value: "Yes " },
      { type: "cite", indexes: [0], raw: "[1]" },
      { type: "cite", indexes: [2], raw: "[3]" },
      { type: "text", value: "." },
    ]);
  });

  it("does not need a space before the marker", () => {
    expect(parseCitations("word[2]", 2)).toEqual([
      { type: "text", value: "word" },
      { type: "cite", indexes: [1], raw: "[2]" },
    ]);
  });

  it("leaves the outer brackets of a doubled marker as text", () => {
    expect(parseCitations("[[1]]", 1)).toEqual([
      { type: "text", value: "[" },
      { type: "cite", indexes: [0], raw: "[1]" },
      { type: "text", value: "]" },
    ]);
  });
});

describe("stripCitationMarkers", () => {
  it("removes in-range markers and the space before them", () => {
    expect(
      stripCitationMarkers("Plans start at $10 [1]. More [2][3].", 3),
    ).toBe("Plans start at $10. More.");
  });

  it("keeps out-of-range markers and text without markers", () => {
    expect(stripCitationMarkers("See [7] and [1].", 2)).toBe("See [7] and.");
    expect(stripCitationMarkers("No markers here.", 2)).toBe(
      "No markers here.",
    );
  });

  it("does nothing when there are no sources", () => {
    expect(stripCitationMarkers("See [1].", 0)).toBe("See [1].");
  });
});

describe("hideTrailingCitationOpener", () => {
  it.each([
    ["Plans start at $10 [", "Plans start at $10"],
    ["Plans start at $10 [1", "Plans start at $10"],
    ["Plans start at $10 [1, ", "Plans start at $10"],
    ["Plans start at $10[1", "Plans start at $10"],
  ])("hides %j as %j", (input, expected) => {
    expect(hideTrailingCitationOpener(input)).toBe(expected);
  });

  it.each([
    "Plans start at $10 [1].",
    "Plans start at $10 [1]",
    "See [Pricing",
    "Plain text",
  ])("leaves %j alone", (text) => {
    expect(hideTrailingCitationOpener(text)).toBe(text);
  });
});

describe("truncateSnippet", () => {
  it("collapses whitespace and keeps text within the limit", () => {
    expect(truncateSnippet("  Plans\nstart   at $10. ")).toBe(
      "Plans start at $10.",
    );
    const exact = "a".repeat(200);
    expect(truncateSnippet(exact)).toBe(exact);
  });

  it("cuts longer text at the last space and adds an ellipsis", () => {
    const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const cut = truncateSnippet(words);
    expect(cut.length).toBeLessThanOrEqual(201);
    expect(cut.endsWith("…")).toBe(true);
    expect(words.startsWith(cut.slice(0, -1))).toBe(true);
    expect(cut.slice(0, -1)).toMatch(/word\d+$/);
  });

  it("hard-cuts a single long token and drops trailing punctuation before the ellipsis", () => {
    expect(truncateSnippet("x".repeat(250))).toBe(`${"x".repeat(200)}…`);
    const text = `${"y".repeat(150)}, ${"z".repeat(100)}`;
    expect(truncateSnippet(text)).toBe(`${"y".repeat(150)}…`);
  });
});

describe("faviconUrl and sourceDomain", () => {
  it("points at /favicon.ico on the source origin", () => {
    expect(faviconUrl("https://example.com/pricing?x=1#top")).toBe(
      "https://example.com/favicon.ico",
    );
    expect(faviconUrl("http://docs.example.com:8080/a/b")).toBe(
      "http://docs.example.com:8080/favicon.ico",
    );
  });

  it("returns null for non-http schemes and garbage", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,hi",
      "ftp://x.com/a",
      "nope",
      "",
    ]) {
      expect(faviconUrl(url)).toBeNull();
    }
  });

  it("gives the hostname, or the input when it is not a URL", () => {
    expect(sourceDomain("https://docs.example.com/a")).toBe("docs.example.com");
    expect(sourceDomain("not a url")).toBe("not a url");
  });
});
