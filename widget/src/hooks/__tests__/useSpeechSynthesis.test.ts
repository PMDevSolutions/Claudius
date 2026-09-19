import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useSpeechSynthesis } from "../useSpeechSynthesis";
import {
  FakeSpeechSynthesis,
  FakeSpeechSynthesisUtterance,
  installFakeSpeechSynthesis,
  uninstallFakeSpeechSynthesis,
} from "../../test-utils/fakeSpeechSynthesis";

// Forty characters, so the default 150-character chunking is easy to reason
// about by hand: three sentences (122 chars) fit a chunk, four (163) do not.
const SENTENCE = "Alpha beta gamma delta epsilon zeta eta.";
const LONG_REPLY = Array(6).fill(SENTENCE).join(" ");
const FIRST_CHUNK = Array(3).fill(SENTENCE).join(" ");
const SECOND_CHUNK = Array(3).fill(SENTENCE).join(" ");

describe("useSpeechSynthesis", () => {
  let synth: FakeSpeechSynthesis;

  beforeEach(() => {
    synth = installFakeSpeechSynthesis();
  });
  afterEach(() => uninstallFakeSpeechSynthesis());

  it("is unsupported, and speak() does nothing, without speechSynthesis", () => {
    uninstallFakeSpeechSynthesis();
    const { result } = renderHook(() => useSpeechSynthesis("en-US"));

    expect(result.current.isSupported).toBe(false);
    act(() => result.current.speak("m1", "Hello."));

    expect(result.current.activeId).toBeNull();
  });

  it("queues a reply as sentence-sized utterances in the requested language", () => {
    const { result } = renderHook(() => useSpeechSynthesis("fr-FR"));

    act(() => result.current.speak("m1", LONG_REPLY));

    expect(synth.queuedText()).toEqual([FIRST_CHUNK, SECOND_CHUNK]);
    expect(synth.queue.map((u) => u.lang)).toEqual(["fr-FR", "fr-FR"]);
  });

  it("marks the message as active until its last utterance finishes", () => {
    const { result } = renderHook(() => useSpeechSynthesis("en-US"));
    act(() => result.current.speak("m1", LONG_REPLY));
    expect(result.current.activeId).toBe("m1");
    expect(result.current.isPaused).toBe(false);

    act(() => synth.finishCurrent());
    expect(result.current.activeId).toBe("m1");

    act(() => synth.finishCurrent());
    expect(result.current.activeId).toBeNull();
  });

  it("leaves an idle engine alone: cancel() right before speak() can swallow the utterance", () => {
    const { result } = renderHook(() => useSpeechSynthesis("en-US"));

    act(() => result.current.speak("m1", "Hello."));

    expect(synth.cancelCalls).toBe(0);
    expect(synth.queuedText()).toEqual(["Hello."]);
  });

  it("queues nothing for blank text", () => {
    const { result } = renderHook(() => useSpeechSynthesis("en-US"));

    act(() => result.current.speak("m1", "   "));

    expect(synth.queue).toHaveLength(0);
    expect(result.current.activeId).toBeNull();
  });

  it("shows paused only once the engine confirms it, as Chrome and Safari do", () => {
    const { result } = renderHook(() => useSpeechSynthesis("en-US"));
    act(() => result.current.speak("m1", LONG_REPLY));

    act(() => result.current.pause());
    expect(result.current.isPaused).toBe(false);

    act(() => synth.confirmPause());
    expect(result.current.isPaused).toBe(true);
    expect(result.current.activeId).toBe("m1");
  });

  it("shows paused at once where the engine pauses synchronously, as Firefox does", () => {
    synth.pauseBehavior = "sync";
    const { result } = renderHook(() => useSpeechSynthesis("en-US"));
    act(() => result.current.speak("m1", LONG_REPLY));

    act(() => result.current.pause());

    expect(result.current.isPaused).toBe(true);
  });

  it("resumes the same reply", () => {
    const { result } = renderHook(() => useSpeechSynthesis("en-US"));
    act(() => result.current.speak("m1", LONG_REPLY));
    act(() => result.current.pause());
    act(() => synth.confirmPause());

    act(() => result.current.resume());

    expect(synth.paused).toBe(false);
    expect(result.current.isPaused).toBe(false);
    expect(result.current.activeId).toBe("m1");
  });

  it("ignores a pause event from a reply it has already replaced", () => {
    const { result } = renderHook(() => useSpeechSynthesis("en-US"));
    act(() => result.current.speak("m1", "First reply."));
    const stale = synth.queue[0];
    act(() => result.current.speak("m2", "Second reply."));

    act(() => stale.onpause?.({}));

    expect(result.current.isPaused).toBe(false);
  });

  it("stops outright where pause() ends the utterance (Android), instead of reading on", () => {
    synth.pauseBehavior = "end-utterance";
    const { result } = renderHook(() => useSpeechSynthesis("en-US"));
    act(() => result.current.speak("m1", LONG_REPLY));
    expect(synth.queue).toHaveLength(2);

    act(() => result.current.pause());

    expect(synth.queue).toHaveLength(0);
    expect(result.current.activeId).toBeNull();
    expect(result.current.isPaused).toBe(false);
  });

  it("stops outright where pause() fails the utterance instead (Android), rather than reading on", () => {
    synth.pauseBehavior = "error-utterance";
    const { result } = renderHook(() => useSpeechSynthesis("en-US"));
    act(() => result.current.speak("m1", LONG_REPLY));
    expect(synth.queue).toHaveLength(2);

    act(() => result.current.pause());

    expect(synth.queue).toHaveLength(0);
    expect(result.current.activeId).toBeNull();
  });

  it("stops while paused without leaving the engine paused, or the next reply would queue in silence", () => {
    const { result } = renderHook(() => useSpeechSynthesis("en-US"));
    act(() => result.current.speak("m1", LONG_REPLY));
    act(() => result.current.pause());
    act(() => synth.confirmPause());
    expect(result.current.isPaused).toBe(true);

    act(() => result.current.cancel());

    expect(synth.queue).toHaveLength(0);
    expect(result.current.activeId).toBeNull();
    expect(result.current.isPaused).toBe(false);
    // cancel() alone does not clear the engine's paused state (per the spec).
    expect(synth.paused).toBe(false);
  });

  it("un-pauses an engine that was left paused before it reads", () => {
    synth.paused = true;
    const { result } = renderHook(() => useSpeechSynthesis("en-US"));

    act(() => result.current.speak("m1", "Hello."));

    expect(synth.paused).toBe(false);
    expect(synth.queuedText()).toEqual(["Hello."]);
  });

  it("replaces the reply being read when another one is started", () => {
    const { result } = renderHook(() => useSpeechSynthesis("en-US"));
    act(() => result.current.speak("m1", LONG_REPLY));

    act(() => result.current.speak("m2", "Second reply."));

    expect(synth.queuedText()).toEqual(["Second reply."]);
    expect(result.current.activeId).toBe("m2");
  });

  it("ignores the late error events of utterances it cancelled", () => {
    const { result } = renderHook(() => useSpeechSynthesis("en-US"));
    act(() => result.current.speak("m1", LONG_REPLY));
    act(() => result.current.speak("m2", "Second reply."));

    act(() => synth.flushCancelled());

    expect(result.current.activeId).toBe("m2");
    expect(synth.queuedText()).toEqual(["Second reply."]);
  });

  it("drops the rest of the reply and returns to idle when the engine fails", () => {
    const { result } = renderHook(() => useSpeechSynthesis("en-US"));
    act(() => result.current.speak("m1", LONG_REPLY));
    expect(result.current.activeId).toBe("m1");

    act(() => synth.failCurrent("synthesis-failed"));

    expect(synth.queue).toHaveLength(0);
    expect(result.current.activeId).toBeNull();
  });

  it("stops reading when the component unmounts", () => {
    const { result, unmount } = renderHook(() => useSpeechSynthesis("en-US"));
    act(() => result.current.speak("m1", LONG_REPLY));
    expect(synth.queue).toHaveLength(2);

    unmount();

    expect(synth.queue).toHaveLength(0);
  });

  describe("speech it does not own", () => {
    function hostPageSpeaks() {
      synth.speak(new FakeSpeechSynthesisUtterance("Host page narration."));
    }

    it("is left alone on unmount by a reader that never spoke, as when voice is switched off", () => {
      hostPageSpeaks();
      const { unmount } = renderHook(() => useSpeechSynthesis("en-US"));

      unmount();

      expect(synth.cancelCalls).toBe(0);
      expect(synth.queuedText()).toEqual(["Host page narration."]);
    });

    it("is left alone by cancel() when this reader has nothing playing", () => {
      hostPageSpeaks();
      const { result } = renderHook(() => useSpeechSynthesis("en-US"));

      act(() => result.current.cancel());

      expect(synth.cancelCalls).toBe(0);
      expect(synth.queuedText()).toEqual(["Host page narration."]);
    });

    it("survives a second widget taking over: the first resets without cancelling the engine again", () => {
      const first = renderHook(() => useSpeechSynthesis("en-US"));
      const second = renderHook(() => useSpeechSynthesis("en-US"));
      act(() => first.result.current.speak("m1", LONG_REPLY));
      act(() => second.result.current.speak("m2", "Second reply."));

      // The first widget's utterances now get their late "interrupted" errors.
      act(() => synth.flushCancelled());

      expect(first.result.current.activeId).toBeNull();
      expect(second.result.current.activeId).toBe("m2");
      expect(synth.queuedText()).toEqual(["Second reply."]);
    });
  });
});
