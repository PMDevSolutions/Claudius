import { describe, expect, it } from "vitest";
import {
  defaultConfig,
  presets,
  toClaudiusConfig,
  type PlaygroundConfig,
} from "../../config";
import { generateSandboxHtml, generateScriptSnippet } from "../snippet";
import { decodeConfig, encodeConfig } from "../encode";

const API = "https://example.workers.dev";

describe("toClaudiusConfig", () => {
  it("omits defaults and empty values", () => {
    const cfg: PlaygroundConfig = {
      ...defaultConfig,
      title: "",
      subtitle: "",
      welcomeMessage: "",
      placeholder: "",
    };
    expect(toClaudiusConfig(cfg, API)).toEqual({ apiUrl: API });
  });

  it("includes every overridden public prop", () => {
    const cfg: PlaygroundConfig = {
      title: "T",
      subtitle: "S",
      welcomeMessage: "W",
      placeholder: "P",
      theme: "playful",
      accentColor: "#ff0000",
      position: "top-left",
      locale: "fr",
      persistMessages: true,
      trigger: {
        enabled: true,
        on: "scroll",
        seconds: 5,
        percent: 70,
        action: "greeting",
        greeting: "Hello!",
      },
    };
    expect(toClaudiusConfig(cfg, API)).toEqual({
      apiUrl: API,
      title: "T",
      subtitle: "S",
      welcomeMessage: "W",
      placeholder: "P",
      theme: "playful",
      accentColor: "#ff0000",
      position: "top-left",
      locale: "fr",
      persistMessages: true,
      triggers: [{ on: "scroll", percent: 70, action: { greeting: "Hello!" } }],
    });
  });

  it("maps each trigger kind to the widget's Trigger shape", () => {
    const base = { ...defaultConfig };
    const time = toClaudiusConfig(
      {
        ...base,
        trigger: { ...base.trigger, enabled: true, on: "time", action: "open" },
      },
      API,
    );
    expect(time.triggers).toEqual([{ on: "time", seconds: 5, action: "open" }]);

    const exit = toClaudiusConfig(
      {
        ...base,
        trigger: { ...base.trigger, enabled: true, on: "exit-intent" },
      },
      API,
    );
    expect(exit.triggers).toEqual([
      { on: "exit-intent", action: { greeting: base.trigger.greeting } },
    ]);
  });
});

describe("generateScriptSnippet", () => {
  it("produces the link, config, and script tags", () => {
    const snippet = generateScriptSnippet({ apiUrl: API, title: "T" });
    expect(snippet).toContain('<link rel="stylesheet"');
    expect(snippet).toContain("window.ClaudiusConfig = {");
    expect(snippet).toContain(`"apiUrl": "${API}"`);
    expect(snippet).toContain('"title": "T"');
    expect(snippet).toContain("claudius.iife.js");
    expect(snippet).toContain("defer");
  });
});

describe("generateSandboxHtml", () => {
  it("wraps the snippet in a complete page", () => {
    const html = generateSandboxHtml({ apiUrl: API });
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("window.ClaudiusConfig");
    expect(html).toContain("</html>");
  });
});

describe("encodeConfig / decodeConfig", () => {
  it("round-trips every preset, including non-ASCII text", () => {
    for (const preset of presets) {
      const cfgObj = toClaudiusConfig(preset.config, API);
      expect(decodeConfig(encodeConfig(cfgObj))).toEqual(cfgObj);
    }
    const emoji = { apiUrl: API, title: "Héllo 👋 café" };
    expect(decodeConfig(encodeConfig(emoji))).toEqual(emoji);
  });

  it("returns null for garbage input", () => {
    expect(decodeConfig("not-base64!!")).toBeNull();
  });
});
