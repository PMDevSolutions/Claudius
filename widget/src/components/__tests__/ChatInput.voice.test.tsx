import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ChatInput } from "../ChatInput";
import { createTranslations } from "../../i18n";
import type { ResolvedVoiceConfig } from "../../utils/voice";
import {
  FakeSpeechRecognition,
  installFakeSpeechRecognition,
  uninstallFakeSpeechRecognition,
  latestRecognition,
} from "../../test-utils/fakeSpeechRecognition";

const VOICE: ResolvedVoiceConfig = {
  input: true,
  output: true,
  mode: "toggle",
  autoSubmit: false,
  lang: "en-US",
};

// Distinct sentinels: the tests below check *which* message is chosen, and
// should not break when the English copy is edited.
const translations = createTranslations({
  voiceInput: "MIC",
  voiceInputHold: "MIC-HOLD",
  voiceListening: "LISTENING",
  voicePermissionDenied: "ERR-PERMISSION",
  voiceNoSpeech: "ERR-NO-SPEECH",
  voiceNoMicrophone: "ERR-NO-MIC",
  voiceUnavailable: "ERR-UNAVAILABLE",
});

function setup(
  voice: ResolvedVoiceConfig | null = VOICE,
  props: { isLoading?: boolean } = {},
) {
  const onSend = vi.fn();
  const onVoiceStart = vi.fn();
  const view = render(
    <ChatInput
      onSend={onSend}
      isLoading={props.isLoading ?? false}
      translations={translations}
      voice={voice}
      onVoiceStart={onVoiceStart}
    />,
  );
  return { ...view, onSend, onVoiceStart };
}

const mic = () => screen.getByRole("button", { name: "MIC" });
const queryMic = () => screen.queryByRole("button", { name: /^MIC/ });
const field = () => screen.getByRole("textbox") as HTMLInputElement;
const level = (container: HTMLElement) =>
  container.querySelector("[data-claudius-voice-level]");

function hear(transcript: string, isFinal: boolean) {
  act(() => latestRecognition().emitResult([{ transcript, isFinal }]));
}

