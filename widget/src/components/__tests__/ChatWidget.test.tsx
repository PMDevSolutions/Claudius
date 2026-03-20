import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ChatWidget } from "../ChatWidget";

// Mock fetch for useChat
globalThis.fetch = vi.fn();

describe("ChatWidget", () => {
  it("renders toggle button initially (chat closed)", () => {
    render(<ChatWidget apiUrl="https://test.workers.dev" />);
    expect(
      screen.getByRole("button", { name: /open chat/i })
    ).toBeInTheDocument();
    expect(screen.queryByText("PMDS Chat")).not.toBeInTheDocument();
  });

  it("opens chat window on button click", async () => {
    const user = userEvent.setup();
    render(<ChatWidget apiUrl="https://test.workers.dev" />);

    await user.click(screen.getByRole("button", { name: /open chat/i }));
    expect(screen.getByText("PMDS Chat")).toBeInTheDocument();
  });

  it("closes chat window on second button click", async () => {
    const user = userEvent.setup();
    render(<ChatWidget apiUrl="https://test.workers.dev" />);

    await user.click(screen.getByRole("button", { name: /open chat/i }));
    expect(screen.getByText("PMDS Chat")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /close chat/i }));
    expect(screen.queryByText("PMDS Chat")).not.toBeInTheDocument();
  });

  it("preserves messages when toggling open/close", async () => {
    const user = userEvent.setup();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ reply: "Hello!" }),
    });

    render(<ChatWidget apiUrl="https://test.workers.dev" />);

    // Open and send a message
    await user.click(screen.getByRole("button", { name: /open chat/i }));
    const input = screen.getByPlaceholderText(/ask me anything/i);
    await user.type(input, "Hi{enter}");

    // Wait for reply
    expect(await screen.findByText("Hello!")).toBeInTheDocument();

    // Close and reopen
    await user.click(screen.getByRole("button", { name: /close chat/i }));
    await user.click(screen.getByRole("button", { name: /open chat/i }));

    // Messages should still be there
    expect(screen.getByText("Hi")).toBeInTheDocument();
    expect(screen.getByText("Hello!")).toBeInTheDocument();
  });
});
