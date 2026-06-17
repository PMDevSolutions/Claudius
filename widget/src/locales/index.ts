import type { ClaudiusTranslations } from "../i18n";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { de } from "./de";

/** BCP-47 primary language subtags the widget ships built-in translations for. */
export type LocaleCode = "en" | "es" | "fr" | "de";

/** Built-in translations keyed by {@link LocaleCode}. */
export const locales: Record<LocaleCode, ClaudiusTranslations> = {
  en,
  es,
  fr,
  de,
};

function normalize(tag: string | undefined | null): LocaleCode | undefined {
  if (!tag) return undefined;
  const primary = tag.toLowerCase().split("-")[0];
  return Object.prototype.hasOwnProperty.call(locales, primary)
    ? (primary as LocaleCode)
    : undefined;
}

/**
 * Detect the best {@link LocaleCode} for the current environment: the document
 * `lang` attribute first, then the browser language, falling back to `"en"`.
 *
 * @returns The detected locale code.
 */
export function detectLocale(): LocaleCode {
  const fromHtml =
    typeof document !== "undefined"
      ? normalize(document.documentElement.lang)
      : undefined;
  if (fromHtml) return fromHtml;

  const fromNavigator =
    typeof navigator !== "undefined"
      ? normalize(navigator.language)
      : undefined;
  if (fromNavigator) return fromNavigator;

  return "en";
}

/** Options for {@link resolveTranslations}. */
export interface ResolveTranslationsOptions {
  /** Locale to use. Defaults to the result of {@link detectLocale}. */
  locale?: LocaleCode;
  /** Per-string overrides layered over the chosen locale's translations. */
  translations?: Partial<ClaudiusTranslations>;
}

/**
 * Resolve the final translations for a locale, applying any per-string
 * overrides on top of the chosen locale's defaults.
 *
 * @param options - Locale and override settings.
 * @returns A complete translations object.
 */
export function resolveTranslations(
  options: ResolveTranslationsOptions = {},
): ClaudiusTranslations {
  const { locale, translations } = options;
  const base = locales[locale ?? detectLocale()];
  return translations ? { ...base, ...translations } : { ...base };
}