describe("ChatInput voice input", () => {
  beforeEach(() => installFakeSpeechRecognition());
  afterEach(() => uninstallFakeSpeechRecognition());

  describe("mic button visibility", () => {
    it("is absent when voice is not enabled", () => {
      setup(null);
      expect(queryMic()).not.toBeInTheDocument();
    });

    it("is absent when the browser cannot recognize speech", () => {
      uninstallFakeSpeechRecognition();
      setup();
      expect(queryMic()).not.toBeInTheDocument();
    });

    it("is absent when only read-aloud is enabled", () => {
      setup({ ...VOICE, input: false });
      expect(queryMic()).not.toBeInTheDocument();
    });

    it("is present when voice input is enabled and supported", () => {
      setup();
      expect(mic()).toBeInTheDocument();
    });

    it("is labelled for holding in hold mode", () => {
      setup({ ...VOICE, mode: "hold" });
      expect(
        screen.getByRole("button", { name: "MIC-HOLD" }),
      ).toBeInTheDocument();
    });

    it("is disabled while a reply is loading", () => {
      setup(VOICE, { isLoading: true });
      expect(mic()).toBeDisabled();
    });
  });

  describe("dictating", () => {
    it("recognizes in the configured language", () => {
      setup({ ...VOICE, lang: "es-MX" });
      fireEvent.click(mic());
      expect(latestRecognition().lang).toBe("es-MX");
    });

    it("tells its parent that dictation started", () => {
      const { onVoiceStart } = setup();
      fireEvent.click(mic());
      expect(onVoiceStart).toHaveBeenCalledTimes(1);
    });

    it("streams what is heard into the message field", () => {
      setup();
      fireEvent.click(mic());

      hear("hello wor", false);
      expect(field()).toHaveValue("hello wor");

      hear("hello world", true);
      expect(field()).toHaveValue("hello world");
    });

    it("appends to text that was already typed", async () => {
      const user = userEvent.setup();
      setup();
      await user.type(field(), "Hi team");

      fireEvent.click(mic());
      hear("how are you", false);

      expect(field()).toHaveValue("Hi team how are you");
    });

    it("clips dictation to the message length limit", () => {
      setup();
      fireEvent.click(mic());

      hear("a".repeat(2100), true);

      expect(field().value).toHaveLength(2000);
    });

    it("asks the engine to finish when the mic is clicked again", () => {
      setup();
      fireEvent.click(mic());
      const session = latestRecognition();
      act(() => session.emitStart());

      fireEvent.click(mic());

      expect(session.stopCalls).toBe(1);
    });

    it("records while the button is held in hold mode", () => {
      setup({ ...VOICE, mode: "hold" });
      const button = screen.getByRole("button", { name: "MIC-HOLD" });

      fireEvent.pointerDown(button, { button: 0 });
      const session = latestRecognition();
      act(() => session.emitStart());
      expect(button).toHaveAttribute("aria-pressed", "true");

      fireEvent.pointerUp(button);
      expect(session.stopCalls).toBe(1);
    });
  });

  describe("listening feedback", () => {
    it("shows a listening placeholder and indicator only while listening", () => {
      const { container } = setup();
      expect(level(container)).not.toBeInTheDocument();

      fireEvent.click(mic());
      expect(field()).toHaveAttribute("placeholder", "LISTENING");
      expect(level(container)).toBeInTheDocument();
      expect(mic()).toHaveAttribute("aria-pressed", "true");

      act(() => latestRecognition().emitEnd());
      expect(field()).not.toHaveAttribute("placeholder", "LISTENING");
      expect(level(container)).not.toBeInTheDocument();
      expect(mic()).toHaveAttribute("aria-pressed", "false");
    });

    it("livens the indicator while speech is being heard", () => {
      const { container } = setup();
      fireEvent.click(mic());
      expect(level(container)).toHaveAttribute(
        "data-claudius-voice-level",
        "idle",
      );

      act(() => latestRecognition().emitSpeechStart());

      expect(level(container)).toHaveAttribute(
        "data-claudius-voice-level",
        "active",
      );
    });

    it("hides the indicator from assistive technology", () => {
      const { container } = setup();
      fireEvent.click(mic());
      expect(level(container)).toHaveAttribute("aria-hidden", "true");
    });
  });

  describe("typing during dictation", () => {
    it("keeps the edit and drops the session, so a late result cannot overwrite it", async () => {
      const user = userEvent.setup();
      setup();
      fireEvent.click(mic());
      const session = latestRecognition();
      hear("hello", false);

      await user.type(field(), "!");

      expect(field()).toHaveValue("hello!");
      expect(session.abortCalls).toBe(1);
      expect(mic()).toHaveAttribute("aria-pressed", "false");

      act(() =>
        session.emitResult([{ transcript: "hello there", isFinal: true }]),
      );
      expect(field()).toHaveValue("hello!");
    });
  });

  describe("sending", () => {
    it("leaves dictated text in the field for review by default", () => {
      const { onSend } = setup();
      fireEvent.click(mic());
      hear("hello world", true);

      act(() => latestRecognition().emitEnd());

      expect(onSend).not.toHaveBeenCalled();
      expect(field()).toHaveValue("hello world");
    });

    it("ends the dictation when the message is sent by hand mid-session", async () => {
      const user = userEvent.setup();
      const { onSend } = setup();
      fireEvent.click(mic());
      const session = latestRecognition();
      hear("hello", false);

      await user.click(screen.getByRole("button", { name: /send message/i }));

      expect(onSend).toHaveBeenCalledExactlyOnceWith("hello");
      expect(session.abortCalls).toBe(1);
      expect(field()).toHaveValue("");
    });

    describe("with auto-submit", () => {
      const AUTO = { ...VOICE, autoSubmit: true };

      it("sends the message as soon as dictation ends", () => {
        const { onSend } = setup(AUTO);
        fireEvent.click(mic());
        hear("hello world", true);

        act(() => latestRecognition().emitEnd());

        expect(onSend).toHaveBeenCalledExactlyOnceWith("hello world");
        expect(field()).toHaveValue("");
      });

      it("includes text typed before dictating", async () => {
        const user = userEvent.setup();
        const { onSend } = setup(AUTO);
        await user.type(field(), "Hi team");
        fireEvent.click(mic());
        hear("how are you", true);

        act(() => latestRecognition().emitEnd());

        expect(onSend).toHaveBeenCalledExactlyOnceWith("Hi team how are you");
      });

      it("does not send typed text when nothing was recognized", async () => {
        const user = userEvent.setup();
        const { onSend } = setup(AUTO);
        await user.type(field(), "Hi team");
        fireEvent.click(mic());

        act(() => latestRecognition().emitEnd());

        expect(onSend).not.toHaveBeenCalled();
        expect(field()).toHaveValue("Hi team");
      });

      it("does not send after a failed session", () => {
        const { onSend } = setup(AUTO);
        fireEvent.click(mic());
        const session = latestRecognition();
        hear("hello", true);

        act(() => session.emitError("network"));
        act(() => session.emitEnd());

        expect(onSend).not.toHaveBeenCalled();
      });
    });
  });

  describe("errors", () => {
    it.each([
      ["not-allowed", "ERR-PERMISSION"],
      ["no-speech", "ERR-NO-SPEECH"],
      ["audio-capture", "ERR-NO-MIC"],
      ["network", "ERR-UNAVAILABLE"],
    ])("explains a %s failure", (code, message) => {
      setup();
      fireEvent.click(mic());

      act(() => latestRecognition().emitError(code));

      expect(screen.getByRole("alert")).toHaveTextContent(message);
    });

    it("explains a browser that exposes the API but refuses to start", () => {
      FakeSpeechRecognition.startError = new Error("InvalidStateError");
      setup();

      fireEvent.click(mic());

      expect(screen.getByRole("alert")).toHaveTextContent("ERR-UNAVAILABLE");
    });

    it("clears the message when dictation is tried again", () => {
      setup();
      fireEvent.click(mic());
      const failed = latestRecognition();
      act(() => failed.emitError("no-speech"));
      act(() => failed.emitEnd());
      expect(screen.getByRole("alert")).toBeInTheDocument();

      fireEvent.click(mic());

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
