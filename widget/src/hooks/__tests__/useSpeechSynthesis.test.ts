import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useSpeechSynthesis } from "../useSpeechSynthesis";
import {
  FakeSpeechSynthesis,
  installFakeSpeechSynthesis,
  uninstallFakeSpeechSynthesis,
} from "../../test-utils/fakeSpeechSynthesis";

// Forty characters, so the default 200-character chunking is easy to reason
// about by hand: four sentences (163 chars) fit a chunk, five (204) do not.
const SENTENCE = "Alpha beta gamma delta epsilon zeta eta.";
const LONG_REPLY = Array(6).fill(SENTENCE).join(" ");
const FIRST_CHUNK = Array(4).fill(SENTENCE).join(" ");
const SECOND_CHUNK = Array(2).fill(SENTENCE).join(" ");

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

  it("pauses and resumes without losing its place", () => {
    const { result } = renderHook(() => useSpeechSynthesis("en-US"));
    act(() => result.current.speak("m1", LONG_REPLY));

    act(() => result.current.pause());
    expect(synth.paused).toBe(true);
    expect(result.current.isPaused).toBe(true);
    expect(result.current.activeId).toBe("m1");

    act(() => result.current.resume());
    expect(synth.paused).toBe(false);
    expect(result.current.isPaused).toBe(false);
    expect(synth.queuedText()).toEqual([FIRST_CHUNK, SECOND_CHUNK]);
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

  it("cancel() empties the queue and returns to idle, even while paused", () => {
    const { result } = renderHook(() => useSpeechSynthesis("en-US"));
    act(() => result.current.speak("m1", LONG_REPLY));
    act(() => result.current.pause());
    expect(result.current.isPaused).toBe(true);

    act(() => result.current.cancel());

    expect(synth.queue).toHaveLength(0);
    expect(result.current.activeId).toBeNull();
    expect(result.current.isPaused).toBe(false);
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
});
