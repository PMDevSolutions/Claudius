import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ChatMessage, type MessageCitations } from "../ChatMessage";
import type { Source } from "../../api/types";

const sources: Source[] = [
  {
    url: "https://example.com/pricing",
    title: "Pricing",
    type: "page",
    snippet: "Plans start at $10 a month.",
  },
  { url: "https://example.com/faq", title: "FAQ", type: "page" },
];

const citations: MessageCitations = {
  maxSources: 5,
  favicons: false,
  labels: {
    sources: "Sources",
    showAllSources: "Show all ({count})",
    showFewerSources: "Show fewer",
    citation: "Source {n}: {title}",
    opensInNewTab: "(opens in a new tab)",
  },
};

type Props = React.ComponentProps<typeof ChatMessage>;

function renderCited(content: string, props: Partial<Props> = {}) {
  return render(
    <ChatMessage
      role="assistant"
      content={content}
      sources={sources}
      citations={citations}
      {...props}
    />,
  );
}

describe("ChatMessage citations", () => {
  it("renders an in-range marker as a chip named after its source", () => {
    renderCited("Plans start at $10 [1].");
    const chip = screen.getByRole("button", { name: "Source 1: Pricing" });
    expect(chip).toHaveTextContent("1");
    expect(chip).toHaveAttribute("title", "Pricing");
    expect(screen.queryByText(/\[1\]/)).toBeNull();
    expect(screen.getByText(/Plans start at \$10/)).toBeInTheDocument();
  });

  it("leaves out-of-range, zero, and leading-zero markers as text", () => {
    renderCited("See [3], [0] and [01].");
    expect(screen.queryByRole("button", { name: /^Source \d/ })).toBeNull();
    expect(screen.getByText("See [3], [0] and [01].")).toBeInTheDocument();
  });

  it("renders a chip inside bold text", () => {
    renderCited("**Plans start at $10 [1]**");
    const chip = screen.getByRole("button", { name: "Source 1: Pricing" });
    expect(chip.closest("strong")).not.toBeNull();
  });

  it("detaches a marker glued to the end of a URL", () => {
    renderCited("See https://example.com/pricing[1].");
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "https://example.com/pricing",
    );
    expect(
      screen.getByRole("button", { name: "Source 1: Pricing" }),
    ).toBeInTheDocument();
  });

  it("renders each number of a group as its own chip", () => {
    renderCited("Both apply [1, 2].");
    expect(
      screen.getByRole("button", { name: "Source 1: Pricing" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Source 2: FAQ" }),
    ).toBeInTheDocument();
  });

  it("renders no chips and no footer without the citations prop, keeping the source icon", () => {
    render(
      <ChatMessage
        role="assistant"
        content="Plans start at $10 [1]."
        sources={sources}
        onSourceClick={vi.fn()}
        isSourceActive={false}
      />,
    );
    expect(screen.getByText("Plans start at $10 [1].")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Source \d/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Sources/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: /view sources/i }),
    ).toBeInTheDocument();
  });

  it("replaces the source icon with the footer when citations are on", () => {
    renderCited("Plans start at $10 [1].", {
      onSourceClick: vi.fn(),
      isSourceActive: false,
    });
    expect(screen.queryByRole("button", { name: /view sources/i })).toBeNull();
    expect(
      screen.getByRole("button", { name: /^Sources/ }),
    ).toBeInTheDocument();
  });

  it("renders no chips for a user message", () => {
    render(
      <ChatMessage
        role="user"
        content="I read [1]."
        sources={sources}
        citations={citations}
      />,
    );
    expect(screen.getByText("I read [1].")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the footer, collapsed, even when the reply cites nothing", () => {
    renderCited("Plans start at $10.");
    expect(screen.getByRole("button", { name: /^Sources/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("button", { name: /^Source \d/ })).toBeNull();
  });

  it("a chip click opens the footer and focuses the matching card", async () => {
    const user = userEvent.setup();
    renderCited("Plans start at $10 [1]. See the FAQ [2].");
    await user.click(screen.getByRole("button", { name: "Source 2: FAQ" }));
    expect(screen.getByRole("button", { name: /^Sources/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(cards[1]).toHaveFocus();
    expect(cards[1]).toHaveTextContent("FAQ");
  });

  it("clicking the same chip again focuses the card again", async () => {
    const user = userEvent.setup();
    renderCited("Plans start at $10 [1].");
    const chip = screen.getByRole("button", { name: "Source 1: Pricing" });
    await user.click(chip);
    const card = screen.getAllByRole("listitem")[0];
    expect(card).toHaveFocus();
    chip.focus();
    expect(card).not.toHaveFocus();
    await user.click(chip);
    expect(card).toHaveFocus();
  });

  it("hides an unfinished marker at the end of a streaming reply", () => {
    const { rerender } = render(
      <ChatMessage
        role="assistant"
        content="Plans start at $10 [1"
        isStreaming
        sources={sources}
        citations={citations}
      />,
    );
    expect(screen.getByText("Plans start at $10")).toBeInTheDocument();
    expect(screen.queryByText(/\[1/)).toBeNull();

    rerender(
      <ChatMessage
        role="assistant"
        content="Plans start at $10 [1"
        sources={sources}
        citations={citations}
      />,
    );
    expect(screen.getByText("Plans start at $10 [1")).toBeInTheDocument();
  });

  it("keeps a trailing bracket while streaming a reply without sources", () => {
    render(
      <ChatMessage
        role="assistant"
        content="See [1"
        isStreaming
        citations={citations}
      />,
    );
    expect(screen.getByText("See [1")).toBeInTheDocument();
  });

  it("announces new-tab links with the given label", () => {
    render(
      <ChatMessage
        role="assistant"
        content="Visit https://example.com/a now"
        linkNewTabLabel="(ouvre un nouvel onglet)"
      />,
    );
    expect(
      screen.getByRole("link", {
        name: "example.com/a (ouvre un nouvel onglet)",
      }),
    ).toBeInTheDocument();
  });

  it("links a URL inside bold text", () => {
    render(
      <ChatMessage role="assistant" content="**See https://example.com/a**" />,
    );
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "https://example.com/a",
    );
  });
});
