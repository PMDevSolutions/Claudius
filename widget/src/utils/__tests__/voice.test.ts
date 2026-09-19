import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveVoiceConfig,
  resolveSpeechLang,
  joinDictation,
  chunkSpeechText,
  voiceOptionsFromAttributes,
} from "../voice";

function setHtmlLang(lang: string) {
  document.documentElement.lang = lang;
}

function setNavigatorLanguage(lang: string | undefined) {
  Object.defineProperty(window.navigator, "language", {
    value: lang,
    configurable: true,
  });
}

beforeEach(() => {
  setHtmlLang("");
  setNavigatorLanguage(undefined);
});

describe("resolveSpeechLang", () => {
  it("defaults to en-US when nothing else is known", () => {
    expect(resolveSpeechLang("en")).toBe("en-US");
  });

  it("maps each built-in locale to a region-qualified default", () => {
    expect(resolveSpeechLang("es")).toBe("es-ES");
    expect(resolveSpeechLang("fr")).toBe("fr-FR");
    expect(resolveSpeechLang("de")).toBe("de-DE");
  });

  it("uses an explicit override verbatim, trimmed", () => {
    expect(resolveSpeechLang("en", "  pt-BR ")).toBe("pt-BR");
  });

  it("ignores a blank override", () => {
    expect(resolveSpeechLang("fr", "   ")).toBe("fr-FR");
  });

  it("adopts the page's region when <html lang> matches the widget locale", () => {
    setHtmlLang("en-GB");
    expect(resolveSpeechLang("en")).toBe("en-GB");
  });

  it("adopts the browser's region when <html lang> carries none", () => {
    setHtmlLang("en");
    setNavigatorLanguage("en-AU");
    expect(resolveSpeechLang("en")).toBe("en-AU");
  });

  it("prefers <html lang> over the browser language", () => {
    setHtmlLang("en-GB");
    setNavigatorLanguage("en-AU");
    expect(resolveSpeechLang("en")).toBe("en-GB");
  });

  it("ignores page and browser tags in a different language than the widget", () => {
    setHtmlLang("fr-CA");
    setNavigatorLanguage("en-US");
    expect(resolveSpeechLang("es")).toBe("es-ES");
  });
});

describe("resolveVoiceConfig", () => {
  it("is disabled for false, undefined, and null", () => {
    expect(resolveVoiceConfig(false, "en")).toBeNull();
    expect(resolveVoiceConfig(undefined, "en")).toBeNull();
    expect(resolveVoiceConfig(null, "en")).toBeNull();
  });

  it("enables both halves in toggle mode without auto-submit for `true`", () => {
    expect(resolveVoiceConfig(true, "en")).toEqual({
      input: true,
      output: true,
      mode: "toggle",
      autoSubmit: false,
      lang: "en-US",
    });
  });

  it("fills unspecified options with defaults", () => {
    expect(
      resolveVoiceConfig({ mode: "hold", autoSubmit: true }, "de"),
    ).toEqual({
      input: true,
      output: true,
      mode: "hold",
      autoSubmit: true,
      lang: "de-DE",
    });
  });

  it("lets the speaker be switched off on its own", () => {
    expect(resolveVoiceConfig({ output: false }, "en")).toMatchObject({
      input: true,
      output: false,
    });
  });

  it("is disabled when both halves are switched off", () => {
    expect(
      resolveVoiceConfig({ input: false, output: false }, "en"),
    ).toBeNull();
  });

  it("falls back to toggle mode for an unknown mode", () => {
    expect(resolveVoiceConfig({ mode: "shout" as never }, "en")).toMatchObject({
      mode: "toggle",
    });
  });

  it("passes a lang override through", () => {
    expect(resolveVoiceConfig({ lang: "es-MX" }, "es")).toMatchObject({
      lang: "es-MX",
    });
  });
});

