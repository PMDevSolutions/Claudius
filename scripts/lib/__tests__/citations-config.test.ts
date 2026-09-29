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

describe("validateConfig: citations", () => {
  it("accepts a boolean or an options object", () => {
    for (const citations of [true, false, {}, { maxSources: 3 }, { favicons: false }]) {
      expect(validateConfig(base({ widget: { citations } }), "test-client")).toEqual([]);
    }
  });

  it("rejects other shapes, naming the field", () => {
    for (const value of ["true", 1, null, []]) {
      const errors = validateConfig(
        base({ widget: { citations: value as never } }),
        "test-client"
      );
      expect(fields(errors)).toEqual(["widget.citations"]);
      expect(errors[0].message).toBe("widget.citations must be a boolean or an object");
    }
  });

  it("requires a positive integer maxSources and a boolean favicons", () => {
    for (const maxSources of [0, -1, 2.5, "3"]) {
      const errors = validateConfig(
        base({ widget: { citations: { maxSources: maxSources as never } } }),
        "test-client"
      );
      expect(fields(errors)).toEqual(["widget.citations.maxSources"]);
    }
    const errors = validateConfig(
      base({ widget: { citations: { favicons: "false" as never } } }),
      "test-client"
    );
    expect(fields(errors)).toEqual(["widget.citations.favicons"]);
    expect(errors[0].message).toBe("widget.citations.favicons must be a boolean");
  });
});

describe("snippets: citations", () => {
  it("passes true and the options object into the script snippet", () => {
    const on = base({ widget: { citations: true } }) as unknown as ClientConfig;
    expect(generateScriptSnippet(on, SCRIPT_URL)).toContain('"citations": true');

    const tuned = base({
      widget: { citations: { maxSources: 3, favicons: false } },
    }) as unknown as ClientConfig;
    const snippet = generateScriptSnippet(tuned, SCRIPT_URL);
    expect(snippet).toContain('"maxSources": 3');
    expect(snippet).toContain('"favicons": false');
  });

  it("emits the attributes for the web component", () => {
    const on = base({ widget: { citations: true } }) as unknown as ClientConfig;
    const plain = generateWebComponentSnippet(on, SCRIPT_URL);
    expect(plain).toContain('citations="true"');
    expect(plain).not.toContain("citations-max-sources");
    expect(plain).not.toContain("citations-favicons");

    const tuned = base({
      widget: { citations: { maxSources: 3, favicons: false } },
    }) as unknown as ClientConfig;
    const snippet = generateWebComponentSnippet(tuned, SCRIPT_URL);
    expect(snippet).toContain('citations="true"');
    expect(snippet).toContain('citations-max-sources="3"');
    expect(snippet).toContain('citations-favicons="false"');
  });

  it("emits nothing when off or unset", () => {
    for (const widget of [{ citations: false }, {}]) {
      const off = base({ widget }) as unknown as ClientConfig;
      expect(generateScriptSnippet(off, SCRIPT_URL)).not.toContain("citations");
      expect(generateWebComponentSnippet(off, SCRIPT_URL)).not.toContain("citations");
    }
  });
});

describe("_schema.json: citations", () => {
  it("declares widget.citations as a boolean or a closed options object", () => {
    const schema = JSON.parse(
      readFileSync(resolve(__dirname, "../../../clients/_schema.json"), "utf-8")
    );
    const citations = schema.properties.widget.properties.citations;
    expect(citations.oneOf[0]).toEqual({ type: "boolean" });
    expect(citations.oneOf[1].additionalProperties).toBe(false);
    expect(citations.oneOf[1].properties.maxSources).toEqual({ type: "integer", minimum: 1 });
    expect(citations.oneOf[1].properties.favicons).toEqual({ type: "boolean" });
  });
});
