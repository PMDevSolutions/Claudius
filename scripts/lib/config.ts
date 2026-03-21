import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// --- Types ---

export interface WidgetConfig {
  title?: string;
  subtitle?: string;
  welcomeMessage?: string;
  placeholder?: string;
  theme?: "light" | "dark" | "auto";
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  accentColor?: string;
}

export interface WorkerConfig {
  model?: string;
  maxTokens?: number;
  rateLimitMinute?: number;
  rateLimitHour?: number;
  systemPrompt?: string;
}

export interface ClientConfig {
  $schema?: string;
  name: string;
  slug: string;
  apiUrl: string;
  allowedDomains: string[];
  widget?: WidgetConfig;
  worker?: WorkerConfig;
}

export interface ValidationError {
  field: string;
  message: string;
}

// --- Constants ---

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const VALID_THEMES = ["light", "dark", "auto"] as const;
const VALID_POSITIONS = [
  "bottom-right",
  "bottom-left",
  "top-right",
  "top-left",
] as const;

// --- Validation ---

export function validateConfig(
  config: Record<string, unknown>,
  expectedSlug: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // name: required non-empty string
  if (typeof config.name !== "string" || config.name.trim() === "") {
    errors.push({ field: "name", message: "name is required and must be a non-empty string" });
  }

  // slug: required, must match pattern, must match expectedSlug
  if (typeof config.slug !== "string" || config.slug.trim() === "") {
    errors.push({ field: "slug", message: "slug is required and must be a non-empty string" });
  } else {
    if (!SLUG_PATTERN.test(config.slug)) {
      errors.push({
        field: "slug",
        message: "slug must match pattern ^[a-z0-9]+(?:-[a-z0-9]+)*$ (lowercase alphanumeric with hyphens)",
      });
    }
    if (config.slug !== expectedSlug) {
      errors.push({
        field: "slug",
        message: `slug "${config.slug}" does not match expected slug "${expectedSlug}"`,
      });
    }
  }

  // apiUrl: required, non-empty, valid URL
  if (typeof config.apiUrl !== "string" || config.apiUrl.trim() === "") {
    errors.push({ field: "apiUrl", message: "apiUrl is required and must be a non-empty string" });
  } else {
    try {
      new URL(config.apiUrl);
    } catch {
      errors.push({ field: "apiUrl", message: "apiUrl must be a valid URL" });
    }
  }

  // allowedDomains: required non-empty array
  if (!Array.isArray(config.allowedDomains) || config.allowedDomains.length === 0) {
    errors.push({
      field: "allowedDomains",
      message: "allowedDomains is required and must be a non-empty array",
    });
  }

  // widget (optional)
  if (config.widget !== undefined) {
    const widget = config.widget as Record<string, unknown>;

    if (widget.theme !== undefined) {
      if (!(VALID_THEMES as readonly string[]).includes(widget.theme as string)) {
        errors.push({
          field: "widget.theme",
          message: `widget.theme must be one of: ${VALID_THEMES.join(", ")}`,
        });
      }
    }

    if (widget.position !== undefined) {
      if (!(VALID_POSITIONS as readonly string[]).includes(widget.position as string)) {
        errors.push({
          field: "widget.position",
          message: `widget.position must be one of: ${VALID_POSITIONS.join(", ")}`,
        });
      }
    }

    if (widget.accentColor !== undefined) {
      if (
        typeof widget.accentColor !== "string" ||
        !HEX_COLOR_PATTERN.test(widget.accentColor)
      ) {
        errors.push({
          field: "widget.accentColor",
          message: "widget.accentColor must match pattern #RRGGBB (6-digit hex color)",
        });
      }
    }
  }

  return errors;
}

// --- Loader ---

export function loadConfig(slug: string, clientsDir: string): ClientConfig {
  const configPath = resolve(clientsDir, `${slug}.json`);

  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  let raw: string;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch (err) {
    throw new Error(`Failed to read config file: ${configPath}`);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in config file: ${configPath}`);
  }

  const errors = validateConfig(parsed, slug);
  if (errors.length > 0) {
    const formatted = errors.map((e) => `  - ${e.field}: ${e.message}`).join("\n");
    throw new Error(`Invalid config for "${slug}":\n${formatted}`);
  }

  const config = parsed as unknown as ClientConfig;

  // Check that worker.systemPrompt file exists if referenced
  if (config.worker?.systemPrompt) {
    const promptPath = resolve(clientsDir, config.worker.systemPrompt);
    if (!existsSync(promptPath)) {
      throw new Error(
        `System prompt file not found: ${promptPath} (referenced in worker.systemPrompt)`,
      );
    }
  }

  return config;
}
