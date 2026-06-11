import type { BuiltinThemeName, ClaudiusTheme } from "./types";

/**
 * Built-in themes. `default` is intentionally empty: the baked-in token
 * defaults (see tailwind.config.ts fallbacks and the dark block in
 * styles.css) ARE the default theme.
 */
export const builtinThemes: Record<BuiltinThemeName, ClaudiusTheme> = {
  default: {
    name: "default",
  },

  minimal: {
    name: "minimal",
    colors: {
      accent: "#171717",
      accentText: "#ffffff",
      surface: "#ffffff",
      surfaceMuted: "#f5f5f5",
      text: "#171717",
      textMuted: "#737373",
      border: "#e5e5e5",
      link: "#171717",
    },
    colorsDark: {
      accent: "#fafafa",
      accentText: "#171717",
      surface: "#0a0a0a",
      surfaceMuted: "#1c1c1c",
      text: "#fafafa",
      textMuted: "#a3a3a3",
      border: "#2e2e2e",
      field: "#1c1c1c",
      link: "#fafafa",
    },
    radii: { sm: "4px", md: "6px", lg: "10px" },
    shadows: {
      elevated: "0 4px 16px rgb(0 0 0 / 0.12)",
      floating: "0 2px 8px rgb(0 0 0 / 0.12)",
      floatingHover: "0 4px 12px rgb(0 0 0 / 0.16)",
    },
  },

  playful: {
    name: "playful",
    colors: {
      accent: "#8b5cf6",
      surfaceMuted: "#f5f3ff",
      assistantBubbleText: "#4c1d95",
      link: "#7c3aed",
    },
    colorsDark: {
      accent: "#a78bfa",
      surfaceMuted: "#2e1065",
      assistantBubbleText: "#ede9fe",
      link: "#c4b5fd",
    },
    radii: { sm: "12px", md: "16px", lg: "24px", tail: "8px" },
    shadows: {
      elevated: "0 24px 48px -12px rgb(139 92 246 / 0.35)",
      floating: "0 10px 20px -5px rgb(139 92 246 / 0.4)",
      floatingHover: "0 16px 28px -6px rgb(139 92 246 / 0.5)",
    },
    fonts: {
      heading: "ui-rounded, 'Hiragino Maru Gothic ProN', system-ui",
      body: "ui-rounded, 'Hiragino Maru Gothic ProN', system-ui",
    },
  },

  corporate: {
    name: "corporate",
    colors: {
      accent: "#1e3a5f",
      surfaceMuted: "#f3f4f6",
      text: "#1f2937",
      textMuted: "#6b7280",
      border: "#d1d5db",
      link: "#1d4ed8",
    },
    colorsDark: {
      accent: "#2c5282",
      link: "#93c5fd",
    },
    radii: { sm: "4px", md: "6px", lg: "8px", tail: "2px" },
    shadows: {
      elevated: "0 8px 24px rgb(15 23 42 / 0.16)",
      floating: "0 4px 12px rgb(15 23 42 / 0.18)",
      floatingHover: "0 6px 16px rgb(15 23 42 / 0.24)",
    },
    fonts: {
      heading: "'Segoe UI', 'Helvetica Neue', Arial, system-ui",
      body: "'Segoe UI', 'Helvetica Neue', Arial, system-ui",
    },
  },
};

export function isBuiltinThemeName(value: string): value is BuiltinThemeName {
  return Object.prototype.hasOwnProperty.call(builtinThemes, value);
}
