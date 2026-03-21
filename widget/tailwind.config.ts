import type { Config } from "tailwindcss";

export default {
  darkMode: ["selector", '[data-claudius-dark="true"]'],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        claudius: {
          primary: "var(--claudius-primary, #2563eb)",
          dark: "var(--claudius-dark, #1e293b)",
          light: "var(--claudius-light, #f1f5f9)",
          gray: "var(--claudius-gray, #64748b)",
          border: "var(--claudius-border, #e2e8f0)",
          "user-bg": "var(--claudius-user-bg, #2563eb)",
          "user-text": "var(--claudius-user-text, #ffffff)",
          "assistant-bg": "var(--claudius-assistant-bg, #f1f5f9)",
          "assistant-text": "var(--claudius-assistant-text, #1e293b)",
          error: "var(--claudius-error, #dc2626)",
          "error-bg": "var(--claudius-error-bg, #fef2f2)",
        },
      },
      fontFamily: {
        heading: ["var(--claudius-font-heading, system-ui)", "sans-serif"],
        body: ["var(--claudius-font-body, system-ui)", "sans-serif"],
      },
      borderRadius: {
        card: "var(--claudius-radius-card, 16px)",
        button: "var(--claudius-radius-button, 12px)",
        bubble: "var(--claudius-radius-bubble, 16px)",
      },
    },
  },
  plugins: [],
} satisfies Config;
