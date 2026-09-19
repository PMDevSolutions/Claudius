import { describe, it, expect } from "vitest";
import { stripAnnouncementFormatting } from "../stripAnnouncementFormatting";

describe("stripAnnouncementFormatting", () => {
  it("removes bold markers", () => {
    expect(stripAnnouncementFormatting("Visit **pmds** today")).toBe(
      "Visit pmds today",
    );
  });
  it("removes italic markers", () => {
    expect(stripAnnouncementFormatting("See *more details* here")).toBe(
      "See more details here",
    );
  });
  it("strips bold and italic in the same string", () => {
    expect(stripAnnouncementFormatting("**Bold** and *italic*")).toBe(
      "Bold and italic",
    );
  });
  it("replaces URLs with the hostname", () => {
    expect(
      stripAnnouncementFormatting(
        "Read https://pmds.info/blog/seo-tips for more.",
      ),
    ).toBe("Read pmds.info for more.");
  });
  it("keeps the sentence end that follows a URL", () => {
    expect(
      stripAnnouncementFormatting(
        "See https://example.com/pricing. Then call us.",
      ),
    ).toBe("See example.com. Then call us.");
  });
  it("keeps other punctuation that trails a URL", () => {
    expect(
      stripAnnouncementFormatting("Is it https://example.com/faq?! Yes."),
    ).toBe("Is it example.com?! Yes.");
  });
  it("leaves plain text unchanged", () => {
    expect(stripAnnouncementFormatting("Hello there!")).toBe("Hello there!");
  });
  it("returns empty string for empty input", () => {
    expect(stripAnnouncementFormatting("")).toBe("");
  });
});
