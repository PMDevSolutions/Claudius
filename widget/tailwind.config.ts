import type { Config } from "tailwindcss";

/**
 * All visual decisions resolve through --cl-* design tokens (see
 * src/theme/). The var() fallback values below ARE the default theme's
 * light palette; [data-claudius-dark="true"] in styles.css reassigns the
 * color tokens for dark mode.
 *
 * Legacy --claudius-* custom properties (the pre-token public surface) sit
 * first in each chain so existing external overrides keep winning.
 */
export default {
  darkMode: ["selector", '[data-claudius-dark="true"]'],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        claudius: {
          accent: "var(--claudius-primary, var(--cl-color-accent, #2563eb))",
          "accent-text": "var(--cl-color-accent-text, #ffffff)",
          "accent-soft": "var(--cl-color-accent-soft, rgb(255 255 255 / 0.2))",
          "accent-text-muted":
            "var(--cl-color-accent-text-muted, rgb(255 255 255 / 0.7))",
          surface: "var(--cl-color-surface, #ffffff)",
          "surface-muted":
            "var(--claudius-light, var(--cl-color-surface-muted, #f1f5f9))",
          text: "var(--claudius-dark, var(--cl-color-text, #1e293b))",
          "text-muted":
            "var(--claudius-gray, var(--cl-color-text-muted, #64748b))",
          border: "var(--claudius-border, var(--cl-color-border, #e2e8f0))",
          "user-bubble":
            "var(--claudius-user-bg, var(--cl-color-user-bubble, var(--cl-color-accent, #2563eb)))",
          "user-bubble-text":
            "var(--claudius-user-text, var(--cl-color-user-bubble-text, #ffffff))",
          "assistant-bubble":
            "var(--claudius-assistant-bg, var(--cl-color-assistant-bubble, var(--cl-color-surface-muted, #f1f5f9)))",
          "assistant-bubble-text":
            "var(--claudius-assistant-text, var(--cl-color-assistant-bubble-text, var(--cl-color-text, #1e293b)))",
          field: "var(--cl-color-field, #ffffff)",
          error: "var(--claudius-error, var(--cl-color-error, #dc2626))",
          "error-surface":
            "var(--claudius-error-bg, var(--cl-color-error-surface, #fef2f2))",
          "error-text": "var(--cl-color-error-text, #ffffff)",
          link: "var(--cl-color-link, currentColor)",
          scrim: "var(--cl-color-scrim, rgb(0 0 0 / 0.5))",
        },
      },
      fontFamily: {
        heading: [
          "var(--claudius-font-heading, var(--cl-font-heading, system-ui))",
          "sans-serif",
        ],
        body: [
          "var(--claudius-font-body, var(--cl-font-body, system-ui))",
          "sans-serif",
        ],
      },
      borderRadius: {
        "claudius-sm": "var(--cl-radius-sm, 8px)",
        "claudius-md":
          "var(--claudius-radius-button, var(--cl-radius-md, 12px))",
        "claudius-lg": "var(--claudius-radius-card, var(--cl-radius-lg, 16px))",
        "claudius-bubble":
          "var(--claudius-radius-bubble, var(--cl-radius-lg, 16px))",
        "claudius-tail": "var(--cl-radius-tail, 2px)",
        "claudius-full": "var(--cl-radius-full, 9999px)",
      },
      boxShadow: {
        "claudius-elevated":
          "var(--cl-shadow-elevated, 0 25px 50px -12px rgb(0 0 0 / 0.25))",
        "claudius-floating":
          "var(--cl-shadow-floating, 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1))",
        "claudius-floating-hover":
          "var(--cl-shadow-floating-hover, 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1))",
      },
    },
  },
  plugins: [],
} satisfies Config;
