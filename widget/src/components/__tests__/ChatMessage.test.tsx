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
      />,
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
      />,
    );
    expect(
      screen.getByRole("button", { name: /view sources/i }),
    ).toBeInTheDocument();
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
      />,
    );
    expect(
      screen.queryByRole("button", { name: /view sources/i }),
    ).not.toBeInTheDocument();
  });

  it("does not render source icon when no sources", () => {
    render(<ChatMessage role="assistant" content="No sources here." />);
    expect(
      screen.queryByRole("button", { name: /view sources/i }),
    ).not.toBeInTheDocument();
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
      />,
    );
    await user.click(screen.getByRole("button", { name: /view sources/i }));
    expect(onSourceClick).toHaveBeenCalledOnce();
  });

  describe("XSS prevention", () => {
    it("renders script tags as plain text", () => {
      render(
        <ChatMessage role="user" content="<script>alert('xss')</script>" />,
      );
      // Script tag should be visible as text, not executed
      expect(
        screen.getByText(/<script>alert\('xss'\)<\/script>/),
      ).toBeInTheDocument();
    });

    it("renders HTML tags as plain text", () => {
      render(
        <ChatMessage role="assistant" content="<img src=x onerror=alert(1)>" />,
      );
      expect(
        screen.getByText(/<img src=x onerror=alert\(1\)>/),
      ).toBeInTheDocument();
    });

    it("does not create links from javascript: URLs", () => {
      render(
        <ChatMessage
          role="assistant"
          content="Click javascript:alert('xss') for help"
        />,
      );
      // No links should be created for javascript: URLs
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    it("safely handles URL-like text with malicious schemes", () => {
      render(
        <ChatMessage
          role="assistant"
          content="data:text/html,<script>alert(1)</script>"
        />,
      );
      // Should render as plain text, not as a link
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    it("renders safe https URLs as clickable links", () => {
      render(
        <ChatMessage
          role="assistant"
          content="Visit https://safe-site.com for more info"
        />,
      );
      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", "https://safe-site.com");
    });
  });

  describe("tool-use affordance", () => {
    const toolUse = {
      name: "get_current_time",
      input: { timezone: "UTC" },
      result: '{"iso":"2026-01-01T00:00:00Z"}',
    };

    it("renders a compact chip naming the tool", () => {
      render(
        <ChatMessage role="assistant" content="Hi" toolUses={[toolUse]} />,
      );
      const chip = screen.getByRole("button", { name: /used tool:/i });
      expect(chip).toHaveTextContent("get_current_time");
      expect(chip).toHaveAttribute("aria-expanded", "false");
    });

    it("discloses input and result details on click and collapses again", async () => {
      const user = userEvent.setup();
      render(
        <ChatMessage role="assistant" content="Hi" toolUses={[toolUse]} />,
      );

      const chip = screen.getByRole("button", { name: /used tool:/i });
      expect(screen.queryByText(/"timezone": "UTC"/)).not.toBeInTheDocument();

      await user.click(chip);
      expect(chip).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByText(/"timezone": "UTC"/)).toBeInTheDocument();
      expect(screen.getByText(/2026-01-01T00:00:00Z/)).toBeInTheDocument();

      await user.click(chip);
      expect(chip).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByText(/"timezone": "UTC"/)).not.toBeInTheDocument();
    });

    it("renders one chip per tool call", () => {
      render(
        <ChatMessage
          role="assistant"
          content="Hi"
          toolUses={[toolUse, { name: "submit_lead", isError: true }]}
        />,
      );
      const chips = screen.getAllByRole("button", { name: /used tool:/i });
      expect(chips).toHaveLength(2);
      // The failed tool has no details to disclose: its chip is disabled.
      expect(screen.getByText("submit_lead")).toBeInTheDocument();
      expect(chips[1]).toBeDisabled();
    });

    it("hides the empty bubble while only tool calls have arrived", () => {
      const { container } = render(
        <ChatMessage
          role="assistant"
          content=""
          isStreaming={true}
          toolUses={[toolUse]}
        />,
      );
      expect(
        container.querySelector(".rounded-claudius-bubble"),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /used tool:/i }),
      ).toBeInTheDocument();
    });

    it("does not render chips for user messages", () => {
      render(<ChatMessage role="user" content="Hi" toolUses={[toolUse]} />);
      expect(
        screen.queryByRole("button", { name: /used tool:/i }),
      ).not.toBeInTheDocument();
    });
  });
});
