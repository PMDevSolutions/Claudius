import type { LocaleCode } from "../locales";

/**
 * How the mic button records: `"toggle"` starts on one click and stops on the
 * next; `"hold"` records only while the button is held down.
 */
export type VoiceInputMode = "toggle" | "hold";

/**
 * Voice features. Pass to {@link ChatWidget} via the `voice` prop (or `true`
 * for the defaults). Both halves rely on the browser's Web Speech API and
 * render nothing where it is missing.
 */
export interface VoiceOptions {
  /**
   * Show the mic button for dictating messages.
   * @defaultValue `true`
   */
  input?: boolean;
  /**
   * Show the read-aloud control on completed assistant messages.
   * @defaultValue `true`
   */
  output?: boolean;
  /**
   * How the mic button records.
   * @defaultValue `"toggle"`
   */
  mode?: VoiceInputMode;
  /**
   * Send the dictated message as soon as recognition ends.
   * @defaultValue `false`
   */
  autoSubmit?: boolean;
  /**
   * BCP-47 language tag for recognition and playback (e.g. `"en-GB"`).
   * Defaults to a tag derived from the widget locale.
   */
  lang?: string;
}

/** {@link VoiceOptions} with every field filled in. */
export type ResolvedVoiceConfig = Required<VoiceOptions>;

/** Speech language used for each built-in locale when no region is known. */
const DEFAULT_SPEECH_LANG: Record<LocaleCode, string> = {
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
};

const VOICE_INPUT_MODES: readonly VoiceInputMode[] = ["toggle", "hold"];

/** `tag` when it names a region of `locale` (e.g. `en-GB` for `en`). */
function regionalTag(
  tag: string | undefined | null,
  locale: LocaleCode,
): string | undefined {
  if (!tag || !tag.includes("-")) return undefined;
  return tag.toLowerCase().split("-")[0] === locale ? tag : undefined;
}

/**
 * BCP-47 tag handed to the speech engines. An explicit `override` wins; then
 * the page's `<html lang>` and the browser language, when they name a region
 * of the widget locale (so a `en-GB` page gets British recognition); then a
 * per-locale default. Mirrors the precedence of {@link detectLocale}.
 */
export function resolveSpeechLang(
  locale: LocaleCode,
  override?: string,
): string {
  const explicit = override?.trim();
  if (explicit) return explicit;

  const fromHtml =
    typeof document !== "undefined"
      ? regionalTag(document.documentElement.lang, locale)
      : undefined;
  if (fromHtml) return fromHtml;

  const fromNavigator =
    typeof navigator !== "undefined"
      ? regionalTag(navigator.language, locale)
      : undefined;
  if (fromNavigator) return fromNavigator;

  return DEFAULT_SPEECH_LANG[locale];
}

/**
 * Turn the `voice` prop into a full config, or `null` when voice is disabled
 * (`false` / `undefined`, or both halves switched off).
 */
export function resolveVoiceConfig(
  input: boolean | VoiceOptions | undefined | null,
  locale: LocaleCode,
): ResolvedVoiceConfig | null {
  // Fail closed: this switches a microphone on. Only `true` or an options
  // object enables it, so a stray truthy value such as the string "false"
  // from a template cannot.
  const isOptions =
    typeof input === "object" && input !== null && !Array.isArray(input);
  if (input !== true && !isOptions) return null;
  const options = input === true ? {} : input;
  const config: ResolvedVoiceConfig = {
    input: options.input ?? true,
    output: options.output ?? true,
    // `mode` can arrive from an HTML attribute, so tolerate junk.
    mode: VOICE_INPUT_MODES.includes(options.mode as VoiceInputMode)
      ? (options.mode as VoiceInputMode)
      : "toggle",
    autoSubmit: options.autoSubmit ?? false,
    lang: resolveSpeechLang(locale, options.lang),
  };
  return config.input || config.output ? config : null;
}

/**
 * Build the `voice` option from `<claudius-chat>` attributes: `voice` switches
 * it on (`voice="false"` off), and `voice-mode`, `voice-auto-submit`,
 * `voice-input`, `voice-output`, and `voice-lang` tune it. Boolean attributes
 * follow the element's existing convention: present means on unless the value
 * is `"false"`.
 */
export function voiceOptionsFromAttributes(
  getAttribute: (name: string) => string | null,
): boolean | VoiceOptions | undefined {
  const voice = getAttribute("voice");
  if (voice === null) return undefined;
  if (voice === "false") return false;

  const options: VoiceOptions = {};
  const flag = (name: string) => {
    const value = getAttribute(name);
    return value === null ? undefined : value !== "false";
  };

  const mode = getAttribute("voice-mode");
  if (mode !== null) options.mode = mode as VoiceInputMode;
  const autoSubmit = flag("voice-auto-submit");
  if (autoSubmit !== undefined) options.autoSubmit = autoSubmit;
  const input = flag("voice-input");
  if (input !== undefined) options.input = input;
  const output = flag("voice-output");
  if (output !== undefined) options.output = output;
  const lang = getAttribute("voice-lang");
  if (lang !== null) options.lang = lang;

  return Object.keys(options).length > 0 ? options : true;
}

/**
 * Text for the message field while dictating: what was typed before the
 * session (`base`) followed by what has been heard so far, clipped to
 * `maxLength`. `base` is returned untouched until speech arrives.
 */
export function joinDictation(
  base: string,
  transcript: string,
  maxLength: number,
): string {
  const heard = transcript.trim();
  if (!heard) return base;
  const typed = base.trimEnd();
  return (typed ? `${typed} ${heard}` : heard).slice(0, maxLength);
}

/**
 * Split at newlines, after `.` `!` `?` when whitespace follows (so the dot in
 * "example.com" or "$9.99" is not a break), and after the full-width marks
 * Chinese and Japanese use, which have no space after them.
 */
function splitSentences(text: string): string[] {
  const pieces: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const endsSentence =
      ch === "\n" ||
      ch === "。" ||
      ch === "！" ||
      ch === "？" ||
      ((ch === "." || ch === "!" || ch === "?") &&
        (i + 1 === text.length || /\s/.test(text[i + 1])));
    if (endsSentence) {
      pieces.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length) pieces.push(text.slice(start));
  return pieces;
}

/**
 * Break text into utterance-sized chunks for `speechSynthesis`. Chrome stops
 * a long utterance after roughly 15 seconds when a network voice is in use,
 * so text is queued as several short utterances instead: whole sentences
 * packed up to `maxLength`, an over-long sentence split between words, and a
 * single over-long token cut as a last resort. The default is about ten
 * seconds of speech, leaving room for numbers, which take far longer to say
 * than to write.
 */
export function chunkSpeechText(text: string, maxLength = 150): string[] {
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    const chunk = current.trim();
    if (chunk) chunks.push(chunk);
    current = "";
  };

  for (const piece of splitSentences(text)) {
    if ((current + piece).trim().length <= maxLength) {
      current += piece;
      continue;
    }
    flush();
    if (piece.trim().length <= maxLength) {
      current = piece;
      continue;
    }
    for (let word of piece.trim().split(/\s+/)) {
      if (current && `${current} ${word}`.length > maxLength) flush();
      // Not a word in a spaced script, but an ordinary unpunctuated sentence
      // in Chinese or Japanese. Left whole it would hit the cutoff.
      while (word.length > maxLength) {
        chunks.push(word.slice(0, maxLength));
        word = word.slice(maxLength);
      }
      current = current ? `${current} ${word}` : word;
    }
  }
  flush();

  return chunks;
}
