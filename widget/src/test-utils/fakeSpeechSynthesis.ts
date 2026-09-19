/**
 * Test doubles for `window.speechSynthesis` and `SpeechSynthesisUtterance`,
 * neither of which jsdom implements. The fake keeps the real queue semantics
 * (`speak` appends, `cancel` empties, the head of the queue is the utterance
 * being spoken) and leaves all timing to the test, which plays the engine by
 * calling `finishCurrent()` / `failCurrent()`.
 */
type UtteranceHandler = ((event: { error?: string }) => void) | null;

export class FakeSpeechSynthesisUtterance {
  text: string;
  lang = "";
  voice: SpeechSynthesisVoice | null = null;
  volume = 1;
  rate = 1;
  pitch = 1;

  onstart: UtteranceHandler = null;
  onend: UtteranceHandler = null;
  onerror: UtteranceHandler = null;
  onpause: UtteranceHandler = null;
  onresume: UtteranceHandler = null;
  onmark: UtteranceHandler = null;
  onboundary: UtteranceHandler = null;

  constructor(text = "") {
    this.text = text;
  }
}

export class FakeSpeechSynthesis {
  speaking = false;
  pending = false;
  paused = false;

  /** Utterances not yet finished or cancelled; `queue[0]` is being spoken. */
  queue: FakeSpeechSynthesisUtterance[] = [];
  cancelCalls = 0;
  /**
   * How `pause()` behaves, which differs by browser:
   * - `"async"` (the default; Chrome and Safari): nothing changes until the
   *   engine confirms. The test plays the engine with `confirmPause()`, which
   *   sets `paused` and fires the utterance's `pause` event.
   * - `"sync"` (Firefox): `paused` is set immediately.
   * - `"end-utterance"` / `"error-utterance"` (Android): `pause()` ends the
   *   current utterance instead, by `end` or by `error`, and never sets
   *   `paused`.
   */
  pauseBehavior: "async" | "sync" | "end-utterance" | "error-utterance" =
    "async";

  private cancelled: FakeSpeechSynthesisUtterance[] = [];

  speak(utterance: FakeSpeechSynthesisUtterance): void {
    this.queue.push(utterance);
    this.sync();
  }

  /** Per the spec, cancelling does not change the paused state. */
  cancel(): void {
    this.cancelCalls += 1;
    this.cancelled.push(...this.queue);
    this.queue = [];
    this.sync();
  }

  pause(): void {
    switch (this.pauseBehavior) {
      case "end-utterance":
        this.finishCurrent();
        return;
      case "error-utterance":
        this.failCurrent("interrupted");
        return;
      case "sync":
        this.confirmPause();
        return;
      case "async":
        return;
    }
  }

  /** The engine reports that the current utterance is now paused. */
  confirmPause(): void {
    this.paused = true;
    this.queue[0]?.onpause?.({});
  }

  resume(): void {
    this.paused = false;
    this.queue[0]?.onresume?.({});
  }

  getVoices(): SpeechSynthesisVoice[] {
    return [];
  }

  /** The engine finished the utterance at the head of the queue. */
  finishCurrent(): void {
    const utterance = this.queue.shift();
    this.sync();
    utterance?.onend?.({});
  }

  /** The engine failed on the utterance at the head of the queue. */
  failCurrent(error = "synthesis-failed"): void {
    const utterance = this.queue.shift();
    this.sync();
    utterance?.onerror?.({ error });
  }

  /**
   * Deliver the `error` events real browsers fire, late and asynchronously,
   * on utterances that `cancel()` dropped.
   */
  flushCancelled(): void {
    const dropped = this.cancelled;
    this.cancelled = [];
    for (const utterance of dropped)
      utterance.onerror?.({ error: "interrupted" });
  }

  /** Text of each queued utterance, in order. */
  queuedText(): string[] {
    return this.queue.map((u) => u.text);
  }

  private sync(): void {
    this.speaking = this.queue.length > 0;
    this.pending = this.queue.length > 1;
  }
}

type SynthesisWindow = {
  speechSynthesis?: unknown;
  SpeechSynthesisUtterance?: unknown;
};

/** Install the fakes on `window` and return the synthesizer to drive. */
export function installFakeSpeechSynthesis(): FakeSpeechSynthesis {
  const synth = new FakeSpeechSynthesis();
  const w = window as unknown as SynthesisWindow;
  w.speechSynthesis = synth;
  w.SpeechSynthesisUtterance = FakeSpeechSynthesisUtterance;
  return synth;
}

/** Remove the fakes, leaving a browser with no speech synthesis. */
export function uninstallFakeSpeechSynthesis(): void {
  const w = window as unknown as SynthesisWindow;
  delete w.speechSynthesis;
  delete w.SpeechSynthesisUtterance;
}
