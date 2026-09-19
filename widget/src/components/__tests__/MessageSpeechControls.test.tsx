import { render, screen, fireEvent } from "@testing-library/react";
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
});
