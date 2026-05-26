import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Build the IIFE embed bundle once before any test runs. The embed.spec.ts
 * suite injects this file via `page.addScriptTag({ path })`, so it must
 * exist on disk before tests start.
 */
export default async function globalSetup(): Promise<void> {
  const iifePath = resolve(__dirname, "..", "dist", "claudius.iife.js");

  if (process.env.E2E_SKIP_BUILD === "1" && existsSync(iifePath)) {
    return;
  }

  // eslint-disable-next-line no-console
  console.log("[e2e] Building embed bundle (pnpm build:embed)...");
  execSync("pnpm build:embed", {
    cwd: resolve(__dirname, ".."),
    stdio: "inherit",
  });

  if (!existsSync(iifePath)) {
    throw new Error(
      `[e2e] Build completed but ${iifePath} is missing — check vite.config.embed.ts.`,
    );
  }
}
