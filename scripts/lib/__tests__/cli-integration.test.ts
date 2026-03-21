import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { loadConfig } from "../config.js";
import {
  generateScriptSnippet,
  generateWebComponentSnippet,
} from "../snippet.js";

const CLIENTS_DIR = join(process.cwd(), "..", "clients");

describe("CLI integration: example config", () => {
  it("loads and validates the example config", () => {
    const config = loadConfig("example", CLIENTS_DIR);
    expect(config.name).toBe("Example Corp");
    expect(config.slug).toBe("example");
    expect(config.apiUrl).toContain("example-chat");
    expect(config.allowedDomains).toContain("example.com");
  });

  it("generates a script snippet from example config", () => {
    const config = loadConfig("example", CLIENTS_DIR);
    const snippet = generateScriptSnippet(
      config,
      "https://cdn.example.com/claudius-embed.iife.js",
    );
    expect(snippet).toContain("window.ClaudiusConfig");
    expect(snippet).toContain(config.apiUrl);
    expect(snippet).toContain("Example Corp");
  });

  it("generates a web component snippet from example config", () => {
    const config = loadConfig("example", CLIENTS_DIR);
    const snippet = generateWebComponentSnippet(
      config,
      "https://cdn.example.com/claudius-embed.iife.js",
    );
    expect(snippet).toContain("<claudius-chat");
    expect(snippet).toContain(config.apiUrl);
    expect(snippet).toContain("Example Corp");
  });

  it("includes all widget fields in snippets when present", () => {
    const config = loadConfig("example", CLIENTS_DIR);
    const snippet = generateScriptSnippet(config, "https://cdn.example.com/claudius-embed.iife.js");

    expect(snippet).toContain('"title": "Example Support"');
    expect(snippet).toContain('"accentColor": "#2563eb"');
    expect(snippet).toContain('"theme": "light"');
  });
});
