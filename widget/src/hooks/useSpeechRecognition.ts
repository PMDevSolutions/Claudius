import { useCallback, useEffect, useRef, useState } from "react";

/** Why a dictation session failed, reduced to what the UI can act on. */
export type SpeechRecognitionErrorKind =
  | "permission"
  | "no-speech"
  | "no-microphone"
  | "unavailable";

export interface UseSpeechRecognitionOptions {
  /** BCP-47 language tag for the recognizer. */
  lang: string;
  /** Live transcript of the current session: finalized text plus the interim guess. */
  onTranscript?: (transcript: string) => void;
  /** A session ended normally; receives its finalized text (possibly empty). */
  onEnd?: (transcript: string) => void;
  /** A session failed. `onEnd` is not called for it. */
  onError?: (kind: SpeechRecognitionErrorKind) => void;
}

export interface UseSpeechRecognitionResult {
  /** False where the browser has no `SpeechRecognition`; every method is then a no-op. */
  isSupported: boolean;
  isListening: boolean;
  /** True while the engine reports hearing speech. Drives the level indicator. */
  isSpeechDetected: boolean;
  /**
   * Open a session. Returns whether one actually began: `false` when the
   * browser is unsupported, the engine refused, or a previous session is still
   * winding down.
   */
  start: () => boolean;
  /**
   * Finish the session and keep what was heard. Returns whether there was a
   * session to stop.
   */
  stop: () => boolean;
  /** Drop the session; nothing more is reported for it. */
  abort: () => void;
}

// TypeScript's DOM lib does not describe SpeechRecognition (it types the
// synthesis half only), so declare the slice of the API this hook touches.
interface RecognitionResultLike {
  isFinal: boolean;
  [index: number]: { transcript: string };
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult:
    | ((event: { results: ArrayLike<RecognitionResultLike> }) => void)
    | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionConstructor = new () => RecognitionLike;

/** The browser's recognizer: unprefixed from Chrome 139, `webkit` elsewhere. */
function getSpeechRecognition(): RecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

function toErrorKind(code: string): SpeechRecognitionErrorKind {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "permission";
    case "no-speech":
      return "no-speech";
    case "audio-capture":
      return "no-microphone";
    default:
      return "unavailable";
  }
}

/**
 * Dictation through the browser's `SpeechRecognition`. One session at a time,
 * each on a fresh recognizer: a single utterance with interim results, which
 * is what a chat message needs and sidesteps the duplicated results that
 * continuous mode produces on Chrome for Android and Safari.
 */
export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions,
): UseSpeechRecognitionResult {
  const [isSupported] = useState(() => getSpeechRecognition() !== undefined);
  const [isListening, setIsListening] = useState(false);
  const [isSpeechDetected, setIsSpeechDetected] = useState(false);

  const sessionRef = useRef<RecognitionLike | null>(null);
  // True once the engine has fired `start`, i.e. the mic is really open.
  const engineStartedRef = useRef(false);
  // Engine events arrive outside React's render cycle; read options from a
  // ref so they see the latest callbacks and language.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  // Cut a session loose: once detached, nothing it emits reaches us.
  const release = useCallback((session: RecognitionLike) => {
    session.onstart = null;
    session.onend = null;
    session.onerror = null;
    session.onresult = null;
    session.onspeechstart = null;
    session.onspeechend = null;
    if (sessionRef.current === session) sessionRef.current = null;
    setIsListening(false);
    setIsSpeechDetected(false);
  }, []);

  const abort = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    release(session);
    session.abort();
  }, [release]);

  const stop = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return false;
    // stop() on an engine still waiting for microphone permission would let
    // a later "Allow" open the mic with nobody at the button. Abort instead.
    if (!engineStartedRef.current) abort();
    else session.stop();
    return true;
  }, [abort]);

  const start = useCallback(() => {
    const Recognition = getSpeechRecognition();
    if (!Recognition || sessionRef.current) return false;

    const session = new Recognition();
    session.lang = optionsRef.current.lang;
    session.interimResults = true;
    session.continuous = false;

    let finalTranscript = "";

    // Some engines skip `start`; hearing anything proves the mic is open too.
    const markStarted = () => {
      engineStartedRef.current = true;
    };
    session.onstart = markStarted;
    session.onspeechstart = () => {
      markStarted();
      setIsSpeechDetected(true);
    };
    session.onspeechend = () => setIsSpeechDetected(false);
    session.onresult = (event) => {
      let finals = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finals += result[0].transcript;
        else interim += result[0].transcript;
      }
      finalTranscript = finals;
      markStarted();
      setIsSpeechDetected(true);
      optionsRef.current.onTranscript?.(finals + interim);
    };
    session.onerror = (event) => {
      // Our own abort() detaches these handlers first, so an "aborted" that
      // arrives here came from the engine: another tab or widget took the
      // microphone. Nothing to tell the visitor, but it was not a normal end,
      // so onEnd (and any auto-submit hanging off it) must not run.
      if (event.error !== "aborted") {
        optionsRef.current.onError?.(toErrorKind(event.error));
      }
      // The spec promises an `end` after every error. Do not depend on it:
      // an engine that forgets would leave the UI listening forever.
      release(session);
      session.abort();
    };
    session.onend = () => {
      release(session);
      optionsRef.current.onEnd?.(finalTranscript);
    };

    sessionRef.current = session;
    engineStartedRef.current = false;
    setIsListening(true);

    try {
      session.start();
    } catch {
      release(session);
      optionsRef.current.onError?.("unavailable");
      return false;
    }
    return true;
  }, [release]);

  // Leaving the page or closing the chat must never leave the mic open.
  useEffect(() => abort, [abort]);

  return { isSupported, isListening, isSpeechDetected, start, stop, abort };
}
