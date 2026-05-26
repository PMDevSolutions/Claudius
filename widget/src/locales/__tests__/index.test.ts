import { describe, it, expect, beforeEach } from "vitest";
import { detectLocale, resolveTranslations, locales } from "../index";
import { en } from "../en";
import { es } from "../es";

function setHtmlLang(lang: string) {
  document.documentElement.lang = lang;
}

function setNavigatorLanguage(lang: string | undefined) {
  Object.defineProperty(window.navigator, "language", {
    value: lang,
    configurable: true,
  });
}

describe("detectLocale", () => {
  beforeEach(() => {
    setHtmlLang("");
    setNavigatorLanguage("en-US");
  });

  it("uses <html lang> when it names a known locale", () => {
    setHtmlLang("es");
    expect(detectLocale()).toBe("es");
  });

  it("normalizes a region subtag from <html lang>", () => {
    setHtmlLang("fr-CA");
    expect(detectLocale()).toBe("fr");
  });

  it("falls back to navigator.language when <html lang> is empty", () => {
    setHtmlLang("");
    setNavigatorLanguage("de-DE");
    expect(detectLocale()).toBe("de");
  });

  it("prefers <html lang> over navigator.language", () => {
    setHtmlLang("es");
    setNavigatorLanguage("de-DE");
    expect(detectLocale()).toBe("es");
  });

  it("returns 'en' when neither names a known locale", () => {
    setHtmlLang("ja");
    setNavigatorLanguage("zh-CN");
    expect(detectLocale()).toBe("en");
  });

  it("returns 'en' when navigator.language is unavailable", () => {
    setHtmlLang("");
    setNavigatorLanguage(undefined);
    expect(detectLocale()).toBe("en");
  });
});

describe("resolveTranslations", () => {
  beforeEach(() => {
    setHtmlLang("");
    setNavigatorLanguage("en-US");
  });

  it("returns the full translation set for an explicit locale", () => {
    expect(resolveTranslations({ locale: "es" })).toEqual(es);
  });

  it("auto-detects the locale when none is given", () => {
    setHtmlLang("de");
    expect(resolveTranslations()).toEqual(locales.de);
  });

  it("layers partial overrides on top of the resolved locale", () => {
    const result = resolveTranslations({
      locale: "fr",
      translations: { title: "Assistance" },
    });
    expect(result.title).toBe("Assistance");
    expect(result.sendMessage).toBe(locales.fr.sendMessage);
  });

  it("defaults to English when detection finds nothing known", () => {
    setHtmlLang("ja");
    setNavigatorLanguage("ja-JP");
    expect(resolveTranslations()).toEqual(en);
  });
});
