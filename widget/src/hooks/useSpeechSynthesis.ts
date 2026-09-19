import { useCallback, useEffect, useRef, useState } from "react";
import { chunkSpeechText } from "../utils/voice";

export interface UseSpeechSynthesisResult {
  /** False where the browser has no `speechSynthesis`; every method is then a no-op. */
  isSupported: boolean;
  /** Id of the message being read (speaking or paused), else `null`. */
  activeId: string | null;
  isPaused: boolean;
  /** Read `text` aloud as message `id`, replacing whatever is playing. */
  speak: (id: string, text: string) => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
}

function getSpeechSynthesis(): SpeechSynthesis | undefined {
  if (typeof window === "undefined") return undefined;
  if (typeof window.SpeechSynthesisUtterance === "undefined") return undefined;
  return window.speechSynthesis ?? undefined;
}

/**
 * Reads one message at a time through the browser's `speechSynthesis`. The
 * voice is left to the browser, which picks one for `lang`. Text is queued as
 * several short utterances rather than one long one; see
 * {@link chunkSpeechText}.
 */
export function useSpeechSynthesis(lang: string): UseSpeechSynthesisResult {
  const [isSupported] = useState(() => getSpeechSynthesis() !== undefined);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  // Bumped whenever playback is replaced or cancelled. Browsers fire `error`
  // on cancelled utterances late and asynchronously; a stale run number lets
  // those events be told apart from the current playback's.
  const runRef = useRef(0);
  const pauseRequestedRef = useRef(false);
  // Safari garbage-collects queued utterances, and with them their `end`
  // events, unless something holds on to them.
  const utterancesRef = useRef<SpeechSynthesisUtterance[]>([]);

  // Forget the current playback without touching the engine.
  const reset = useCallback(() => {
    runRef.current += 1;
    pauseRequestedRef.current = false;
    utterancesRef.current = [];
    setActiveId(null);
    setIsPaused(false);
  }, []);

  const cancel = useCallback(() => {
    reset();
    getSpeechSynthesis()?.cancel();
  }, [reset]);

  const speak = useCallback(
    (id: string, text: string) => {
      const synth = getSpeechSynthesis();
      if (!synth) return;
      reset();
      // Clear whatever is playing, including a queue Chrome left stuck after
      // an earlier cutoff. An idle engine is left alone: in some browsers a
      // cancel() immediately before speak() swallows the new utterance.
      if (synth.speaking || synth.pending) synth.cancel();

      const chunks = chunkSpeechText(text);
      if (chunks.length === 0) return;

      const run = runRef.current;
      const isCurrent = () => runRef.current === run;

      utterancesRef.current = chunks.map((chunk, index) => {
        const utterance = new SpeechSynthesisUtterance(chunk);
        utterance.lang = lang;
        utterance.onerror = () => {
          if (isCurrent()) cancel();
        };
        utterance.onend = () => {
          if (!isCurrent()) return;
          // On Android pause() ends the utterance instead of pausing it. Left
          // alone, the next chunk would start playing after a "pause".
          if (pauseRequestedRef.current && !synth.paused) cancel();
          else if (index === chunks.length - 1) reset();
        };
        return utterance;
      });

      setActiveId(id);
      for (const utterance of utterancesRef.current) synth.speak(utterance);
    },
    [lang, cancel, reset],
  );

  const pause = useCallback(() => {
    const synth = getSpeechSynthesis();
    if (!synth) return;
    pauseRequestedRef.current = true;
    synth.pause();
    setIsPaused(synth.paused);
  }, []);

  const resume = useCallback(() => {
    const synth = getSpeechSynthesis();
    if (!synth) return;
    pauseRequestedRef.current = false;
    synth.resume();
    setIsPaused(false);
  }, []);

  // Closing the chat must stop the voice.
  useEffect(() => cancel, [cancel]);

  return { isSupported, activeId, isPaused, speak, pause, resume, cancel };
}
