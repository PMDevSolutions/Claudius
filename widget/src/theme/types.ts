export const THEME_COLOR_TOKENS = [
  "accent",
  "accentText",
  "accentSoft",
  "accentTextMuted",
  "surface",
  "surfaceMuted",
  "text",
  "textMuted",
  "border",
  "userBubble",
  "userBubbleText",
  "assistantBubble",
  "assistantBubbleText",
  "field",
  "error",
  "errorSurface",
  "errorText",
  "link",
  "scrim",
] as const;

export const THEME_RADIUS_TOKENS = ["sm", "md", "lg", "full", "tail"] as const;

export const THEME_SHADOW_TOKENS = [
  "elevated",
  "floating",
  "floatingHover",
] as const;

export const THEME_FONT_TOKENS = ["heading", "body"] as const;

/** Names of the color tokens a theme can override (e.g. `accent`, `surface`, `text`). */
export type ThemeColorToken = (typeof THEME_COLOR_TOKENS)[number];
/** Names of the border-radius tokens a theme can override. */
export type ThemeRadiusToken = (typeof THEME_RADIUS_TOKENS)[number];
/** Names of the box-shadow tokens a theme can override. */
export type ThemeShadowToken = (typeof THEME_SHADOW_TOKENS)[number];
/** Names of the font-family tokens a theme can override. */
export type ThemeFontToken = (typeof THEME_FONT_TOKENS)[number];

/**
 * A Claudius design-token theme. Every value is a CSS string applied via
 * --cl-* custom properties. `colors` apply to both light and dark modes
 * unless `colorsDark` overrides a token for dark mode specifically.
 *
 * JSON theme files validate against
 * https://claudius-docs.pages.dev/schema/theme.v1.json
 */
export interface ClaudiusTheme {
  /** Optional JSON Schema URL, for editor validation and autocomplete. */
  $schema?: string;
  /** Human-readable theme name. */
  name?: string;
  /** Initial color scheme this theme is designed for. Defaults to "light". */
  colorScheme?: "light" | "dark" | "auto";
  /** Color token overrides applied in both light and dark mode. */
  colors?: Partial<Record<ThemeColorToken, string>>;
  /** Color token overrides applied only in dark mode, layered over {@link ClaudiusTheme.colors}. */
  colorsDark?: Partial<Record<ThemeColorToken, string>>;
  /** Border-radius token overrides. */
  radii?: Partial<Record<ThemeRadiusToken, string>>;
  /** Box-shadow token overrides. */
  shadows?: Partial<Record<ThemeShadowToken, string>>;
  /** Font-family token overrides. */
  fonts?: Partial<Record<ThemeFontToken, string>>;
}

/** Names of the built-in themes shipped in {@link builtinThemes}. */
export type BuiltinThemeName = "default" | "minimal" | "playful" | "corporate";

/**
 * Everything the `theme` option accepts: the original color-scheme modes, a
 * built-in theme name, an inline theme object, or a URL to a theme JSON file.
 * `(string & {})` keeps literal autocomplete while allowing URLs.
 */
export type ClaudiusThemeInput =
  | "light"
  | "dark"
  | "auto"
  | BuiltinThemeName
  | ClaudiusTheme
  | (string & {});
