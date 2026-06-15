import { cancel, confirm, intro, isCancel, select, text } from "@clack/prompts";
import pc from "picocolors";
import { DEFAULTS, FRAMEWORKS, THEMES, type TemplateId } from "./frameworks.js";

export interface PromptResult {
  projectName: string;
  template: TemplateId;
  theme: string;
  accent: string;
  apiUrl: string;
  worker: boolean;
}

/** Values already supplied via CLI flags — these skip their prompt. */
export interface ProvidedOptions {
  projectName?: string;
  template?: TemplateId;
  theme?: string;
  accent?: string;
  apiUrl?: string;
  worker?: boolean;
  /** Accept defaults for everything not explicitly provided. */
  yes?: boolean;
}

const PROJECT_NAME_RE = /^[a-zA-Z0-9._-]+$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function unwrap<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel("Scaffolding cancelled.");
    process.exit(0);
  }
  return value as T;
}

export async function runPrompts(provided: ProvidedOptions): Promise<PromptResult> {
  intro(pc.bgCyan(pc.black(" create-claudius ")));

  const yes = provided.yes ?? false;

  const projectName =
    provided.projectName ??
    (yes
      ? DEFAULTS.projectName
      : unwrap(
          await text({
            message: "Project name?",
            placeholder: DEFAULTS.projectName,
            defaultValue: DEFAULTS.projectName,
            validate: (v) =>
              v && !PROJECT_NAME_RE.test(v.trim())
                ? "Use letters, numbers, dashes, dots, or underscores."
                : undefined,
          }),
        ));

  const template = (provided.template ??
    (yes
      ? DEFAULTS.template
      : unwrap(
          await select({
            message: "Which framework?",
            options: FRAMEWORKS.map((f) => ({ value: f.id, label: f.label, hint: f.hint })),
            initialValue: DEFAULTS.template,
          }),
        ))) as TemplateId;

  const theme =
    provided.theme ??
    (yes
      ? DEFAULTS.theme
      : (unwrap(
          await select({
            message: "Theme?",
            options: THEMES,
            initialValue: DEFAULTS.theme,
          }),
        ) as string));

  const accent =
    provided.accent ??
    (yes
      ? DEFAULTS.accent
      : unwrap(
          await text({
            message: "Accent color (hex)?",
            placeholder: DEFAULTS.accent,
            defaultValue: DEFAULTS.accent,
            validate: (v) =>
              v && !HEX_RE.test(v.trim())
                ? "Use a 6-digit hex color like #4f46e5."
                : undefined,
          }),
        ));

  const apiUrl =
    provided.apiUrl ??
    (yes
      ? DEFAULTS.apiUrl
      : unwrap(
          await text({
            message: "Worker API URL?",
            placeholder: DEFAULTS.apiUrl,
            defaultValue: DEFAULTS.apiUrl,
          }),
        ));

  const worker =
    provided.worker ??
    (yes
      ? false
      : unwrap(
          await confirm({
            message: "Also scaffold a Cloudflare Worker?",
            initialValue: false,
          }),
        ));

  return {
    projectName: projectName.trim(),
    template,
    theme,
    accent: accent.trim(),
    apiUrl: apiUrl.trim(),
    worker,
  };
}
