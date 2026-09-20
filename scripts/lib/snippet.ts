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
  const configObj: Record<string, unknown> = { apiUrl: config.apiUrl };

  if (config.widget) {
    for (const field of WIDGET_FIELDS) {
      const value = config.widget[field];
      if (value !== undefined) {
        configObj[field] = value;
      }
    }
    // `true` or a limits object both pass straight through to ClaudiusConfig.
    if (config.widget.attachments !== undefined && config.widget.attachments !== false) {
      configObj.attachments = config.widget.attachments;
    }
    if (config.widget.voice !== undefined && config.widget.voice !== false) {
      configObj.voice = config.widget.voice;
    }
    // Opt-in, so only `true` is worth emitting.
    if (config.widget.conversationExport === true) {
      configObj.conversationExport = true;
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
    // The attribute form only toggles the defaults; custom limits need the
    // script snippet (ClaudiusConfig) or the React prop.
    if (config.widget.attachments !== undefined && config.widget.attachments !== false) {
      attrs.push(["attachments", "true"]);
    }
    // Voice options are plain enums and booleans, so unlike attachment limits
    // each one has an attribute of its own.
    const voice = config.widget.voice;
    if (voice !== undefined && voice !== false) {
      attrs.push(["voice", "true"]);
      if (voice !== true) {
        if (voice.mode !== undefined) attrs.push(["voice-mode", voice.mode]);
        if (voice.autoSubmit !== undefined) {
          attrs.push(["voice-auto-submit", String(voice.autoSubmit)]);
        }
        if (voice.input !== undefined) attrs.push(["voice-input", String(voice.input)]);
        if (voice.output !== undefined) attrs.push(["voice-output", String(voice.output)]);
        if (voice.lang !== undefined) attrs.push(["voice-lang", voice.lang]);
      }
    }
    if (config.widget.conversationExport === true) {
      attrs.push(["conversation-export", "true"]);
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
