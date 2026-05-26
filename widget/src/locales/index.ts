import type { ClaudiusTranslations } from "../i18n";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { de } from "./de";

export type LocaleCode = "en" | "es" | "fr" | "de";

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

export interface ResolveTranslationsOptions {
  locale?: LocaleCode;
  translations?: Partial<ClaudiusTranslations>;
}

export function resolveTranslations(
  options: ResolveTranslationsOptions = {},
): ClaudiusTranslations {
  const { locale, translations } = options;
  const base = locales[locale ?? detectLocale()];
  return translations ? { ...base, ...translations } : { ...base };
}
