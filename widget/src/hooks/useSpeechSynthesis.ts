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

  // `speechSynthesis` is one global, shared with the host page and with any
  // other widget on it. Only ever cancel speech this reader started: a reader
  // that never spoke (voice switched off, say) must not silence the page when
  // the chat closes.
  const cancel = useCallback(() => {
    const ownsPlayback = utterancesRef.current.length > 0;
    reset();
    const synth = getSpeechSynthesis();
    if (!ownsPlayback || !synth) return;
    synth.cancel();
    // Per the spec cancel() leaves a paused engine paused, and the next reply
    // would then queue in silence.
    if (synth.paused) synth.resume();
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
      if (synth.paused) synth.resume();

      const chunks = chunkSpeechText(text);
      if (chunks.length === 0) return;

      const run = runRef.current;
      const isCurrent = () => runRef.current === run;

      utterancesRef.current = chunks.map((chunk, index) => {
        const utterance = new SpeechSynthesisUtterance(chunk);
        utterance.lang = lang;
        utterance.onerror = (event) => {
          if (!isCurrent()) return;
          // "interrupted" / "canceled" with no pause of ours pending means
          // someone else cancelled the engine: another widget, or the host
          // page. The queue is theirs now, so forget ours and leave the engine
          // alone. Cancelling again here would kill their speech.
          const takenOver =
            (event.error === "interrupted" || event.error === "canceled") &&
            !pauseRequestedRef.current;
          if (takenOver) reset();
          else cancel();
        };
        utterance.onpause = () => {
          if (isCurrent()) setIsPaused(true);
        };
        utterance.onresume = () => {
          if (isCurrent()) setIsPaused(false);
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
    // Firefox flips `paused` synchronously. Chrome and Safari flip it only
    // once the engine confirms, which arrives as the utterance's `pause`
    // event, handled above.
    if (synth.paused) setIsPaused(true);
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
