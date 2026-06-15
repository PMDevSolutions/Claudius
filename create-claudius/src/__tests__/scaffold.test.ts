import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { scaffold } from "../scaffold.js";
import { TEMPLATE_IDS } from "../frameworks.js";

const FIXED = {
  projectName: "demo-app",
  theme: "auto",
  accent: "#4f46e5",
  apiUrl: "https://demo.workers.dev",
  // Pinned so snapshots don't churn when the package version bumps.
  widgetVersion: "^1.6.0",
};

// Matches leftover scaffold tokens like {{PROJECT_NAME}} but NOT legitimate
// JSX inline styles like style={{ maxWidth: "32rem" }}.
const LEFTOVER_TOKEN = /\{\{[A-Z_]+\}\}/;

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

/** Map of POSIX-relative path -> normalized content, key-sorted for stable snapshots. */
async function snapshotTree(dir: string): Promise<Record<string, string>> {
  const files = await walk(dir);
  const entries: [string, string][] = [];
  for (const file of files) {
    const rel = relative(dir, file).split(sep).join("/");
    const content = (await readFile(file, "utf8")).replace(/\r\n/g, "\n");
    entries.push([rel, content]);
  }
  entries.sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries);
}

describe("scaffold", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "create-claudius-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  for (const template of TEMPLATE_IDS) {
    it(`generates the ${template} template`, async () => {
      const target = join(dir, template);
      await scaffold({ ...FIXED, template, worker: false, projectDir: target });

      const tree = await snapshotTree(target);
      expect(tree).toMatchSnapshot();

      const keys = Object.keys(tree);
      expect(keys).toContain(".gitignore");
      expect(keys).not.toContain("_gitignore");
      for (const [path, content] of Object.entries(tree)) {
        expect(content, `leftover token in ${path}`).not.toMatch(LEFTOVER_TOKEN);
      }
    });
  }

  it("adds the worker scaffold when requested", async () => {
    const target = join(dir, "with-worker");
    await scaffold({ ...FIXED, template: "react", worker: true, projectDir: target });

    const tree = await snapshotTree(target);
    expect(tree).toMatchSnapshot();

    const keys = Object.keys(tree);
    expect(keys).toContain("worker/wrangler.toml");
    expect(keys).toContain("worker/src/index.ts");
    expect(keys).toContain("worker/.gitignore");
    for (const content of Object.values(tree)) {
      expect(content).not.toMatch(LEFTOVER_TOKEN);
    }
  });

  it("injects the provided values into key files", async () => {
    const target = join(dir, "values");
    await scaffold({ ...FIXED, template: "react", worker: false, projectDir: target });

    const pkg = await readFile(join(target, "package.json"), "utf8");
    expect(pkg).toContain('"name": "demo-app"');
    expect(pkg).toContain('"claudius-chat-widget": "^1.6.0"');

    const app = await readFile(join(target, "src", "App.tsx"), "utf8");
    expect(app).toContain('apiUrl="https://demo.workers.dev"');
    expect(app).toContain('theme="auto"');
    expect(app).toContain('accentColor="#4f46e5"');
  });
});
