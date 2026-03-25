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
    expect(screen.queryByText("Chat")).not.toBeInTheDocument();
  });

  it("opens chat window on button click", async () => {
    const user = userEvent.setup();
    render(<ChatWidget apiUrl="https://test.workers.dev" />);

    await user.click(screen.getByRole("button", { name: /open chat/i }));
    expect(screen.getByText("Chat")).toBeInTheDocument();
  });

  it("closes chat window on second button click", async () => {
    const user = userEvent.setup();
    render(<ChatWidget apiUrl="https://test.workers.dev" />);

    await user.click(screen.getByRole("button", { name: /open chat/i }));
    expect(screen.getByText("Chat")).toBeInTheDocument();

    // Use header close button (first of two "Close chat" buttons)
    const closeButtons = screen.getAllByRole("button", { name: /close chat/i });
    await user.click(closeButtons[0]);
    expect(screen.queryByText("Chat")).not.toBeInTheDocument();
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
    const input = screen.getByPlaceholderText(/type your message/i);
    await user.type(input, "Hi{enter}");

    // Wait for reply
    expect(await screen.findByText("Hello!")).toBeInTheDocument();

    // Close via header button and reopen
    const closeButtons = screen.getAllByRole("button", { name: /close chat/i });
    await user.click(closeButtons[0]);
    await user.click(screen.getByRole("button", { name: /open chat/i }));

    // Messages should still be there
    expect(screen.getByText("Hi")).toBeInTheDocument();
    expect(screen.getByText("Hello!")).toBeInTheDocument();
  });
});

describe("ChatWidget - mobile bottom sheet", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn((query: string) => ({
        matches: query === "(max-width: 639px)",
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  it("renders scrim backdrop on mobile when open", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ChatWidget apiUrl="https://test.workers.dev" />
    );
    await user.click(screen.getByRole("button", { name: /open chat/i }));
    expect(container.querySelector(".claudius-scrim")).toBeInTheDocument();
  });

  it("does not render scrim on desktop", async () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    const user = userEvent.setup();
    const { container } = render(
      <ChatWidget apiUrl="https://test.workers.dev" />
    );
    await user.click(screen.getByRole("button", { name: /open chat/i }));
    expect(container.querySelector(".claudius-scrim")).not.toBeInTheDocument();
  });
});
