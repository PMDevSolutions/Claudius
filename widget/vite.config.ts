import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: "src/embed.tsx",
      name: "Claudius",
      fileName: "claudius",
      formats: ["iife"],
    },
    rollupOptions: {
      output: {
        assetFileNames: "claudius.[ext]",
      },
    },
    cssCodeSplit: false,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    globals: true,
  },
});
