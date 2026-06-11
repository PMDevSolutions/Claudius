import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveThemeInput, themeToCssVars } from "../resolve";
import { builtinThemes } from "../themes";
import type { ClaudiusTheme } from "../types";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveThemeInput", () => {
  it("defaults to light mode with no theme", () => {
    expect(resolveThemeInput(undefined)).toEqual({ mode: "light" });
  });

  it.each(["light", "dark", "auto"] as const)(
    "treats %s as a mode-only input (existing API)",
    (mode) => {
      expect(resolveThemeInput(mode)).toEqual({ mode });
    },
  );

  it.each(["default", "minimal", "playful", "corporate"] as const)(
    "resolves built-in theme name %s",
    (name) => {
      const result = resolveThemeInput(name);
      expect(result.theme).toBe(builtinThemes[name]);
      expect(result.mode).toBe(builtinThemes[name].colorScheme ?? "light");
      expect(result.url).toBeUndefined();
    },
  );

  it("treats other strings as theme URLs", () => {
    expect(resolveThemeInput("https://example.com/theme.json")).toEqual({
      mode: "light",
      url: "https://example.com/theme.json",
    });
    expect(resolveThemeInput("/themes/acme.json")).toEqual({
      mode: "light",
      url: "/themes/acme.json",
    });
  });

  it("passes theme objects through, honoring colorScheme", () => {
    const theme: ClaudiusTheme = {
      colorScheme: "dark",
      colors: { accent: "#ff0000" },
    };
    expect(resolveThemeInput(theme)).toEqual({ mode: "dark", theme });
  });

  it("defaults object colorScheme to light", () => {
    const theme: ClaudiusTheme = { colors: { accent: "#ff0000" } };
    expect(resolveThemeInput(theme)).toEqual({ mode: "light", theme });
  });
});

describe("themeToCssVars", () => {
  it("maps camelCase color keys to kebab-case tokens, mirrored into dark", () => {
    const vars = themeToCssVars({
      colors: { accent: "#ff0000", userBubbleText: "#00ff00" },
    });
    expect(vars).toEqual({
      "--cl-color-accent": "#ff0000",
      "--cl-color-accent-dark": "#ff0000",
      "--cl-color-user-bubble-text": "#00ff00",
      "--cl-color-user-bubble-text-dark": "#00ff00",
    });
  });

  it("lets colorsDark override the dark mirror per token", () => {
    const vars = themeToCssVars({
      colors: { accent: "#ff0000" },
      colorsDark: { accent: "#990000", surface: "#000000" },
    });
    expect(vars["--cl-color-accent"]).toBe("#ff0000");
    expect(vars["--cl-color-accent-dark"]).toBe("#990000");
    // colorsDark-only keys emit only the -dark var
    expect(vars["--cl-color-surface-dark"]).toBe("#000000");
    expect(vars["--cl-color-surface"]).toBeUndefined();
  });

  it("maps radii, shadows, and fonts groups", () => {
    const vars = themeToCssVars({
      radii: { sm: "2px", md: "4px", lg: "8px", full: "999px", tail: "1px" },
      shadows: {
        elevated: "0 1px 2px black",
        floating: "none",
        floatingHover: "0 0 1px red",
      },
      fonts: { heading: "Georgia, serif", body: "Arial, sans-serif" },
    });
    expect(vars["--cl-radius-sm"]).toBe("2px");
    expect(vars["--cl-radius-md"]).toBe("4px");
    expect(vars["--cl-radius-lg"]).toBe("8px");
    expect(vars["--cl-radius-full"]).toBe("999px");
    expect(vars["--cl-radius-tail"]).toBe("1px");
    expect(vars["--cl-shadow-elevated"]).toBe("0 1px 2px black");
    expect(vars["--cl-shadow-floating"]).toBe("none");
    expect(vars["--cl-shadow-floating-hover"]).toBe("0 0 1px red");
    expect(vars["--cl-font-heading"]).toBe("Georgia, serif");
    expect(vars["--cl-font-body"]).toBe("Arial, sans-serif");
  });

  it("warns on and skips unknown token keys", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const vars = themeToCssVars({
      colors: { accent: "#fff", banana: "#yellow" } as never,
    });
    expect(vars["--cl-color-banana"]).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("banana"),
    );
  });

  it("skips non-string values without crashing", () => {
    const vars = themeToCssVars({
      colors: { accent: 42 } as never,
    });
    expect(vars).toEqual({});
  });

  it("returns an empty object for an empty theme", () => {
    expect(themeToCssVars({})).toEqual({});
  });
});

describe("builtinThemes", () => {
  it("exposes exactly the four documented themes", () => {
    expect(Object.keys(builtinThemes).sort()).toEqual([
      "corporate",
      "default",
      "minimal",
      "playful",
    ]);
  });

  it("default theme has no token overrides (the baked-in defaults)", () => {
    expect(themeToCssVars(builtinThemes.default)).toEqual({});
  });

  it("every built-in produces only valid --cl- variables", () => {
    for (const theme of Object.values(builtinThemes)) {
      for (const key of Object.keys(themeToCssVars(theme))) {
        expect(key).toMatch(/^--cl-(color|radius|shadow|font)-[a-z-]+$/);
      }
    }
  });
});
