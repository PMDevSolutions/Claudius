import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// --- Types ---

export interface WidgetAttachmentsConfig {
  maxSizeBytes?: number;
  maxCount?: number;
  allowedTypes?: string[];
}

export interface WidgetConfig {
  title?: string;
  subtitle?: string;
  welcomeMessage?: string;
  placeholder?: string;
  theme?: "light" | "dark" | "auto";
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  accentColor?: string;
  attachments?: boolean | WidgetAttachmentsConfig;
}

export interface WorkerAttachmentsConfig {
  enabled?: boolean;
  maxBytes?: number;
  maxCount?: number;
  maxRequestBytes?: number;
  allowedTypes?: string[];
  storage?: "passthrough" | "r2";
  retentionHours?: number;
  quotaIpBytesPerDay?: number;
  quotaTenantBytesPerDay?: number;
}

export interface WorkerConfig {
  model?: string;
  maxTokens?: number;
  rateLimitMinute?: number;
  rateLimitHour?: number;
  systemPrompt?: string;
  attachments?: WorkerAttachmentsConfig;
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
const VALID_STORAGE = ["passthrough", "r2"] as const;

function isPositiveInt(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function isNonNegativeInt(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isStringList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((v) => typeof v === "string" && v.trim() !== "")
  );
}

function validateAttachmentLimits(
  obj: Record<string, unknown>,
  prefix: string,
  errors: ValidationError[],
  fields: Record<string, "positive" | "nonNegative" | "types" | "boolean" | "storage">,
): void {
  for (const [key, kind] of Object.entries(fields)) {
    const value = obj[key];
    if (value === undefined) continue;
    const field = `${prefix}.${key}`;
    switch (kind) {
      case "positive":
        if (!isPositiveInt(value)) {
          errors.push({ field, message: `${field} must be a positive integer` });
        }
        break;
      case "nonNegative":
        if (!isNonNegativeInt(value)) {
          errors.push({ field, message: `${field} must be an integer >= 0 (0 disables)` });
        }
        break;
      case "types":
        if (!isStringList(value)) {
          errors.push({ field, message: `${field} must be a non-empty array of MIME types` });
        }
        break;
      case "boolean":
        if (typeof value !== "boolean") {
          errors.push({ field, message: `${field} must be a boolean` });
        }
        break;
      case "storage":
        if (!(VALID_STORAGE as readonly string[]).includes(value as string)) {
          errors.push({
            field,
            message: `${field} must be one of: ${VALID_STORAGE.join(", ")}`,
          });
        }
        break;
    }
  }
}

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

    if (widget.attachments !== undefined) {
      const att = widget.attachments;
      if (typeof att === "boolean") {
        // fine
      } else if (att && typeof att === "object" && !Array.isArray(att)) {
        validateAttachmentLimits(att as Record<string, unknown>, "widget.attachments", errors, {
          maxSizeBytes: "positive",
          maxCount: "positive",
          allowedTypes: "types",
        });
      } else {
        errors.push({
          field: "widget.attachments",
          message: "widget.attachments must be a boolean or an object",
        });
      }
    }
  }

  // worker (optional)
  if (config.worker !== undefined) {
    const worker = config.worker as Record<string, unknown>;

    if (worker.attachments !== undefined) {
      const att = worker.attachments;
      if (att && typeof att === "object" && !Array.isArray(att)) {
        validateAttachmentLimits(att as Record<string, unknown>, "worker.attachments", errors, {
          enabled: "boolean",
          maxBytes: "positive",
          maxCount: "positive",
          maxRequestBytes: "positive",
          allowedTypes: "types",
          storage: "storage",
          retentionHours: "positive",
          quotaIpBytesPerDay: "nonNegative",
          quotaTenantBytesPerDay: "nonNegative",
        });
      } else {
        errors.push({
          field: "worker.attachments",
          message: "worker.attachments must be an object",
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
