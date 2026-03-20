import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pmds: {
          blue: "hsl(207, 100%, 32%)",
          dark: "hsl(140, 67%, 2%)",
          "light-blue": "hsl(206, 68%, 85%)",
          "light-green": "hsl(122, 64%, 95%)",
          gray: "hsl(135, 5%, 30%)",
          peach: "hsl(27, 100%, 91%)",
        },
      },
      fontFamily: {
        heading: ["Comfortaa", "sans-serif"],
        body: ["Assistant", "sans-serif"],
      },
      borderRadius: {
        card: "40px",
        button: "32px",
      },
    },
  },
  plugins: [],
} satisfies Config;