describe("joinDictation", () => {
  it("returns the transcript alone when nothing was typed", () => {
    expect(joinDictation("", "hello there", 2000)).toBe("hello there");
  });

  it("appends to typed text with a single space", () => {
    expect(joinDictation("Hi team", "how are you", 2000)).toBe(
      "Hi team how are you",
    );
  });

  it("does not double up whitespace at the seam", () => {
    expect(joinDictation("Hi team ", "  how are you ", 2000)).toBe(
      "Hi team how are you",
    );
  });

  it("leaves typed text untouched while no speech has arrived", () => {
    expect(joinDictation("Hi team ", "", 2000)).toBe("Hi team ");
  });

  it("clips the result to the message length limit", () => {
    expect(joinDictation("abc", "defgh", 6)).toBe("abc de");
  });
});

describe("chunkSpeechText", () => {
  it("returns nothing for empty or whitespace-only text", () => {
    expect(chunkSpeechText("")).toEqual([]);
    expect(chunkSpeechText("  \n  ")).toEqual([]);
  });

  it("keeps short text as a single chunk", () => {
    expect(chunkSpeechText("Hello there.")).toEqual(["Hello there."]);
  });

  it("breaks at sentence boundaries once a chunk would exceed the limit", () => {
    expect(chunkSpeechText("One two three. Four five six. Seven.", 20)).toEqual(
      ["One two three.", "Four five six.", "Seven."],
    );
  });

  it("packs as many whole sentences into a chunk as fit", () => {
    expect(chunkSpeechText("One two three. Four five six. Seven.", 25)).toEqual(
      ["One two three.", "Four five six. Seven."],
    );
  });

  it("splits a single over-long sentence at word boundaries", () => {
    expect(chunkSpeechText("alpha beta gamma delta", 10)).toEqual([
      "alpha beta",
      "gamma",
      "delta",
    ]);
  });

  it("never splits inside a word, even one longer than the limit", () => {
    expect(chunkSpeechText("abcdefghij", 5)).toEqual(["abcdefghij"]);
  });

  it("does not treat a dot inside a word as a sentence end", () => {
    expect(chunkSpeechText("Go to example.com now. Bye.", 15)).toEqual([
      "Go to",
      "example.com",
      "now. Bye.",
    ]);
  });

  it("treats a newline as a boundary and keeps it inside a chunk for pacing", () => {
    expect(chunkSpeechText("Line one\nLine two")).toEqual([
      "Line one\nLine two",
    ]);
    expect(chunkSpeechText("Line one\nLine two", 10)).toEqual([
      "Line one",
      "Line two",
    ]);
  });

  it("keeps every chunk short enough to dodge Chrome's long-utterance cutoff", () => {
    const sentence = "Alpha beta gamma delta epsilon zeta eta.";
    const text = Array(6).fill(sentence).join(" ");

    const chunks = chunkSpeechText(text);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(200);
    expect(chunks.join(" ")).toBe(text);
  });
});

describe("voiceOptionsFromAttributes", () => {
  const read = (attrs: Record<string, string>) =>
    voiceOptionsFromAttributes((name) => attrs[name] ?? null);

  it("is undefined when the element has no voice attribute", () => {
    expect(read({ "voice-mode": "hold" })).toBeUndefined();
  });

  it("enables the defaults for a bare or true voice attribute", () => {
    expect(read({ voice: "" })).toBe(true);
    expect(read({ voice: "true" })).toBe(true);
  });

  it('disables voice for voice="false", whatever else is set', () => {
    expect(read({ voice: "false", "voice-mode": "hold" })).toBe(false);
  });

  it("reads the mode, auto-submit, and language", () => {
    expect(
      read({
        voice: "",
        "voice-mode": "hold",
        "voice-auto-submit": "",
        "voice-lang": "en-GB",
      }),
    ).toEqual({ mode: "hold", autoSubmit: true, lang: "en-GB" });
  });

  it('treats a boolean attribute set to "false" as off', () => {
    expect(read({ voice: "", "voice-auto-submit": "false" })).toEqual({
      autoSubmit: false,
    });
  });

  it("lets either half be switched off", () => {
    expect(read({ voice: "", "voice-input": "false" })).toEqual({
      input: false,
    });
    expect(read({ voice: "", "voice-output": "false" })).toEqual({
      output: false,
    });
  });
});
