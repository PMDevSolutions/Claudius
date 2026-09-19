/**
 * Test double for the browser's `SpeechRecognition`. jsdom ships no speech
 * engine, so tests install this and then play the engine's part by emitting
 * events. It never emits anything on its own: real engines deliver results and
 * `end` asynchronously, and tests should spell that ordering out.
 */
export interface FakeResult {
  transcript: string;
  isFinal: boolean;
}

export class FakeSpeechRecognition {
  /** Every instance constructed since the last install, oldest first. */
  static instances: FakeSpeechRecognition[] = [];
  /** When set, `start()` throws it (e.g. an `InvalidStateError`). */
  static startError: Error | null = null;

  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;

  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string; message: string }) => void) | null = null;
  onresult:
    | ((event: { resultIndex: number; results: unknown }) => void)
    | null = null;
  onspeechstart: (() => void) | null = null;
  onspeechend: (() => void) | null = null;

  startCalls = 0;
  stopCalls = 0;
  abortCalls = 0;

  constructor() {
    FakeSpeechRecognition.instances.push(this);
  }

  start(): void {
    if (FakeSpeechRecognition.startError)
      throw FakeSpeechRecognition.startError;
    this.startCalls += 1;
  }

  stop(): void {
    this.stopCalls += 1;
  }

  abort(): void {
    this.abortCalls += 1;
  }

  emitStart(): void {
    this.onstart?.();
  }

  emitSpeechStart(): void {
    this.onspeechstart?.();
  }

  emitSpeechEnd(): void {
    this.onspeechend?.();
  }

  /** Deliver the session's full result list, as the real `result` event does. */
  emitResult(results: FakeResult[]): void {
    const list = results.map((r) => ({
      isFinal: r.isFinal,
      length: 1,
      0: { transcript: r.transcript, confidence: 0.9 },
    }));
    this.onresult?.({ resultIndex: 0, results: list });
  }

  emitError(error: string): void {
    this.onerror?.({ error, message: "" });
  }

  emitEnd(): void {
    this.onend?.();
  }
}

type SpeechWindow = {
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
};

/**
 * Expose the fake on `window`, under the `webkit` prefix by default since
 * that is what Chrome (before 139) and Safari ship.
 */
export function installFakeSpeechRecognition(
  key: keyof SpeechWindow = "webkitSpeechRecognition",
): void {
  uninstallFakeSpeechRecognition();
  (window as unknown as SpeechWindow)[key] = FakeSpeechRecognition;
}

/** Remove the fake, leaving a browser with no speech recognition. */
export function uninstallFakeSpeechRecognition(): void {
  const w = window as unknown as SpeechWindow;
  delete w.SpeechRecognition;
  delete w.webkitSpeechRecognition;
  FakeSpeechRecognition.instances = [];
  FakeSpeechRecognition.startError = null;
}

/** The most recently constructed instance, i.e. the current session. */
export function latestRecognition(): FakeSpeechRecognition {
  const last = FakeSpeechRecognition.instances.at(-1);
  if (!last) throw new Error("No SpeechRecognition session was started");
  return last;
}
