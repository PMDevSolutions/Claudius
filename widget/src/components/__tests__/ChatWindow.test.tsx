import { render, screen } from "@testing-library/react";
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
