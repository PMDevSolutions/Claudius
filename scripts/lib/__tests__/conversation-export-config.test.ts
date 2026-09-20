import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateConfig } from "../config.js";
import type { ClientConfig, ValidationError } from "../config.js";
import { generateScriptSnippet, generateWebComponentSnippet } from "../snippet.js";

function base(overrides: Partial<ClientConfig> = {}): Record<string, unknown> {
  return {
    name: "Test Client",
    slug: "test-client",
    apiUrl: "https://api.example.com",
    allowedDomains: ["example.com"],
    ...overrides,
  };
}

function fields(errors: ValidationError[]): string[] {
  return errors.map((e) => e.field);
}

const SCRIPT_URL = "https://cdn.example.com/claudius.js";

describe("validateConfig: conversationExport", () => {
  it("accepts a boolean", () => {
    expect(validateConfig(base({ widget: { conversationExport: true } }), "test-client")).toEqual(
      []
    );
    expect(
      validateConfig(base({ widget: { conversationExport: false } }), "test-client")
    ).toEqual([]);
  });

  it("rejects anything else, naming the field", () => {
    for (const value of ["true", 1, {}, null]) {
      const errors = validateConfig(
        base({ widget: { conversationExport: value as never } }),
        "test-client"
      );
      expect(fields(errors)).toEqual(["widget.conversationExport"]);
      expect(errors[0].message).toBe("widget.conversationExport must be a boolean");
    }
  });
});

describe("snippets: conversationExport", () => {
  it("is emitted only when it is true", () => {
    const on = base({ widget: { conversationExport: true } }) as unknown as ClientConfig;
    expect(generateScriptSnippet(on, SCRIPT_URL)).toContain('"conversationExport": true');
    expect(generateWebComponentSnippet(on, SCRIPT_URL)).toContain(
      'conversation-export="true"'
    );

    for (const widget of [{ conversationExport: false }, {}]) {
      const off = base({ widget }) as unknown as ClientConfig;
      expect(generateScriptSnippet(off, SCRIPT_URL)).not.toContain("conversationExport");
      expect(generateWebComponentSnippet(off, SCRIPT_URL)).not.toContain("conversation-export");
    }
  });
});

describe("_schema.json: conversationExport", () => {
  it("declares widget.conversationExport as a boolean", () => {
    const schema = JSON.parse(
      readFileSync(resolve(__dirname, "../../../clients/_schema.json"), "utf-8")
    );
    expect(schema.properties.widget.properties.conversationExport.type).toBe("boolean");
  });
});
