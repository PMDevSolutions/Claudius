import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";
import schema from "../theme.v1.schema.json";
import { builtinThemes } from "../themes";
import {
  THEME_COLOR_TOKENS,
  THEME_RADIUS_TOKENS,
  THEME_SHADOW_TOKENS,
  THEME_FONT_TOKENS,
} from "../types";

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

describe("theme.v1 JSON schema", () => {
  it("accepts every built-in theme", () => {
    for (const [name, theme] of Object.entries(builtinThemes)) {
      const valid = validate(theme);
      expect(valid, `${name}: ${ajv.errorsText(validate.errors)}`).toBe(true);
    }
  });

  it("accepts a kitchen-sink theme using every token", () => {
    const theme = {
      $schema: "https://claudius-docs.pages.dev/schema/theme.v1.json",
      name: "kitchen-sink",
      colorScheme: "auto",
      colors: Object.fromEntries(THEME_COLOR_TOKENS.map((t) => [t, "#123456"])),
      colorsDark: Object.fromEntries(
        THEME_COLOR_TOKENS.map((t) => [t, "#654321"]),
      ),
      radii: Object.fromEntries(THEME_RADIUS_TOKENS.map((t) => [t, "4px"])),
      shadows: Object.fromEntries(
        THEME_SHADOW_TOKENS.map((t) => [t, "0 1px 2px black"]),
      ),
      fonts: Object.fromEntries(
        THEME_FONT_TOKENS.map((t) => [t, "Georgia, serif"]),
      ),
    };
    expect(validate(theme), ajv.errorsText(validate.errors)).toBe(true);
  });

  it("rejects unknown color tokens", () => {
    expect(validate({ colors: { banana: "#ffff00" } })).toBe(false);
  });

  it("rejects unknown top-level properties", () => {
    expect(validate({ tokens: {} })).toBe(false);
  });

  it("rejects non-string and empty values", () => {
    expect(validate({ colors: { accent: 42 } })).toBe(false);
    expect(validate({ radii: { md: "" } })).toBe(false);
  });

  it("rejects invalid colorScheme values", () => {
    expect(validate({ colorScheme: "sepia" })).toBe(false);
  });

  it("schema token lists stay in sync with the TypeScript types", () => {
    const colorProps = Object.keys(
      (schema as Record<string, never>)["definitions"]["colorTokens"][
        "properties"
      ],
    );
    expect(colorProps.sort()).toEqual([...THEME_COLOR_TOKENS].sort());
  });

  it("published copy in docs/public is byte-identical to the source", () => {
    const source = readFileSync(
      join(__dirname, "..", "theme.v1.schema.json"),
      "utf8",
    );
    const published = readFileSync(
      join(
        __dirname,
        "..",
        "..",
        "..",
        "..",
        "docs",
        "public",
        "schema",
        "theme.v1.json",
      ),
      "utf8",
    );
    expect(published).toBe(source);
  });
});
