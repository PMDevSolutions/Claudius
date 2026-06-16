// Copy the widget's generated TypeDoc HTML into the Astro site so it ships
// with the docs deploy at /api/. Tolerant by design: if the reference has not
// been generated yet (e.g. a docs-only local build), warn and skip so the
// docs build still succeeds. CI generates it first (see .github/workflows/docs.yml).
import { cp, access, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../widget/dist/api");
const dest = resolve(here, "../public/api");

try {
  await access(src);
} catch {
  console.warn(
    "[copy-api] ../widget/dist/api not found; skipping. " +
      "Run `pnpm --dir ../widget docs:api` to include the API reference.",
  );
  process.exit(0);
}

await rm(dest, { recursive: true, force: true });
await cp(src, dest, { recursive: true });
console.log("[copy-api] copied widget/dist/api -> docs/public/api");
