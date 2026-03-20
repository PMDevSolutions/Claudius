import { describe, it, expect } from "vitest";
import { SYSTEM_PROMPT } from "../system-prompt";

describe("system prompt", () => {
  it("contains business contact info", () => {
    expect(SYSTEM_PROMPT).toContain("paul@pmds.info");
    expect(SYSTEM_PROMPT).toContain("(443) 866-7356");
  });

  it("contains pricing info", () => {
    expect(SYSTEM_PROMPT).toContain("$1,000");
    expect(SYSTEM_PROMPT).toContain("$75/hr");
    expect(SYSTEM_PROMPT).toContain("4 pages or fewer");
  });

  it("contains contact form URL", () => {
    expect(SYSTEM_PROMPT).toContain("https://pmds.info/contact");
  });

  it("instructs the bot to recommend the contact form", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("contact");
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("recommend");
  });

  it("contains FAQ content", () => {
    expect(SYSTEM_PROMPT).toContain("How much does a custom website cost");
    expect(SYSTEM_PROMPT).toContain("How long does it take");
  });

  it("contains blog post summaries", () => {
    expect(SYSTEM_PROMPT).toContain("blog");
  });
});
