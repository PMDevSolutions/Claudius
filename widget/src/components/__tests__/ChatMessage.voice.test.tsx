import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ChatMessage, type MessageSpeech } from "../ChatMessage";

function speech(overrides: Partial<MessageSpeech> = {}): MessageSpeech {
  return {
    state: "idle",
    labels: {
      play: "Read aloud",
      pause: "Pause reading",
      resume: "Resume reading",
      stop: "Stop reading",
    },
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onStop: vi.fn(),
    ...overrides,
  };
}

describe("ChatMessage read-aloud", () => {
  it("has no read-aloud control unless the parent provides one", () => {
    render(<ChatMessage role="assistant" content="Hello" />);
    expect(screen.queryByRole("button", { name: "Read aloud" })).toBeNull();
  });

  it("plays an assistant message", () => {
    const onPlay = vi.fn();
    render(
      <ChatMessage
        role="assistant"
        content="Hello"
        speech={speech({ onPlay })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Read aloud" }));

    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it("never offers to read the visitor's own message back", () => {
    render(<ChatMessage role="user" content="Hello" speech={speech()} />);
    expect(screen.queryByRole("button", { name: "Read aloud" })).toBeNull();
  });
});
