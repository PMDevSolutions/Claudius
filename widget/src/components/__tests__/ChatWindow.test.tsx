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
        onSend={vi.fn()}
      />
    );
    expect(screen.getByText(/Hi! I'm Paul's assistant/i)).toBeInTheDocument();
  });

  it("renders messages", () => {
    const messages = [
      { role: "user" as const, content: "What are your prices?" },
      { role: "assistant" as const, content: "Prices start at $1,000." },
    ];
    render(
      <ChatWindow
        messages={messages}
        isLoading={false}
        error={null}
        onSend={vi.fn()}
      />
    );
    expect(screen.getByText("What are your prices?")).toBeInTheDocument();
    expect(screen.getByText(/Prices start at \$1,000/)).toBeInTheDocument();
  });

  it("shows typing indicator when loading", () => {
    render(
      <ChatWindow
        messages={[{ role: "user", content: "Hi" }]}
        isLoading={true}
        error={null}
        onSend={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/typing/i)).toBeInTheDocument();
  });

  it("shows error message", () => {
    render(
      <ChatWindow
        messages={[]}
        isLoading={false}
        error="Connection failed"
        onSend={vi.fn()}
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
        onSend={vi.fn()}
      />
    );
    expect(screen.getByText("PMDS Chat")).toBeInTheDocument();
  });
});
