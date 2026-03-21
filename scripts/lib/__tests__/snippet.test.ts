import { describe, it, expect } from "vitest";
import { generateScriptSnippet, generateWebComponentSnippet } from "../snippet.js";
import type { ClientConfig } from "../config.js";

// --- Helpers ---

function minimalConfig(): ClientConfig {
  return {
    name: "Test Client",
    slug: "test-client",
    apiUrl: "https://api.example.com",
    allowedDomains: ["example.com"],
  };
}

function fullConfig(): ClientConfig {
  return {
    name: "Acme Corp",
    slug: "acme-corp",
    apiUrl: "https://api.acme.com/chat",
    allowedDomains: ["acme.com"],
    widget: {
      title: "Acme Chat",
      subtitle: "How can we help?",
      welcomeMessage: "Welcome to Acme!",
      placeholder: "Type a message...",
      theme: "dark",
      position: "bottom-left",
      accentColor: "#FF5733",
    },
  };
}

const SCRIPT_URL = "https://cdn.example.com/claudius.js";

// --- generateScriptSnippet ---

describe("generateScriptSnippet", () => {
  it("includes comment header with client name", () => {
    const output = generateScriptSnippet(minimalConfig(), SCRIPT_URL);
    expect(output).toContain("<!-- Claudius Chat Widget - Test Client -->");
  });

  it("includes ClaudiusConfig with all widget fields when fully configured", () => {
    const output = generateScriptSnippet(fullConfig(), SCRIPT_URL);

    expect(output).toContain('"apiUrl": "https://api.acme.com/chat"');
    expect(output).toContain('"title": "Acme Chat"');
    expect(output).toContain('"subtitle": "How can we help?"');
    expect(output).toContain('"welcomeMessage": "Welcome to Acme!"');
    expect(output).toContain('"placeholder": "Type a message..."');
    expect(output).toContain('"theme": "dark"');
    expect(output).toContain('"position": "bottom-left"');
    expect(output).toContain('"accentColor": "#FF5733"');
    expect(output).toContain("window.ClaudiusConfig =");
    expect(output).toContain(`<script src="${SCRIPT_URL}" defer></script>`);
  });

  it("omits undefined widget fields for minimal config", () => {
    const output = generateScriptSnippet(minimalConfig(), SCRIPT_URL);

    expect(output).toContain('"apiUrl": "https://api.example.com"');
    expect(output).not.toContain('"title"');
    expect(output).not.toContain('"subtitle"');
    expect(output).not.toContain('"welcomeMessage"');
    expect(output).not.toContain('"placeholder"');
    expect(output).not.toContain('"theme"');
    expect(output).not.toContain('"position"');
    expect(output).not.toContain('"accentColor"');
  });

  it("produces valid structure with script tags", () => {
    const output = generateScriptSnippet(minimalConfig(), SCRIPT_URL);

    expect(output).toContain("<script>");
    expect(output).toContain("</script>");
    expect(output).toContain(`<script src="${SCRIPT_URL}" defer></script>`);
  });

  it("indents JSON under the assignment", () => {
    const output = generateScriptSnippet(fullConfig(), SCRIPT_URL);
    const lines = output.split("\n");
    // The line with "apiUrl" should be indented by 4 spaces (2 base + 2 JSON)
    const apiUrlLine = lines.find((l) => l.includes('"apiUrl"'));
    expect(apiUrlLine).toMatch(/^ {4}"/);
  });
});

// --- generateWebComponentSnippet ---

describe("generateWebComponentSnippet", () => {
  it("includes comment header with client name", () => {
    const output = generateWebComponentSnippet(fullConfig(), SCRIPT_URL);
    expect(output).toContain("<!-- Claudius Chat Widget - Acme Corp -->");
  });

  it("includes claudius-chat element with all attributes when fully configured", () => {
    const output = generateWebComponentSnippet(fullConfig(), SCRIPT_URL);

    expect(output).toContain("<claudius-chat");
    expect(output).toContain('api-url="https://api.acme.com/chat"');
    expect(output).toContain('title="Acme Chat"');
    expect(output).toContain('subtitle="How can we help?"');
    expect(output).toContain('welcome-message="Welcome to Acme!"');
    expect(output).toContain('placeholder="Type a message..."');
    expect(output).toContain('theme="dark"');
    expect(output).toContain('position="bottom-left"');
    expect(output).toContain('accent-color="#FF5733"');
    expect(output).toContain("</claudius-chat>");
    expect(output).toContain(`<script src="${SCRIPT_URL}" defer></script>`);
  });

  it("omits undefined attributes for minimal config", () => {
    const output = generateWebComponentSnippet(minimalConfig(), SCRIPT_URL);

    expect(output).toContain('api-url="https://api.example.com"');
    expect(output).not.toContain("title=");
    expect(output).not.toContain("subtitle=");
    expect(output).not.toContain("welcome-message=");
    expect(output).not.toContain("placeholder=");
    expect(output).not.toContain("theme=");
    expect(output).not.toContain("position=");
    expect(output).not.toContain("accent-color=");
  });

  it("uses kebab-case for multi-word attributes", () => {
    const config = minimalConfig();
    config.widget = { welcomeMessage: "Hello!", accentColor: "#123456" };
    const output = generateWebComponentSnippet(config, SCRIPT_URL);

    expect(output).toContain('welcome-message="Hello!"');
    expect(output).toContain('accent-color="#123456"');
    expect(output).not.toContain("welcomeMessage");
    expect(output).not.toContain("accentColor");
  });

  it("puts each attribute on its own line with 2-space indent", () => {
    const output = generateWebComponentSnippet(fullConfig(), SCRIPT_URL);
    const lines = output.split("\n");
    const attrLines = lines.filter((l) => l.includes('="'));
    for (const line of attrLines) {
      expect(line).toMatch(/^ {2}\S/);
    }
  });
});
