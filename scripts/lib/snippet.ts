import type { ClientConfig } from "./config.js";

// --- Types ---

/** Widget fields that map to ClaudiusConfig / web component attributes. */
const WIDGET_FIELDS = [
  "title",
  "subtitle",
  "welcomeMessage",
  "placeholder",
  "theme",
  "position",
  "accentColor",
] as const;

/** Convert camelCase to kebab-case. */
function toKebab(str: string): string {
  return str.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
}

// --- Script snippet ---

export function generateScriptSnippet(
  config: ClientConfig,
  scriptUrl: string,
): string {
  const configObj: Record<string, string> = { apiUrl: config.apiUrl };

  if (config.widget) {
    for (const field of WIDGET_FIELDS) {
      const value = config.widget[field];
      if (value !== undefined) {
        configObj[field] = value;
      }
    }
  }

  // Build indented JSON: each line of the JSON body is indented to align under
  // the `window.ClaudiusConfig = ` assignment (2-space base + 2-space JSON).
  const json = JSON.stringify(configObj, null, 2);
  // Indent all lines after the first by 4 spaces so they align with the opening brace.
  const indentedJson = json.replace(/\n/g, "\n    ");

  const lines = [
    `<!-- Claudius Chat Widget - ${config.name} -->`,
    `<script>`,
    `  window.ClaudiusConfig = ${indentedJson};`,
    `</script>`,
    `<script src="${scriptUrl}" defer></script>`,
  ];

  return lines.join("\n");
}

// --- Web component snippet ---

export function generateWebComponentSnippet(
  config: ClientConfig,
  scriptUrl: string,
): string {
  const attrs: Array<[string, string]> = [["api-url", config.apiUrl]];

  if (config.widget) {
    for (const field of WIDGET_FIELDS) {
      const value = config.widget[field];
      if (value !== undefined) {
        attrs.push([toKebab(field), value]);
      }
    }
  }

  const attrLines = attrs.map(([key, val]) => `  ${key}="${val}"`).join("\n");

  const lines = [
    `<!-- Claudius Chat Widget - ${config.name} -->`,
    `<script src="${scriptUrl}" defer></script>`,
    `<claudius-chat`,
    attrLines + ">",
    `</claudius-chat>`,
  ];

  return lines.join("\n");
}
