import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MessageBubble } from "../MessageBubble";

describe("MessageBubble", () => {
  it("renders user message with correct styling", () => {
    render(<MessageBubble role="user" content="Hello!" />);
    const bubble = screen.getByText("Hello!");
    expect(bubble).toBeInTheDocument();
    expect(bubble.closest("div")).toHaveClass("ml-auto");
  });

  it("renders assistant message with correct styling", () => {
    render(<MessageBubble role="assistant" content="How can I help?" />);
    const bubble = screen.getByText("How can I help?");
    expect(bubble).toBeInTheDocument();
    expect(bubble.closest("div")).toHaveClass("mr-auto");
  });

  it("renders links as clickable anchors", () => {
    render(
      <MessageBubble
        role="assistant"
        content="Visit https://pmds.info/contact to get started!"
      />
    );
    const link = screen.getByRole("link", { name: /pmds\.info\/contact/i });
    expect(link).toHaveAttribute("href", "https://pmds.info/contact");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
