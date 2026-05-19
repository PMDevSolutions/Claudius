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
  it("leaves plain text unchanged", () => {
    expect(stripAnnouncementFormatting("Hello there!")).toBe("Hello there!");
  });
  it("returns empty string for empty input", () => {
    expect(stripAnnouncementFormatting("")).toBe("");
  });
});
