// Emit a CommonJS declaration twin (index.d.cts) alongside the rolled-up
// index.d.ts. The two files are byte-identical; the .cts extension tells
// TypeScript to resolve types for the `require` export condition, which keeps
// @arethetypeswrong/cli happy (no FalseCJS masquerade).
import { copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, "../dist");
await copyFile(resolve(dist, "index.d.ts"), resolve(dist, "index.d.cts"));
console.log("[emit-dts-cts] wrote dist/index.d.cts");
