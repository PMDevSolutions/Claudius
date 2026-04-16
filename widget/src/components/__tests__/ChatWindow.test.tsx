import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ChatWindow } from "../ChatWindow";

describe("ChatWindow", () => {
  it("renders welcome message when no messages", () => {
    render(
      <ChatWindow
        messages={[]}
        isLoading={false}
        error={null}
        onSend={vi.fn()} onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/How can I help you today/i)).toBeInTheDocument();
  });

  it("renders messages", () => {
    const messages = [
      { id: "msg-1", role: "user" as const, content: "What are your prices?" },
      { id: "msg-2", role: "assistant" as const, content: "Prices start at $1,000." },
    ];
    render(
      <ChatWindow
        messages={messages}
        isLoading={false}
        error={null}
        onSend={vi.fn()} onClose={vi.fn()}
      />
    );
    const log = screen.getByRole("log");
    expect(within(log).getByText("What are your prices?")).toBeInTheDocument();
    expect(within(log).getByText(/Prices start at \$1,000/)).toBeInTheDocument();
  });

  it("shows typing indicator when loading", () => {
    render(
      <ChatWindow
        messages={[{ id: "msg-1", role: "user", content: "Hi" }]}
        isLoading={true}
        error={null}
        onSend={vi.fn()} onClose={vi.fn()}
      />
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows error message", () => {
    render(
      <ChatWindow
        messages={[]}
        isLoading={false}
        error="Connection failed"
        onSend={vi.fn()} onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/Connection failed/i)).toBeInTheDocument();
  });

  const messagesWithSources = [
    { id: "msg-1", role: "user" as const, content: "Help me" },
    {
      id: "msg-2",
      role: "assistant" as const,
      content: "Here are resources.",
      sources: [
        { url: "https://pmds.info/blog/seo", title: "SEO Tips", type: "blog" as const },
        { url: "https://pmds.info/services", title: "Services", type: "page" as const },
      ],
    },
  ];

  it("renders source icon on assistant messages with sources", () => {
    render(
      <ChatWindow
        messages={messagesWithSources}
        isLoading={false}
        error={null}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /view sources/i })).toBeInTheDocument();
  });

  it("opens sources sidebar when source icon is clicked", async () => {
    const user = userEvent.setup();
    render(
      <ChatWindow
        messages={messagesWithSources}
        isLoading={false}
        error={null}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />
    );
    await user.click(screen.getByRole("button", { name: /view sources/i }));
    expect(screen.getByText("Sources")).toBeInTheDocument();
    expect(screen.getByText("2 sources found")).toBeInTheDocument();
    expect(screen.getByText("SEO Tips")).toBeInTheDocument();
  });

  it("closes sources sidebar when close button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <ChatWindow
        messages={messagesWithSources}
        isLoading={false}
        error={null}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />
    );
    await user.click(screen.getByRole("button", { name: /view sources/i }));
    expect(screen.getByText("Sources")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /close sources/i }));
    expect(screen.queryByText("Sources")).not.toBeInTheDocument();
  });

  it("toggles sidebar off when same source icon is clicked again", async () => {
    const user = userEvent.setup();
    render(
      <ChatWindow
        messages={messagesWithSources}
        isLoading={false}
        error={null}
        onSend={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const icon = screen.getByRole("button", { name: /view sources/i });
    await user.click(icon);
    expect(screen.getByText("Sources")).toBeInTheDocument();
    await user.click(icon);
    expect(screen.queryByText("Sources")).not.toBeInTheDocument();
  });

  it("renders header with title", () => {
    render(
      <ChatWindow
        messages={[]}
        isLoading={false}
        error={null}
        onSend={vi.fn()} onClose={vi.fn()}
      />
    );
    expect(screen.getByText("Chat")).toBeInTheDocument();
  });

  it("announces the latest assistant message via a polite live region", async () => {
    const { rerender } = render(
      <ChatWindow messages={[{ id: "m1", role: "user", content: "hi" }]}
        isLoading={false} error={null} onSend={vi.fn()} onClose={vi.fn()} />
    );
    rerender(
      <ChatWindow
        messages={[
          { id: "m1", role: "user", content: "hi" },
          { id: "m2", role: "assistant", content: "Hello there!" },
        ]}
        isLoading={false} error={null} onSend={vi.fn()} onClose={vi.fn()}
      />
    );
    const liveRegion = document.querySelector('[data-claudius-live="assistant"]');
    expect(liveRegion).toHaveAttribute("aria-live", "polite");
    expect(liveRegion?.textContent).toContain("Hello there!");
  });
});

