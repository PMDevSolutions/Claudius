import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";
import { resolve } from "path";

export default defineConfig({
  plugins: [
    react(),
    dts({
      // unplugin-dts (vite-plugin-dts v5) calls declaration bundling
      // `bundleTypes` (the old `rollupTypes` name is ignored). This rolls the
      // whole public surface into a single dist/index.d.ts via api-extractor.
      bundleTypes: true,
      tsconfigPath: "./tsconfig.json",
      include: ["src"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/**/*.stories.tsx",
        "src/test-setup.ts",
        "src/test-utils/**",
        "src/main.tsx",
        "src/embed.tsx",
      ],
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    cors: true,
    hmr: {
      port: 5173,
    },
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "Claudius",
      formats: ["es", "cjs"],
      fileName: (format) => (format === "es" ? "claudius.js" : "claudius.cjs"),
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
      output: {
        assetFileNames: "claudius.[ext]",
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "react/jsx-runtime": "jsxRuntime",
        },
      },
    },
    cssCodeSplit: false,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    globals: true,
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/__tests__/**",
        "src/**/*.test.{ts,tsx}",
        "src/**/*.stories.{ts,tsx}",
        "src/test-setup.ts",
        "src/test-utils/**",
        "src/main.tsx",
        "src/embed.tsx",
        "src/index.ts",
        "src/api/index.ts",
        "src/api/types.ts",
        "src/vite-env.d.ts",
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
