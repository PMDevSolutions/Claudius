import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateConfig, loadConfig } from "../config.js";
import type { ClientConfig, ValidationError } from "../config.js";

// --- Helper ---

function minimalConfig(overrides: Partial<ClientConfig> = {}): ClientConfig {
  return {
    name: "Test Client",
    slug: "test-client",
    apiUrl: "https://api.example.com",
    allowedDomains: ["example.com"],
    ...overrides,
  };
}

function fullConfig(): ClientConfig {
  return {
    $schema: "./schema.json",
    name: "Acme Corp",
    slug: "acme-corp",
    apiUrl: "https://api.acme.com/chat",
    allowedDomains: ["acme.com", "www.acme.com"],
    widget: {
      title: "Acme Chat",
      subtitle: "How can we help?",
      welcomeMessage: "Welcome to Acme!",
      placeholder: "Type a message...",
      theme: "dark",
      position: "bottom-left",
      accentColor: "#FF5733",
    },
    worker: {
      model: "claude-sonnet-4-20250514",
      maxTokens: 1024,
      rateLimitMinute: 10,
      rateLimitHour: 100,
      systemPrompt: "prompts/acme.md",
    },
  };
}

function fieldErrors(errors: ValidationError[]): string[] {
  return errors.map((e) => e.field);
}

// --- validateConfig ---

describe("validateConfig", () => {
  it("returns no errors for a valid minimal config", () => {
    const errors = validateConfig(minimalConfig() as unknown as Record<string, unknown>, "test-client");
    expect(errors).toEqual([]);
  });

  it("returns no errors for a valid full config", () => {
    const errors = validateConfig(fullConfig() as unknown as Record<string, unknown>, "acme-corp");
    expect(errors).toEqual([]);
  });

  // --- name ---

  it("returns error when name is missing", () => {
    const config = minimalConfig();
    delete (config as Record<string, unknown>).name;
    const errors = validateConfig(config as unknown as Record<string, unknown>, "test-client");
    expect(fieldErrors(errors)).toContain("name");
  });

  it("returns error when name is empty string", () => {
    const errors = validateConfig(
      minimalConfig({ name: "" }) as unknown as Record<string, unknown>,
      "test-client",
    );
    expect(fieldErrors(errors)).toContain("name");
  });

  it("returns error when name is whitespace only", () => {
    const errors = validateConfig(
      minimalConfig({ name: "   " }) as unknown as Record<string, unknown>,
      "test-client",
    );
    expect(fieldErrors(errors)).toContain("name");
  });

  // --- slug ---

  it("returns error when slug is missing", () => {
    const config = minimalConfig();
    delete (config as Record<string, unknown>).slug;
    const errors = validateConfig(config as unknown as Record<string, unknown>, "test-client");
    expect(fieldErrors(errors)).toContain("slug");
  });

  it("returns error for invalid slug format (uppercase)", () => {
    const errors = validateConfig(
      minimalConfig({ slug: "Test-Client" }) as unknown as Record<string, unknown>,
      "Test-Client",
    );
    expect(fieldErrors(errors)).toContain("slug");
  });

  it("returns error for invalid slug format (spaces)", () => {
    const errors = validateConfig(
      minimalConfig({ slug: "test client" }) as unknown as Record<string, unknown>,
      "test client",
    );
    expect(fieldErrors(errors)).toContain("slug");
  });

  it("returns error for invalid slug format (leading hyphen)", () => {
    const errors = validateConfig(
      minimalConfig({ slug: "-test" }) as unknown as Record<string, unknown>,
      "-test",
    );
    expect(fieldErrors(errors)).toContain("slug");
  });

  it("returns error for invalid slug format (trailing hyphen)", () => {
    const errors = validateConfig(
      minimalConfig({ slug: "test-" }) as unknown as Record<string, unknown>,
      "test-",
    );
    expect(fieldErrors(errors)).toContain("slug");
  });

  it("returns error for invalid slug format (consecutive hyphens)", () => {
    const errors = validateConfig(
      minimalConfig({ slug: "test--client" }) as unknown as Record<string, unknown>,
      "test--client",
    );
    expect(fieldErrors(errors)).toContain("slug");
  });

  it("returns error when slug does not match expectedSlug", () => {
    const errors = validateConfig(
      minimalConfig({ slug: "other-slug" }) as unknown as Record<string, unknown>,
      "test-client",
    );
    expect(fieldErrors(errors)).toContain("slug");
    expect(errors.find((e) => e.field === "slug")!.message).toContain("does not match");
  });

  // --- apiUrl ---

  it("returns error when apiUrl is missing", () => {
    const config = minimalConfig();
    delete (config as Record<string, unknown>).apiUrl;
    const errors = validateConfig(config as unknown as Record<string, unknown>, "test-client");
    expect(fieldErrors(errors)).toContain("apiUrl");
  });

  it("returns error when apiUrl is empty", () => {
    const errors = validateConfig(
      minimalConfig({ apiUrl: "" }) as unknown as Record<string, unknown>,
      "test-client",
    );
    expect(fieldErrors(errors)).toContain("apiUrl");
  });

  it("returns error when apiUrl is not a valid URL", () => {
    const errors = validateConfig(
      minimalConfig({ apiUrl: "not-a-url" }) as unknown as Record<string, unknown>,
      "test-client",
    );
    expect(fieldErrors(errors)).toContain("apiUrl");
  });

  // --- allowedDomains ---

  it("returns error when allowedDomains is missing", () => {
    const config = minimalConfig();
    delete (config as Record<string, unknown>).allowedDomains;
    const errors = validateConfig(config as unknown as Record<string, unknown>, "test-client");
    expect(fieldErrors(errors)).toContain("allowedDomains");
  });

  it("returns error when allowedDomains is empty array", () => {
    const errors = validateConfig(
      minimalConfig({ allowedDomains: [] }) as unknown as Record<string, unknown>,
      "test-client",
    );
    expect(fieldErrors(errors)).toContain("allowedDomains");
  });

  // --- widget.theme ---

  it("accepts valid theme values", () => {
    for (const theme of ["light", "dark", "auto"] as const) {
      const errors = validateConfig(
        minimalConfig({ widget: { theme } }) as unknown as Record<string, unknown>,
        "test-client",
      );
      expect(fieldErrors(errors)).not.toContain("widget.theme");
    }
  });

  it("returns error for invalid theme", () => {
    const errors = validateConfig(
      minimalConfig({ widget: { theme: "neon" as never } }) as unknown as Record<string, unknown>,
      "test-client",
    );
    expect(fieldErrors(errors)).toContain("widget.theme");
  });

  // --- widget.position ---

  it("accepts valid position values", () => {
    for (const position of ["bottom-right", "bottom-left", "top-right", "top-left"] as const) {
      const errors = validateConfig(
        minimalConfig({ widget: { position } }) as unknown as Record<string, unknown>,
        "test-client",
      );
      expect(fieldErrors(errors)).not.toContain("widget.position");
    }
  });

  it("returns error for invalid position", () => {
    const errors = validateConfig(
      minimalConfig({ widget: { position: "center" as never } }) as unknown as Record<string, unknown>,
      "test-client",
    );
    expect(fieldErrors(errors)).toContain("widget.position");
  });

  // --- widget.accentColor ---

  it("accepts valid hex color", () => {
    const errors = validateConfig(
      minimalConfig({ widget: { accentColor: "#1A2B3C" } }) as unknown as Record<string, unknown>,
      "test-client",
    );
    expect(fieldErrors(errors)).not.toContain("widget.accentColor");
  });

  it("returns error for 3-digit hex color", () => {
    const errors = validateConfig(
      minimalConfig({ widget: { accentColor: "#ABC" } }) as unknown as Record<string, unknown>,
      "test-client",
    );
    expect(fieldErrors(errors)).toContain("widget.accentColor");
  });

  it("returns error for hex color without hash", () => {
    const errors = validateConfig(
      minimalConfig({ widget: { accentColor: "FF5733" } }) as unknown as Record<string, unknown>,
      "test-client",
    );
    expect(fieldErrors(errors)).toContain("widget.accentColor");
  });

  it("returns error for named color", () => {
    const errors = validateConfig(
      minimalConfig({ widget: { accentColor: "red" } }) as unknown as Record<string, unknown>,
      "test-client",
    );
    expect(fieldErrors(errors)).toContain("widget.accentColor");
  });

  // --- Multiple errors ---

  it("returns multiple errors for multiple invalid fields", () => {
    const errors = validateConfig(
      { slug: "INVALID", apiUrl: "bad", allowedDomains: [] } as unknown as Record<string, unknown>,
      "test-client",
    );
    expect(errors.length).toBeGreaterThanOrEqual(4);
  });
});

