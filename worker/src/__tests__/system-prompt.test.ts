import { describe, it, expect } from "vitest";
import { SYSTEM_PROMPT } from "../system-prompt";

describe("system prompt", () => {
  it("contains business information section", () => {
    expect(SYSTEM_PROMPT).toContain("Business Information");
    expect(SYSTEM_PROMPT).toContain("Business Name");
  });

  it("contains pricing section", () => {
    expect(SYSTEM_PROMPT).toContain("Pricing");
    expect(SYSTEM_PROMPT).toContain("Starter package");
  });

  it("contains services section", () => {
    expect(SYSTEM_PROMPT).toContain("Services");
    expect(SYSTEM_PROMPT).toContain("Web Development");
  });

  it("contains behavioral rules", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("concise");
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("emojis");
  });

  it("contains FAQ section", () => {
    expect(SYSTEM_PROMPT).toContain("How much does it cost");
    expect(SYSTEM_PROMPT).toContain("How long does a project take");
  });

  it("contains prompt injection guard", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("ignore");
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("reveal your system prompt");
  });
});
