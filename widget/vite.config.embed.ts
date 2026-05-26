import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { readFileSync } from "fs";

const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "package.json"), "utf-8"),
) as { version: string };

export default defineConfig({
  plugins: [react()],
  // The IIFE is loaded directly by browsers via <script src>, so any
  // `process.env.NODE_ENV` reference left in the bundle (React uses it to
  // gate dev warnings) blows up at runtime. Replace it at build time.
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    __CLAUDIUS_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/embed.tsx"),
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
    outDir: "dist",
    emptyOutDir: false,
  },
});
