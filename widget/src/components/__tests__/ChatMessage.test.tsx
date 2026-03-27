import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ChatMessage } from "../ChatMessage";
import type { Source } from "../../api/types";

const mockSources: Source[] = [
  { url: "https://pmds.info/blog/test", title: "Test Post", type: "blog" },
  { url: "https://pmds.info/services", title: "Services", type: "page" },
];

describe("ChatMessage", () => {
  it("renders user message with correct styling", () => {
    render(<ChatMessage role="user" content="Hello!" />);
    const bubble = screen.getByText("Hello!");
    expect(bubble).toBeInTheDocument();
    // ml-auto is on the outer wrapper div (parent of the bubble div)
    const innerDiv = bubble.closest("div");
    expect(innerDiv?.parentElement).toHaveClass("ml-auto");
  });

  it("renders assistant message with correct styling", () => {
    render(<ChatMessage role="assistant" content="How can I help?" />);
    const bubble = screen.getByText("How can I help?");
    expect(bubble).toBeInTheDocument();
    // mr-auto is on the outer wrapper div (parent of the bubble div)
    const innerDiv = bubble.closest("div");
    expect(innerDiv?.parentElement).toHaveClass("mr-auto");
  });

  it("renders links as clickable anchors", () => {
    render(
      <ChatMessage
        role="assistant"
        content="Visit https://pmds.info/contact to get started!"
      />
    );
    const link = screen.getByRole("link", { name: /pmds\.info\/contact/i });
    expect(link).toHaveAttribute("href", "https://pmds.info/contact");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders source icon for assistant messages with sources", () => {
    render(
      <ChatMessage
        role="assistant"
        content="Here are resources."
        sources={mockSources}
        onSourceClick={vi.fn()}
        isSourceActive={false}
      />
    );
    expect(screen.getByRole("button", { name: /view sources/i })).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("does not render source icon for user messages", () => {
    render(
      <ChatMessage
        role="user"
        content="Hello"
        sources={mockSources}
        onSourceClick={vi.fn()}
        isSourceActive={false}
      />
    );
    expect(screen.queryByRole("button", { name: /view sources/i })).not.toBeInTheDocument();
  });

  it("does not render source icon when no sources", () => {
    render(
      <ChatMessage role="assistant" content="No sources here." />
    );
    expect(screen.queryByRole("button", { name: /view sources/i })).not.toBeInTheDocument();
  });

  it("calls onSourceClick when source icon is clicked", async () => {
    const user = userEvent.setup();
    const onSourceClick = vi.fn();
    render(
      <ChatMessage
        role="assistant"
        content="Resources."
        sources={mockSources}
        onSourceClick={onSourceClick}
        isSourceActive={false}
      />
    );
    await user.click(screen.getByRole("button", { name: /view sources/i }));
    expect(onSourceClick).toHaveBeenCalledOnce();
  });
});
