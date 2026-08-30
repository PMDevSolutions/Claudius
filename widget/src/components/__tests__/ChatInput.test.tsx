import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ChatInput } from "../ChatInput";

describe("ChatInput", () => {
  it("renders input and submit button", () => {
    render(<ChatInput onSend={vi.fn()} isLoading={false} />);
    expect(
      screen.getByPlaceholderText(/type your message/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send/i })).toBeInTheDocument();
  });

  it("calls onSend with input value on submit", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} isLoading={false} />);

    const input = screen.getByPlaceholderText(/type your message/i);
    await user.type(input, "What are your prices?");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(onSend).toHaveBeenCalledWith("What are your prices?");
  });

  it("clears input after sending", async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={vi.fn()} isLoading={false} />);

    const input = screen.getByPlaceholderText(/type your message/i);
    await user.type(input, "Hello");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(input).toHaveValue("");
  });

  it("submits on Enter key", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} isLoading={false} />);

    const input = screen.getByPlaceholderText(/type your message/i);
    await user.type(input, "Hello{enter}");

    expect(onSend).toHaveBeenCalledWith("Hello");
  });

  it("disables input and button when loading", () => {
    render(<ChatInput onSend={vi.fn()} isLoading={true} />);
    expect(screen.getByPlaceholderText(/type your message/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("does not send empty messages", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} isLoading={false} />);

    await user.click(screen.getByRole("button", { name: /send/i }));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("swaps send for an enabled stop button while streaming", async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    render(
      <ChatInput
        onSend={vi.fn()}
        isLoading={true}
        isStreaming={true}
        onStop={onStop}
      />,
    );

    expect(screen.queryByRole("button", { name: /send/i })).toBeNull();
    const stop = screen.getByRole("button", { name: /stop generating/i });
    expect(stop).toBeEnabled();

    await user.click(stop);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("shows the send button again when streaming ends", () => {
    const { rerender } = render(
      <ChatInput
        onSend={vi.fn()}
        isLoading={true}
        isStreaming={true}
        onStop={vi.fn()}
      />,
    );
    rerender(
      <ChatInput
        onSend={vi.fn()}
        isLoading={false}
        isStreaming={false}
        onStop={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /send/i })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /stop generating/i }),
    ).toBeNull();
  });
});
