import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import {
  MessageSpeechControls,
  type MessageSpeechState,
} from "../MessageSpeechControls";

const labels = {
  play: "Read aloud",
  pause: "Pause reading",
  resume: "Resume reading",
  stop: "Stop reading",
};

function setup(state: MessageSpeechState) {
  const handlers = {
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onStop: vi.fn(),
  };
  render(<MessageSpeechControls state={state} labels={labels} {...handlers} />);
  return handlers;
}

function buttonNames() {
  return screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"));
}

describe("MessageSpeechControls", () => {
  it("offers only Read aloud while idle", () => {
    const { onPlay } = setup("idle");
    expect(buttonNames()).toEqual(["Read aloud"]);

    fireEvent.click(screen.getByRole("button", { name: "Read aloud" }));
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it("offers Pause and Stop while speaking", () => {
    const { onPause, onStop } = setup("speaking");
    expect(buttonNames()).toEqual(["Pause reading", "Stop reading"]);

    fireEvent.click(screen.getByRole("button", { name: "Pause reading" }));
    expect(onPause).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Stop reading" }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("offers Resume and Stop while paused", () => {
    const { onResume, onPlay, onStop } = setup("paused");
    expect(buttonNames()).toEqual(["Resume reading", "Stop reading"]);

    fireEvent.click(screen.getByRole("button", { name: "Resume reading" }));
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onPlay).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Stop reading" }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  // A removed element drops focus to <body>, which is outside the chat
  // dialog's focus trap, so Tab could then leave the dialog.
  describe("keyboard focus", () => {
    function Harness({ initial = "idle" as MessageSpeechState }) {
      const [state, setState] = useState<MessageSpeechState>(initial);
      return (
        <>
          <MessageSpeechControls
            state={state}
            labels={labels}
            onPlay={() => setState("speaking")}
            onPause={() => setState("paused")}
            onResume={() => setState("speaking")}
            onStop={() => setState("idle")}
          />
          <button onClick={() => setState("idle")}>playback ends</button>
        </>
      );
    }

    it("stays on the control as Read aloud becomes Pause, then Resume", async () => {
      const user = userEvent.setup();
      render(<Harness />);

      await user.click(screen.getByRole("button", { name: "Read aloud" }));
      expect(
        screen.getByRole("button", { name: "Pause reading" }),
      ).toHaveFocus();

      await user.click(screen.getByRole("button", { name: "Pause reading" }));
      expect(
        screen.getByRole("button", { name: "Resume reading" }),
      ).toHaveFocus();
    });

    it("moves to Read aloud when Stop is pressed and disappears", async () => {
      const user = userEvent.setup();
      render(<Harness initial="speaking" />);

      await user.click(screen.getByRole("button", { name: "Stop reading" }));

      expect(screen.getByRole("button", { name: "Read aloud" })).toHaveFocus();
    });

    it("moves to Read aloud when playback ends by itself with focus on Stop", () => {
      render(<Harness initial="speaking" />);
      screen.getByRole("button", { name: "Stop reading" }).focus();

      // fireEvent does not move focus, unlike a real click on this button.
      fireEvent.click(screen.getByRole("button", { name: "playback ends" }));

      expect(screen.getByRole("button", { name: "Read aloud" })).toHaveFocus();
    });

    it("does not steal focus when playback ends while the visitor is elsewhere", async () => {
      const user = userEvent.setup();
      render(<Harness initial="speaking" />);
      await user.click(screen.getByRole("button", { name: "Stop reading" }));
      await user.click(screen.getByRole("button", { name: "Read aloud" }));

      // Focus leaves the controls for another element, then playback ends.
      await user.click(screen.getByRole("button", { name: "playback ends" }));

      expect(
        screen.getByRole("button", { name: "playback ends" }),
      ).toHaveFocus();
    });
  });
});
