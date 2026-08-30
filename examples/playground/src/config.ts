/**
 * The playground's editable model and its mapping to the widget's public
 * `window.ClaudiusConfig` shape. Types mirror the widget's exported props
 * (ChatWidgetProps / ClaudiusConfig in widget/src/embed.tsx).
 */

/** Demo worker the live preview talks to (same one the docs site uses). */
export const DEMO_API_URL = "https://pmds-chat-worker.paul-130.workers.dev";

/** Auto-updating v1 CDN channel, matching the README embed instructions. */
export const CDN_JS_URL =
  "https://cdn.jsdelivr.net/gh/PMDevSolutions/Claudius@1/cdn/claudius.iife.js";
export const CDN_CSS_URL =
  "https://cdn.jsdelivr.net/gh/PMDevSolutions/Claudius@1/cdn/claudius.css";

/** Placeholder shown in generated snippets instead of the demo worker. */
export const SNIPPET_API_URL = "https://claudius-chat-worker.<you>.workers.dev";

export type ThemeChoice =
  | "light"
  | "dark"
  | "auto"
  | "default"
  | "minimal"
  | "playful"
  | "corporate";

export type PositionChoice =
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left";

export type LocaleChoice = "" | "en" | "es" | "fr" | "de";

export type TriggerKind = "time" | "scroll" | "exit-intent";

export interface TriggerConfig {
  enabled: boolean;
  on: TriggerKind;
  /** Used when on === "time". */
  seconds: number;
  /** Used when on === "scroll". */
  percent: number;
  action: "open" | "greeting";
  /** Used when action === "greeting". */
  greeting: string;
}

export interface PlaygroundConfig {
  title: string;
  subtitle: string;
  welcomeMessage: string;
  placeholder: string;
  theme: ThemeChoice;
  /** Empty string means "use the theme's accent". */
  accentColor: string;
  position: PositionChoice;
  /** Empty string means "auto-detect". */
  locale: LocaleChoice;
  persistMessages: boolean;
  trigger: TriggerConfig;
}

export const defaultConfig: PlaygroundConfig = {
  title: "Claudius",
  subtitle: "Ask me anything",
  welcomeMessage: "Hi! How can I help you today?",
  placeholder: "",
  theme: "light",
  accentColor: "",
  position: "bottom-right",
  locale: "",
  persistMessages: false,
  trigger: {
    enabled: false,
    on: "time",
    seconds: 5,
    percent: 50,
    action: "greeting",
    greeting: "Need a hand? I'm right here.",
  },
};

/** The widget-facing config object (subset of the embed's ClaudiusConfig). */
export interface ClaudiusConfigObject {
  apiUrl: string;
  title?: string;
  subtitle?: string;
  welcomeMessage?: string;
  placeholder?: string;
  theme?: ThemeChoice;
  accentColor?: string;
  position?: PositionChoice;
  locale?: Exclude<LocaleChoice, "">;
  persistMessages?: boolean;
  storageKeyPrefix?: string;
  triggers?: Array<Record<string, unknown>>;
}

/**
 * Map the playground model to a minimal ClaudiusConfig: defaults and empty
 * strings are omitted so the generated snippet stays as small as the widget's
 * own defaults allow.
 */
export function toClaudiusConfig(
  cfg: PlaygroundConfig,
  apiUrl: string,
): ClaudiusConfigObject {
  const out: ClaudiusConfigObject = { apiUrl };

  if (cfg.title.trim()) out.title = cfg.title.trim();
  if (cfg.subtitle.trim()) out.subtitle = cfg.subtitle.trim();
  if (cfg.welcomeMessage.trim()) out.welcomeMessage = cfg.welcomeMessage.trim();
  if (cfg.placeholder.trim()) out.placeholder = cfg.placeholder.trim();
  if (cfg.theme !== "light") out.theme = cfg.theme;
  if (cfg.accentColor) out.accentColor = cfg.accentColor;
  if (cfg.position !== "bottom-right") out.position = cfg.position;
  if (cfg.locale) out.locale = cfg.locale;
  if (cfg.persistMessages) out.persistMessages = true;

  if (cfg.trigger.enabled) {
    const action =
      cfg.trigger.action === "open"
        ? "open"
        : { greeting: cfg.trigger.greeting || "Hi there!" };
    if (cfg.trigger.on === "time") {
      out.triggers = [{ on: "time", seconds: cfg.trigger.seconds, action }];
    } else if (cfg.trigger.on === "scroll") {
      out.triggers = [{ on: "scroll", percent: cfg.trigger.percent, action }];
    } else {
      out.triggers = [{ on: "exit-intent", action }];
    }
  }

  return out;
}

export interface Preset {
  name: string;
  description: string;
  config: PlaygroundConfig;
}

export const presets: Preset[] = [
  {
    name: "Clean default",
    description: "The widget as it ships, no overrides",
    config: { ...defaultConfig },
  },
  {
    name: "Midnight",
    description: "Dark mode with a violet accent",
    config: {
      ...defaultConfig,
      title: "Night Owl Support",
      subtitle: "We never sleep",
      theme: "dark",
      accentColor: "#7c3aed",
    },
  },
  {
    name: "Playful sales",
    description: "Playful theme, orange accent, proactive greeting after 5s",
    config: {
      ...defaultConfig,
      title: "Hey there! 👋",
      subtitle: "Questions? Fire away",
      welcomeMessage: "Welcome! Ask me anything about our plans and pricing.",
      theme: "playful",
      accentColor: "#f97316",
      trigger: {
        enabled: true,
        on: "time",
        seconds: 5,
        percent: 50,
        action: "greeting",
        greeting: "Psst — got a question about pricing?",
      },
    },
  },
  {
    name: "Corporate support",
    description: "Corporate theme, persistent history, bottom-left",
    config: {
      ...defaultConfig,
      title: "Customer Care",
      subtitle: "Typically replies in minutes",
      theme: "corporate",
      position: "bottom-left",
      persistMessages: true,
    },
  },
  {
    name: "Exit saver",
    description: "Exit-intent greeting to catch abandoning visitors",
    config: {
      ...defaultConfig,
      title: "Wait — before you go",
      theme: "minimal",
      trigger: {
        enabled: true,
        on: "exit-intent",
        seconds: 5,
        percent: 50,
        action: "greeting",
        greeting: "Leaving already? I can answer in seconds.",
      },
    },
  },
];
