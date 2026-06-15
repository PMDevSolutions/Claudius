import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { TemplateId } from "./frameworks.js";

export interface ScaffoldOptions {
  /** Absolute path to the directory to create the project in. */
  projectDir: string;
  /** Sanitized name used for the generated package.json and titles. */
  projectName: string;
  template: TemplateId;
  theme: string;
  accent: string;
  apiUrl: string;
  /** Also scaffold a Cloudflare Worker into `<projectDir>/worker`. */
  worker: boolean;
  /** Version range for `claudius-chat-widget`, e.g. "^1.6.0". */
  widgetVersion: string;
}

function tokensFor(opts: ScaffoldOptions): Record<string, string> {
  return {
    "{{PROJECT_NAME}}": opts.projectName,
    "{{API_URL}}": opts.apiUrl,
    "{{THEME}}": opts.theme,
    "{{ACCENT_COLOR}}": opts.accent,
    "{{WIDGET_VERSION}}": opts.widgetVersion,
  };
}

function applyTokens(content: string, tokens: Record<string, string>): string {
  let out = content;
  for (const [token, value] of Object.entries(tokens)) {
    out = out.split(token).join(value);
  }
  return out;
}

// npm strips `.gitignore` from published tarballs, so templates ship it as
// `_gitignore` and we rename on write. Same trick create-vite uses.
function destFileName(name: string): string {
  return name === "_gitignore" ? ".gitignore" : name;
}

async function copyTemplate(
  srcDir: string,
  destDir: string,
  tokens: Record<string, string>,
): Promise<void> {
  await mkdir(destDir, { recursive: true });
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(srcDir, entry.name);
    const destPath = join(destDir, destFileName(entry.name));
    if (entry.isDirectory()) {
      await copyTemplate(srcPath, destPath, tokens);
    } else {
      const raw = await readFile(srcPath, "utf8");
      await writeFile(destPath, applyTokens(raw, tokens));
    }
  }
}

/** Absolute path to the bundled `templates/` directory (sibling of dist/ and src/). */
export function templatesRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../templates");
}

/** True when `dir` exists and contains at least one entry. */
export function isNonEmptyDir(dir: string): boolean {
  if (!existsSync(dir)) return false;
  try {
    return readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

export async function scaffold(opts: ScaffoldOptions): Promise<void> {
  const tokens = tokensFor(opts);
  const root = templatesRoot();
  await copyTemplate(join(root, opts.template), opts.projectDir, tokens);
  if (opts.worker) {
    await copyTemplate(join(root, "worker"), join(opts.projectDir, "worker"), tokens);
  }
}
