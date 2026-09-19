import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ChatWindow } from "../ChatWindow";
import type { ChatMessage } from "../../api/types";
import type { ResolvedVoiceConfig } from "../../utils/voice";
import {
  FakeSpeechSynthesis,
  installFakeSpeechSynthesis,
  uninstallFakeSpeechSynthesis,
} from "../../test-utils/fakeSpeechSynthesis";
import {
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

const QUESTION: ChatMessage = { id: "u1", role: "user", content: "Prices?" };
const REPLY: ChatMessage = {
  id: "a1",
  role: "assistant",
  content: "Plans start at $10.",
};
const SECOND_REPLY: ChatMessage = {
  id: "a2",
  role: "assistant",
  content: "Anything else?",
};

function renderWindow(
  messages: ChatMessage[],
  props: {
    voice?: ResolvedVoiceConfig | null;
    streamingMessageId?: string | null;
  } = {},
) {
  return render(
    <ChatWindow
      messages={messages}
      isLoading={false}
      error={null}
      onSend={vi.fn()}
      onClose={vi.fn()}
      voice={props.voice === undefined ? VOICE : props.voice}
      streamingMessageId={props.streamingMessageId ?? null}
    />,
  );
}

const readAloudButtons = () =>
  screen.queryAllByRole("button", { name: "Read aloud" });

describe("ChatWindow read-aloud", () => {
  let synth: FakeSpeechSynthesis;

  beforeEach(() => {
    synth = installFakeSpeechSynthesis();
    installFakeSpeechRecognition();
  });
  afterEach(() => {
    uninstallFakeSpeechSynthesis();
    uninstallFakeSpeechRecognition();
  });

  describe("where it is offered", () => {
    it("appears on assistant replies and not on the visitor's own messages", () => {
      renderWindow([QUESTION, REPLY]);
      expect(readAloudButtons()).toHaveLength(1);
    });

    it("is withheld from a reply that is still streaming in", () => {
      renderWindow([QUESTION, REPLY, SECOND_REPLY], {
        streamingMessageId: "a2",
      });
      expect(readAloudButtons()).toHaveLength(1);
    });

    it("is withheld from a reply with no text, such as a tool-only placeholder", () => {
      renderWindow([
        QUESTION,
        {
          id: "a1",
          role: "assistant",
          content: "",
          toolUses: [{ name: "get_current_time", input: {}, result: "noon" }],
        },
      ]);
      expect(readAloudButtons()).toHaveLength(0);
    });

    it("is absent when voice is not enabled", () => {
      renderWindow([QUESTION, REPLY], { voice: null });
      expect(readAloudButtons()).toHaveLength(0);
    });

    it("is absent when only dictation is enabled", () => {
      renderWindow([QUESTION, REPLY], { voice: { ...VOICE, output: false } });
      expect(readAloudButtons()).toHaveLength(0);
    });

    it("is absent when the browser cannot synthesize speech", () => {
      uninstallFakeSpeechSynthesis();
      renderWindow([QUESTION, REPLY]);
      expect(readAloudButtons()).toHaveLength(0);
    });
  });

  describe("playback", () => {
    it("reads the reply in the configured language, without markdown or full URLs", () => {
      renderWindow(
        [
          {
            id: "a1",
            role: "assistant",
            content: "See https://example.com/pricing for **full** details.",
          },
        ],
        { voice: { ...VOICE, lang: "en-GB" } },
      );

      fireEvent.click(screen.getByRole("button", { name: "Read aloud" }));

      expect(synth.queuedText()).toEqual(["See example.com for full details."]);
      expect(synth.queue[0].lang).toBe("en-GB");
    });

    it("swaps to pause and stop while reading, and back when the reply finishes", () => {
      renderWindow([QUESTION, REPLY]);

      fireEvent.click(screen.getByRole("button", { name: "Read aloud" }));
      expect(
        screen.getByRole("button", { name: "Pause reading" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Stop reading" }),
      ).toBeInTheDocument();
      expect(readAloudButtons()).toHaveLength(0);

      act(() => synth.finishCurrent());
      expect(readAloudButtons()).toHaveLength(1);
    });

    it("pauses and resumes", () => {
      renderWindow([QUESTION, REPLY]);
      fireEvent.click(screen.getByRole("button", { name: "Read aloud" }));

      fireEvent.click(screen.getByRole("button", { name: "Pause reading" }));
      // Chrome and Safari confirm a pause asynchronously.
      act(() => synth.confirmPause());

      fireEvent.click(screen.getByRole("button", { name: "Resume reading" }));
      expect(synth.paused).toBe(false);
      expect(
        screen.getByRole("button", { name: "Pause reading" }),
      ).toBeInTheDocument();
    });

    it("stops on request", () => {
      renderWindow([QUESTION, REPLY]);
      fireEvent.click(screen.getByRole("button", { name: "Read aloud" }));

      fireEvent.click(screen.getByRole("button", { name: "Stop reading" }));

      expect(synth.queue).toHaveLength(0);
      expect(readAloudButtons()).toHaveLength(1);
    });

    it("reads one reply at a time: starting another replaces the first", () => {
      renderWindow([REPLY, SECOND_REPLY]);
      const [first, second] = readAloudButtons();
      fireEvent.click(first);
      expect(synth.queuedText()).toEqual(["Plans start at $10."]);

      fireEvent.click(second);

      expect(synth.queuedText()).toEqual(["Anything else?"]);
      // The first reply is idle again; only the second shows playback controls.
      expect(readAloudButtons()).toHaveLength(1);
      expect(
        screen.getAllByRole("button", { name: "Stop reading" }),
      ).toHaveLength(1);
    });

    it("ends dictation when a reply starts being read, so the mic does not transcribe it", () => {
      renderWindow([QUESTION, REPLY]);
      const mic = screen.getByRole("button", { name: "Voice input" });
      fireEvent.click(mic);
      const session = latestRecognition();
      expect(mic).toHaveAttribute("aria-pressed", "true");

      fireEvent.click(screen.getByRole("button", { name: "Read aloud" }));

      expect(session.abortCalls).toBe(1);
      expect(mic).toHaveAttribute("aria-pressed", "false");
      expect(synth.queuedText()).toEqual(["Plans start at $10."]);
    });

    it("falls silent when the visitor starts dictating, so the mic does not hear it", () => {
      renderWindow([QUESTION, REPLY]);
      fireEvent.click(screen.getByRole("button", { name: "Read aloud" }));
      expect(synth.queue).toHaveLength(1);

      fireEvent.click(screen.getByRole("button", { name: "Voice input" }));

      expect(synth.queue).toHaveLength(0);
      expect(readAloudButtons()).toHaveLength(1);
    });
  });

  it("uses translated labels for the controls", () => {
    render(
      <ChatWindow
        messages={[REPLY]}
        isLoading={false}
        error={null}
        onSend={vi.fn()}
        onClose={vi.fn()}
        voice={VOICE}
        translations={
          {
            readAloud: "Vorlesen",
            pauseReading: "Vorlesen pausieren",
            resumeReading: "Vorlesen fortsetzen",
            stopReading: "Vorlesen beenden",
          } as never
        }
      />,
    );
    const log = screen.getByRole("log");

    fireEvent.click(within(log).getByRole("button", { name: "Vorlesen" }));

    expect(
      within(log).getByRole("button", { name: "Vorlesen pausieren" }),
    ).toBeInTheDocument();
    expect(
      within(log).getByRole("button", { name: "Vorlesen beenden" }),
    ).toBeInTheDocument();
  });
});
