import { describe, it, expect } from "vitest";
import { defaultTranslations, createTranslations } from "../i18n";

describe("i18n", () => {
  it("includes dialogLabel and newMessageAnnouncement defaults", () => {
    expect(defaultTranslations.dialogLabel).toBe("Chat dialog");
    expect(defaultTranslations.newMessageAnnouncement).toBe("New message from assistant");
  });

  it("allows overriding the new strings", () => {
    const t = createTranslations({
      dialogLabel: "Support chat",
      newMessageAnnouncement: "Reply received",
    });
    expect(t.dialogLabel).toBe("Support chat");
    expect(t.newMessageAnnouncement).toBe("Reply received");
  });
});