describe("ChatWindow - mobile bottom sheet", () => {
  it("renders with bottom sheet classes when isMobile is true", () => {
    const { container } = render(
      <ChatWindow
        messages={[]}
        isLoading={false}
        error={null}
        onSend={vi.fn()}
        onClose={vi.fn()}
        isMobile={true}
      />
    );
    expect(container.querySelector(".claudius-bottom-sheet")).toBeInTheDocument();
  });

  it("does not render bottom sheet classes when isMobile is false", () => {
    const { container } = render(
      <ChatWindow
        messages={[]}
        isLoading={false}
        error={null}
        onSend={vi.fn()}
        onClose={vi.fn()}
        isMobile={false}
      />
    );
    expect(container.querySelector(".claudius-bottom-sheet")).not.toBeInTheDocument();
  });

  it("renders drag handle when isMobile is true", () => {
    const { container } = render(
      <ChatWindow
        messages={[]}
        isLoading={false}
        error={null}
        onSend={vi.fn()}
        onClose={vi.fn()}
        isMobile={true}
      />
    );
    // Drag handle is a small rounded bar
    const handle = container.querySelector("[aria-hidden='true'] .rounded-full");
    expect(handle).toBeInTheDocument();
  });
});

describe("ChatWindow - dialog semantics", () => {
  it("sets aria-modal=true on mobile (scrim blocks background)", () => {
    render(
      <ChatWindow messages={[]} isLoading={false} error={null} onSend={vi.fn()} onClose={vi.fn()} isMobile={true} />
    );
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });

  it("omits aria-modal on desktop (background remains interactive)", () => {
    render(
      <ChatWindow messages={[]} isLoading={false} error={null} onSend={vi.fn()} onClose={vi.fn()} isMobile={false} />
    );
    expect(screen.getByRole("dialog")).not.toHaveAttribute("aria-modal");
  });

  it("is labelled by the title heading via aria-labelledby", () => {
    render(
      <ChatWindow messages={[]} isLoading={false} error={null} onSend={vi.fn()} onClose={vi.fn()} title="Support" />
    );
    expect(screen.getByRole("dialog", { name: "Support" })).toBeInTheDocument();
  });
});

describe("ChatWindow - keyboard", () => {
  it("calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <ChatWindow messages={[]} isLoading={false} error={null} onSend={vi.fn()} onClose={onClose} />
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose for other keys", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <ChatWindow messages={[]} isLoading={false} error={null} onSend={vi.fn()} onClose={onClose} />
    );
    await user.keyboard("a");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not call onClose when Escape is pressed during IME composition", () => {
    const onClose = vi.fn();
    render(
      <ChatWindow messages={[]} isLoading={false} error={null} onSend={vi.fn()} onClose={onClose} />
    );
    // Dispatch a keydown with isComposing: true — user is mid-IME, Escape should cancel the composition, not close the widget
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    Object.defineProperty(event, "isComposing", { value: true });
    document.dispatchEvent(event);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("focuses the message input on mount", async () => {
    render(
      <ChatWindow messages={[]} isLoading={false} error={null} onSend={vi.fn()} onClose={vi.fn()} />
    );
    expect(await screen.findByLabelText(/type your message/i)).toHaveFocus();
  });

  it("traps tab within the dialog", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button>outside-before</button>
        <ChatWindow messages={[]} isLoading={false} error={null} onSend={vi.fn()} onClose={vi.fn()} />
        <button>outside-after</button>
      </>
    );
    // Tab several times and confirm focus stays inside the dialog
    for (let i = 0; i < 8; i++) await user.tab();
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});
