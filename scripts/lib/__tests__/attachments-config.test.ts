import { describe, it, expect } from "vitest";
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

describe("validateConfig: attachments", () => {
  it("accepts widget.attachments as a boolean or a limits object", () => {
    expect(validateConfig(base({ widget: { attachments: true } }), "test-client")).toEqual([]);
    expect(validateConfig(base({ widget: { attachments: false } }), "test-client")).toEqual([]);
    expect(
      validateConfig(
        base({
          widget: {
            attachments: { maxSizeBytes: 1024, maxCount: 2, allowedTypes: ["image/png"] },
          },
        }),
        "test-client",
      ),
    ).toEqual([]);
  });

  it("rejects malformed widget.attachments", () => {
    const errors = validateConfig(
      base({
        widget: {
          attachments: { maxSizeBytes: 0, maxCount: 1.5, allowedTypes: [] },
        },
      }),
      "test-client",
    );
    expect(fields(errors)).toEqual([
      "widget.attachments.maxSizeBytes",
      "widget.attachments.maxCount",
      "widget.attachments.allowedTypes",
    ]);

    const wrongType = validateConfig(
      base({ widget: { attachments: "yes" as unknown as boolean } }),
      "test-client",
    );
    expect(fields(wrongType)).toEqual(["widget.attachments"]);
  });

  it("accepts a full worker.attachments block", () => {
    const errors = validateConfig(
      base({
        worker: {
          attachments: {
            enabled: true,
            maxBytes: 5242880,
            maxCount: 5,
            maxRequestBytes: 20971520,
            allowedTypes: ["image/png", "application/pdf"],
            storage: "r2",
            retentionHours: 48,
            quotaIpBytesPerDay: 0,
            quotaTenantBytesPerDay: 1048576,
          },
        },
      }),
      "test-client",
    );
    expect(errors).toEqual([]);
  });

  it("rejects bad worker.attachments values", () => {
    const errors = validateConfig(
      base({
        worker: {
          attachments: {
            enabled: "true" as unknown as boolean,
            storage: "s3" as unknown as "r2",
            retentionHours: 0,
            quotaIpBytesPerDay: -1,
          },
        },
      }),
      "test-client",
    );
    expect(fields(errors)).toEqual([
      "worker.attachments.enabled",
      "worker.attachments.storage",
      "worker.attachments.retentionHours",
      "worker.attachments.quotaIpBytesPerDay",
    ]);

    const notObject = validateConfig(
      base({ worker: { attachments: true as unknown as Record<string, never> } }),
      "test-client",
    );
    expect(fields(notObject)).toEqual(["worker.attachments"]);
  });
});

describe("snippets: attachments", () => {
  const config = base({ widget: { title: "Acme", attachments: true } }) as unknown as ClientConfig;

  it("passes `attachments: true` through to ClaudiusConfig", () => {
    const out = generateScriptSnippet(config, SCRIPT_URL);
    expect(out).toContain('"attachments": true');
  });

  it("passes a limits object through to ClaudiusConfig", () => {
    const limits = base({
      widget: { attachments: { maxCount: 2 } },
    }) as unknown as ClientConfig;
    const out = generateScriptSnippet(limits, SCRIPT_URL);
    expect(out).toContain('"attachments": {');
    expect(out).toContain('"maxCount": 2');
  });

  it("omits attachments when disabled or unset", () => {
    const off = base({ widget: { attachments: false } }) as unknown as ClientConfig;
    expect(generateScriptSnippet(off, SCRIPT_URL)).not.toContain("attachments");
    expect(generateScriptSnippet(base() as unknown as ClientConfig, SCRIPT_URL)).not.toContain(
      "attachments",
    );
  });

  it("emits the attachments attribute on the web component", () => {
    const out = generateWebComponentSnippet(config, SCRIPT_URL);
    expect(out).toContain('attachments="true"');
    const off = base({ widget: { attachments: false } }) as unknown as ClientConfig;
    expect(generateWebComponentSnippet(off, SCRIPT_URL)).not.toContain("attachments");
  });
});