// --- loadConfig ---

describe("loadConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "claudius-config-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeConfig(slug: string, data: unknown): void {
    writeFileSync(join(tmpDir, `${slug}.json`), JSON.stringify(data, null, 2), "utf-8");
  }

  it("loads a valid minimal config", () => {
    writeConfig("test-client", minimalConfig());
    const config = loadConfig("test-client", tmpDir);
    expect(config.name).toBe("Test Client");
    expect(config.slug).toBe("test-client");
    expect(config.apiUrl).toBe("https://api.example.com");
    expect(config.allowedDomains).toEqual(["example.com"]);
  });

  it("loads a valid full config", () => {
    const full = fullConfig();
    // Create the referenced system prompt file
    mkdirSync(join(tmpDir, "prompts"), { recursive: true });
    writeFileSync(join(tmpDir, "prompts", "acme.md"), "You are Acme bot.", "utf-8");

    writeConfig("acme-corp", full);
    const config = loadConfig("acme-corp", tmpDir);
    expect(config.widget?.theme).toBe("dark");
    expect(config.widget?.position).toBe("bottom-left");
    expect(config.worker?.model).toBe("claude-sonnet-4-20250514");
  });

  it("throws when config file does not exist", () => {
    expect(() => loadConfig("nonexistent", tmpDir)).toThrow("Config file not found");
  });

  it("throws when config file contains invalid JSON", () => {
    writeFileSync(join(tmpDir, "bad.json"), "{ not valid json }", "utf-8");
    expect(() => loadConfig("bad", tmpDir)).toThrow("Invalid JSON");
  });

  it("throws with validation errors for invalid config", () => {
    writeConfig("bad-config", { name: "", slug: "bad-config", apiUrl: "", allowedDomains: [] });
    expect(() => loadConfig("bad-config", tmpDir)).toThrow('Invalid config for "bad-config"');
  });

  it("throws when slug in file does not match filename slug", () => {
    writeConfig("my-client", minimalConfig({ slug: "other-slug" }));
    expect(() => loadConfig("my-client", tmpDir)).toThrow("does not match");
  });

  it("throws when worker.systemPrompt references a non-existent file", () => {
    writeConfig("test-client", minimalConfig({ worker: { systemPrompt: "missing.md" } }));
    expect(() => loadConfig("test-client", tmpDir)).toThrow("System prompt file not found");
  });

  it("succeeds when worker.systemPrompt references an existing file", () => {
    writeFileSync(join(tmpDir, "prompt.md"), "System prompt content", "utf-8");
    writeConfig("test-client", minimalConfig({ worker: { systemPrompt: "prompt.md" } }));
    const config = loadConfig("test-client", tmpDir);
    expect(config.worker?.systemPrompt).toBe("prompt.md");
  });
});
