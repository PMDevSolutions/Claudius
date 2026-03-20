import type { Config } from "tailwindcss";

export default {
  darkMode: ["selector", '[data-claudius-dark="true"]'],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pmds: {
          blue: "var(--claudius-primary, #2563eb)",
          dark: "var(--claudius-dark, #1e293b)",
          "light-green": "var(--claudius-light, #f1f5f9)",
          gray: "var(--claudius-gray, #64748b)",
        },
      },
      fontFamily: {
        heading: ["system-ui", "sans-serif"],
        body: ["system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "16px",
        button: "12px",
      },
    },
  },
  plugins: [],
} satisfies Config;
