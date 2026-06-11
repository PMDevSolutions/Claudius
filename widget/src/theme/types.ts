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

export type ThemeColorToken = (typeof THEME_COLOR_TOKENS)[number];
export type ThemeRadiusToken = (typeof THEME_RADIUS_TOKENS)[number];
export type ThemeShadowToken = (typeof THEME_SHADOW_TOKENS)[number];
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
  $schema?: string;
  name?: string;
  /** Initial color scheme this theme is designed for. Defaults to "light". */
  colorScheme?: "light" | "dark" | "auto";
  colors?: Partial<Record<ThemeColorToken, string>>;
  colorsDark?: Partial<Record<ThemeColorToken, string>>;
  radii?: Partial<Record<ThemeRadiusToken, string>>;
  shadows?: Partial<Record<ThemeShadowToken, string>>;
  fonts?: Partial<Record<ThemeFontToken, string>>;
}

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
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  | (string & {});
