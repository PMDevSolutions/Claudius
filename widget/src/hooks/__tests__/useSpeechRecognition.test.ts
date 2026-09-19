import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useSpeechRecognition } from "../useSpeechRecognition";
import {
  FakeSpeechRecognition,
  installFakeSpeechRecognition,
  uninstallFakeSpeechRecognition,
  latestRecognition,
} from "../../test-utils/fakeSpeechRecognition";

function setup(lang = "en-US") {
  const onTranscript = vi.fn();
  const onEnd = vi.fn();
  const onError = vi.fn();
  const view = renderHook(
    (props: { lang: string }) =>
      useSpeechRecognition({ lang: props.lang, onTranscript, onEnd, onError }),
    { initialProps: { lang } },
  );
  return { ...view, onTranscript, onEnd, onError };
}

describe("useSpeechRecognition", () => {
  beforeEach(() => installFakeSpeechRecognition());
  afterEach(() => uninstallFakeSpeechRecognition());

  describe("support detection", () => {
    it("is unsupported, and start() does nothing, without a SpeechRecognition constructor", () => {
      uninstallFakeSpeechRecognition();
      const { result } = setup();

      expect(result.current.isSupported).toBe(false);
      act(() => result.current.start());

      expect(result.current.isListening).toBe(false);
      expect(FakeSpeechRecognition.instances).toHaveLength(0);
    });

    it("detects the webkit-prefixed constructor", () => {
      const { result } = setup();
      expect(result.current.isSupported).toBe(true);
    });

    it("detects the unprefixed constructor", () => {
      installFakeSpeechRecognition("SpeechRecognition");
      const { result } = setup();
      expect(result.current.isSupported).toBe(true);
    });
  });

  describe("starting", () => {
    it("opens a single-utterance session with interim results in the requested language", () => {
      const { result } = setup("de-DE");

      act(() => result.current.start());

      const session = latestRecognition();
      expect(session.startCalls).toBe(1);
      expect(session.lang).toBe("de-DE");
      expect(session.interimResults).toBe(true);
      expect(session.continuous).toBe(false);
    });

    it("is listening as soon as start() is called, before the engine confirms", () => {
      const { result } = setup();
      act(() => result.current.start());
      expect(result.current.isListening).toBe(true);
    });

    it("ignores start() while a session is already open", () => {
      const { result } = setup();

      act(() => result.current.start());
      act(() => result.current.start());

      expect(FakeSpeechRecognition.instances).toHaveLength(1);
      expect(latestRecognition().startCalls).toBe(1);
    });

    it("reports unavailable and stops listening when the engine refuses to start", () => {
      FakeSpeechRecognition.startError = new Error("InvalidStateError");
      const { result, onError } = setup();

      act(() => result.current.start());

      expect(onError).toHaveBeenCalledExactlyOnceWith("unavailable");
      expect(result.current.isListening).toBe(false);
    });
  });

  describe("transcript", () => {
    it("reports finalized text followed by the in-flight interim guess", () => {
      const { result, onTranscript } = setup();
      act(() => result.current.start());

      act(() =>
        latestRecognition().emitResult([
          { transcript: "hello", isFinal: true },
          { transcript: " wor", isFinal: false },
        ]),
      );

      expect(onTranscript).toHaveBeenLastCalledWith("hello wor");
    });

    it("hands the finalized text to onEnd when the session ends", () => {
      const { result, onEnd } = setup();
      act(() => result.current.start());
      const session = latestRecognition();

      act(() =>
        session.emitResult([{ transcript: "hello wor", isFinal: false }]),
      );
      act(() =>
        session.emitResult([{ transcript: "hello world", isFinal: true }]),
      );
      act(() => session.emitEnd());

      expect(onEnd).toHaveBeenCalledExactlyOnceWith("hello world");
      expect(result.current.isListening).toBe(false);
    });

    it("leaves text that never finalized out of what onEnd receives", () => {
      const { result, onEnd } = setup();
      act(() => result.current.start());
      const session = latestRecognition();

      act(() => session.emitResult([{ transcript: "maybe", isFinal: false }]));
      act(() => session.emitEnd());

      expect(onEnd).toHaveBeenCalledExactlyOnceWith("");
    });

    it("starts each session with an empty transcript", () => {
      const { result, onEnd } = setup();
      act(() => result.current.start());
      act(() =>
        latestRecognition().emitResult([
          { transcript: "first", isFinal: true },
        ]),
      );
      act(() => latestRecognition().emitEnd());

      act(() => result.current.start());
      act(() => latestRecognition().emitEnd());

      expect(FakeSpeechRecognition.instances).toHaveLength(2);
      expect(onEnd).toHaveBeenLastCalledWith("");
    });

    it("calls the callbacks from the latest render, not the ones captured at start", () => {
      const first = vi.fn();
      const second = vi.fn();
      const { result, rerender } = renderHook(
        (props: { onTranscript: (t: string) => void }) =>
          useSpeechRecognition({ lang: "en-US", ...props }),
        { initialProps: { onTranscript: first } },
      );
      act(() => result.current.start());

      rerender({ onTranscript: second });
      act(() =>
        latestRecognition().emitResult([{ transcript: "hi", isFinal: false }]),
      );

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledExactlyOnceWith("hi");
    });
  });

  describe("speech activity", () => {
    it("is detected between the engine's speechstart and speechend", () => {
      const { result } = setup();
      act(() => result.current.start());
      expect(result.current.isSpeechDetected).toBe(false);

      act(() => latestRecognition().emitSpeechStart());
      expect(result.current.isSpeechDetected).toBe(true);

      act(() => latestRecognition().emitSpeechEnd());
      expect(result.current.isSpeechDetected).toBe(false);
    });

    it("is inferred from an arriving result, for engines that skip speechstart", () => {
      const { result } = setup();
      act(() => result.current.start());

      act(() =>
        latestRecognition().emitResult([{ transcript: "hi", isFinal: false }]),
      );

      expect(result.current.isSpeechDetected).toBe(true);
    });

    it("clears when the session ends", () => {
      const { result } = setup();
      act(() => result.current.start());
      act(() => latestRecognition().emitSpeechStart());

      act(() => latestRecognition().emitEnd());

      expect(result.current.isSpeechDetected).toBe(false);
    });
  });

  describe("stopping", () => {
    it("asks a running engine to finish, and keeps listening until it has", () => {
      const { result, onEnd } = setup();
      act(() => result.current.start());
      const session = latestRecognition();
      act(() => session.emitStart());

      act(() => result.current.stop());

      expect(session.stopCalls).toBe(1);
      expect(session.abortCalls).toBe(0);
      expect(result.current.isListening).toBe(true);

      act(() => session.emitResult([{ transcript: "done", isFinal: true }]));
      act(() => session.emitEnd());
      expect(onEnd).toHaveBeenCalledExactlyOnceWith("done");
      expect(result.current.isListening).toBe(false);
    });

    it("aborts instead when the engine has not started yet, so a late permission grant cannot open the mic", () => {
      const { result } = setup();
      act(() => result.current.start());
      const session = latestRecognition();

      act(() => result.current.stop());

      expect(session.abortCalls).toBe(1);
      expect(session.stopCalls).toBe(0);
      expect(result.current.isListening).toBe(false);
    });
  });

  describe("aborting", () => {
    it("stops listening at once and silences everything the old session still emits", () => {
      const { result, onTranscript, onEnd, onError } = setup();
      act(() => result.current.start());
      const session = latestRecognition();
      act(() => session.emitStart());

      act(() => result.current.abort());

      expect(session.abortCalls).toBe(1);
      expect(result.current.isListening).toBe(false);

      act(() => {
        session.emitResult([{ transcript: "late", isFinal: true }]);
        session.emitError("aborted");
        session.emitEnd();
      });
      expect(onTranscript).not.toHaveBeenCalled();
      expect(onEnd).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });

    it("does not let a stale session's end event close the next session", () => {
      const { result } = setup();
      act(() => result.current.start());
      const stale = latestRecognition();
      act(() => result.current.abort());

      act(() => result.current.start());
      act(() => stale.emitEnd());

      expect(result.current.isListening).toBe(true);
    });

    it("aborts the open session when the component unmounts", () => {
      const { result, unmount, onTranscript } = setup();
      act(() => result.current.start());
      const session = latestRecognition();

      unmount();

      expect(session.abortCalls).toBe(1);
      session.emitResult([{ transcript: "late", isFinal: true }]);
      expect(onTranscript).not.toHaveBeenCalled();
    });
  });

  describe("errors", () => {
    it.each([
      ["not-allowed", "permission"],
      ["service-not-allowed", "permission"],
      ["no-speech", "no-speech"],
      ["audio-capture", "no-microphone"],
      ["network", "unavailable"],
      ["language-not-supported", "unavailable"],
      ["bad-grammar", "unavailable"],
    ])("maps the engine's %s to %s", (code, kind) => {
      const { result, onError } = setup();
      act(() => result.current.start());

      act(() => latestRecognition().emitError(code));

      expect(onError).toHaveBeenCalledExactlyOnceWith(kind);
    });

    it("does not report the engine's own 'aborted' as an error", () => {
      const { result, onError } = setup();
      act(() => result.current.start());

      act(() => latestRecognition().emitError("aborted"));

      expect(onError).not.toHaveBeenCalled();
    });

    it("stops listening after a failed session without delivering a transcript", () => {
      const { result, onEnd } = setup();
      act(() => result.current.start());
      const session = latestRecognition();
      act(() => session.emitResult([{ transcript: "half", isFinal: true }]));

      act(() => session.emitError("network"));
      act(() => session.emitEnd());

      expect(result.current.isListening).toBe(false);
      expect(onEnd).not.toHaveBeenCalled();
    });
  });

  describe("telling the caller what happened", () => {
    it("start() reports whether a session actually began", () => {
      const { result } = setup();
      let first = false;
      let second = true;

      act(() => {
        first = result.current.start();
      });
      act(() => {
        second = result.current.start();
      });

      expect(first).toBe(true);
      // Refused: the first session is still open.
      expect(second).toBe(false);
    });

    it("start() reports false when the engine refuses", () => {
      FakeSpeechRecognition.startError = new Error("InvalidStateError");
      const { result } = setup();
      let started = true;

      act(() => {
        started = result.current.start();
      });

      expect(started).toBe(false);
    });

    it("stop() reports whether there was a session to stop", () => {
      const { result } = setup();
      let idle = true;
      let open = false;

      act(() => {
        idle = result.current.stop();
      });
      act(() => result.current.start());
      act(() => latestRecognition().emitStart());
      act(() => {
        open = result.current.stop();
      });

      expect(idle).toBe(false);
      expect(open).toBe(true);
    });
  });

  describe("engines that misbehave", () => {
    it("treats an abort by the engine (another tab took the mic) as a failed session, silently", () => {
      const { result, onEnd, onError } = setup();
      act(() => result.current.start());
      const session = latestRecognition();
      act(() =>
        session.emitResult([{ transcript: "half a thought", isFinal: true }]),
      );

      act(() => session.emitError("aborted"));
      act(() => session.emitEnd());

      expect(onError).not.toHaveBeenCalled();
      // Not a normal end, so nothing may be auto-submitted from it.
      expect(onEnd).not.toHaveBeenCalled();
      expect(result.current.isListening).toBe(false);
    });

    it("stops listening on an error even if the engine never sends end", () => {
      const { result } = setup();
      act(() => result.current.start());
      const session = latestRecognition();

      act(() => session.emitError("network"));

      expect(result.current.isListening).toBe(false);
      expect(session.abortCalls).toBe(1);
    });

    it("still stops, rather than aborts, an engine that delivers results without ever firing start", () => {
      const { result } = setup();
      act(() => result.current.start());
      const session = latestRecognition();
      act(() => session.emitResult([{ transcript: "hi", isFinal: false }]));

      act(() => result.current.stop());

      expect(session.stopCalls).toBe(1);
      expect(session.abortCalls).toBe(0);
    });
  });
});
