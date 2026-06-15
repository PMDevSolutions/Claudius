export type TemplateId = "vanilla" | "react" | "next";

export interface Framework {
  id: TemplateId;
  label: string;
  hint: string;
}

export const FRAMEWORKS: Framework[] = [
  { id: "vanilla", label: "Vanilla", hint: "Static site + CDN script embed" },
  { id: "react", label: "React", hint: "Vite + React + TypeScript" },
  { id: "next", label: "Next.js", hint: "App Router + TypeScript" },
];

export const TEMPLATE_IDS: TemplateId[] = FRAMEWORKS.map((f) => f.id);

export interface ThemeOption {
  value: string;
  label: string;
}

export const THEMES: ThemeOption[] = [
  { value: "auto", label: "Auto (follows system)" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "default", label: "Default (built-in)" },
  { value: "minimal", label: "Minimal" },
  { value: "playful", label: "Playful" },
  { value: "corporate", label: "Corporate" },
];

export const THEME_VALUES: string[] = THEMES.map((t) => t.value);

export const DEFAULTS = {
  projectName: "my-claudius-app",
  template: "react" as TemplateId,
  theme: "auto",
  accent: "#4f46e5",
  apiUrl: "https://your-worker.workers.dev",
};

export function isTemplateId(value: string): value is TemplateId {
  return (TEMPLATE_IDS as string[]).includes(value);
}
