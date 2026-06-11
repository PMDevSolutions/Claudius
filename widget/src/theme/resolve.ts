import {
  THEME_COLOR_TOKENS,
  THEME_RADIUS_TOKENS,
  THEME_SHADOW_TOKENS,
  THEME_FONT_TOKENS,
  type ClaudiusTheme,
  type ClaudiusThemeInput,
} from "./types";
import { builtinThemes, isBuiltinThemeName } from "./themes";

export type ColorSchemeMode = "light" | "dark" | "auto";

const MODES: ReadonlySet<string> = new Set(["light", "dark", "auto"]);

export interface ResolvedThemeInput {
  mode: ColorSchemeMode;
  theme?: ClaudiusTheme;
  /** Set when the input is a URL to a theme JSON file (fetched separately). */
  url?: string;
}

/**
 * Classifies the `theme` option. Mode strings keep their original meaning;
 * built-in names map to their theme objects; any other string is a URL.
 */
export function resolveThemeInput(
  input: ClaudiusThemeInput | undefined,
): ResolvedThemeInput {
  if (input === undefined) {
    return { mode: "light" };
  }
  if (typeof input === "string") {
    if (MODES.has(input)) {
      return { mode: input as ColorSchemeMode };
    }
    if (isBuiltinThemeName(input)) {
      const theme = builtinThemes[input];
      return { mode: theme.colorScheme ?? "light", theme };
    }
    return { mode: "light", url: input };
  }
  return { mode: input.colorScheme ?? "light", theme: input };
}

function camelToKebab(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function warnUnknown(group: string, key: string): void {
  console.warn(
    `[Claudius] Ignoring unknown theme token "${key}" in "${group}"`,
  );
}

function collect(
  out: Record<string, string>,
  group: string,
  prefix: string,
  validKeys: readonly string[],
  values: Record<string, unknown> | undefined,
  suffix = "",
): void {
  if (!values) return;
  for (const [key, value] of Object.entries(values)) {
    if (!validKeys.includes(key)) {
      warnUnknown(group, key);
      continue;
    }
    if (typeof value !== "string") continue;
    out[`${prefix}${camelToKebab(key)}${suffix}`] = value;
  }
}

/**
 * Converts a theme object into the --cl-* custom-property map applied to the
 * widget root. Light colors mirror into the -dark variables so themed tokens
 * survive dark mode; `colorsDark` overrides the mirror per token.
 */
export function themeToCssVars(theme: ClaudiusTheme): Record<string, string> {
  const vars: Record<string, string> = {};

  collect(vars, "colors", "--cl-color-", THEME_COLOR_TOKENS, theme.colors);
  // Mirror light colors into dark before applying explicit dark overrides.
  for (const [name, value] of Object.entries({ ...vars })) {
    vars[`${name}-dark`] = value;
  }
  collect(
    vars,
    "colorsDark",
    "--cl-color-",
    THEME_COLOR_TOKENS,
    theme.colorsDark,
    "-dark",
  );

  collect(vars, "radii", "--cl-radius-", THEME_RADIUS_TOKENS, theme.radii);
  collect(vars, "shadows", "--cl-shadow-", THEME_SHADOW_TOKENS, theme.shadows);
  collect(vars, "fonts", "--cl-font-", THEME_FONT_TOKENS, theme.fonts);

  return vars;
}
