import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  clean: true,
  // The published bin must be directly executable.
  banner: { js: "#!/usr/bin/env node" },
});
