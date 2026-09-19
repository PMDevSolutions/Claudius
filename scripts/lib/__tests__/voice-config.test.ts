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

describe("validateConfig: voice", () => {
  it("accepts widget.voice as a boolean or an options object", () => {
    expect(validateConfig(base({ widget: { voice: true } }), "test-client")).toEqual([]);
    expect(validateConfig(base({ widget: { voice: false } }), "test-client")).toEqual([]);
    expect(
      validateConfig(
        base({
          widget: {
            voice: { input: true, output: false, mode: "hold", autoSubmit: true, lang: "en-GB" },
          },
        }),
        "test-client",
      ),
    ).toEqual([]);
  });

  it("rejects malformed widget.voice options, naming each field", () => {
    const errors = validateConfig(
      base({
        widget: {
          voice: {
            input: "yes",
            output: 1,
            mode: "shout",
            autoSubmit: "no",
            lang: "",
          } as never,
        },
      }),
      "test-client",
    );
    expect(fields(errors)).toEqual([
      "widget.voice.input",
      "widget.voice.output",
      "widget.voice.mode",
      "widget.voice.autoSubmit",
      "widget.voice.lang",
    ]);
  });

  it("rejects a widget.voice that is neither a boolean nor an object", () => {
    const errors = validateConfig(
      base({ widget: { voice: "on" as unknown as boolean } }),
      "test-client",
    );
    expect(fields(errors)).toEqual(["widget.voice"]);
  });
});

describe("snippets: voice", () => {
  it("passes voice: true through to ClaudiusConfig", () => {
    const snippet = generateScriptSnippet(
      base({ widget: { voice: true } }) as unknown as ClientConfig,
      SCRIPT_URL,
    );
    expect(snippet).toContain('"voice": true');
  });

  it("passes a voice options object through to ClaudiusConfig", () => {
    const snippet = generateScriptSnippet(
      base({ widget: { voice: { mode: "hold", autoSubmit: true } } }) as unknown as ClientConfig,
      SCRIPT_URL,
    );
    expect(snippet).toContain('"mode": "hold"');
    expect(snippet).toContain('"autoSubmit": true');
  });

  it("omits voice from both snippets when it is off or unset", () => {
    for (const widget of [{ voice: false }, {}]) {
      const config = base({ widget }) as unknown as ClientConfig;
      expect(generateScriptSnippet(config, SCRIPT_URL)).not.toContain("voice");
      expect(generateWebComponentSnippet(config, SCRIPT_URL)).not.toContain("voice");
    }
  });

  it("emits a bare voice attribute for the defaults", () => {
    const snippet = generateWebComponentSnippet(
      base({ widget: { voice: true } }) as unknown as ClientConfig,
      SCRIPT_URL,
    );
    expect(snippet).toContain('  voice="true"');
    expect(snippet).not.toContain("voice-");
  });

  it("emits one attribute per voice option on the web component", () => {
    const snippet = generateWebComponentSnippet(
      base({
        widget: {
          voice: { input: true, output: false, mode: "hold", autoSubmit: true, lang: "en-GB" },
        },
      }) as unknown as ClientConfig,
      SCRIPT_URL,
    );
    expect(snippet).toContain('  voice="true"');
    expect(snippet).toContain('  voice-mode="hold"');
    expect(snippet).toContain('  voice-auto-submit="true"');
    expect(snippet).toContain('  voice-input="true"');
    expect(snippet).toContain('  voice-output="false"');
    expect(snippet).toContain('  voice-lang="en-GB"');
  });
});

describe("clients/_schema.json: voice", () => {
  const schema = JSON.parse(
    readFileSync(resolve(__dirname, "../../../clients/_schema.json"), "utf-8"),
  );
  const voice = schema.properties.widget.properties.voice;

  it("describes widget.voice as a boolean or a closed options object", () => {
    const [asBoolean, asObject] = voice.oneOf;
    expect(asBoolean).toEqual({ type: "boolean" });
    expect(asObject.additionalProperties).toBe(false);
    expect(Object.keys(asObject.properties).sort()).toEqual([
      "autoSubmit",
      "input",
      "lang",
      "mode",
      "output",
    ]);
  });

  it("limits mode to the two values the widget and the CLI validator accept", () => {
    expect(voice.oneOf[1].properties.mode.enum).toEqual(["toggle", "hold"]);
    // The same values must pass / fail the hand-written validator.
    for (const mode of ["toggle", "hold"]) {
      expect(validateConfig(base({ widget: { voice: { mode } } } as never), "test-client")).toEqual([]);
    }
  });
});
