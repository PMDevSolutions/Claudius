import { render, screen } from "@testing-library/react";
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
    expect(screen.getByText("What are your prices?")).toBeInTheDocument();
    expect(screen.getByText(/Prices start at \$1,000/)).toBeInTheDocument();
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
});
