import { render, screen, within, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach } from "vitest";
import { SourceCards } from "../SourceCards";
import type { Source } from "../../api/types";

const labels = {
  sources: "Sources",
  showAllSources: "Show all ({count})",
  showFewerSources: "Show fewer",
  opensInNewTab: "(opens in a new tab)",
};

function source(n: number, overrides: Partial<Source> = {}): Source {
  return {
    url: `https://example.com/page-${n}`,
    title: `Page ${n}`,
    type: "page",
    snippet: `Snippet ${n}.`,
    ...overrides,
  };
}

const many = (count: number) =>
  Array.from({ length: count }, (_, i) => source(i + 1));

type Props = React.ComponentProps<typeof SourceCards>;

function renderCards(props: Partial<Props> = {}) {
  const all: Props = {
    sources: many(2),
    maxSources: 5,
    favicons: true,
    labels,
    ...props,
  };
  const view = render(<SourceCards {...all} />);
  return {
    ...view,
    rerender: (next: Partial<Props>) =>
      view.rerender(<SourceCards {...all} {...next} />),
  };
}

const toggle = () => screen.getByRole("button", { name: /Sources/ });

describe("SourceCards", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("starts collapsed, with the count on the toggle", () => {
    renderCards();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(toggle()).toHaveTextContent("2");
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("expands to an ordered list of cards and collapses again", async () => {
    const user = userEvent.setup();
    renderCards();
    await user.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("list", { name: "Sources" });
    expect(list.tagName).toBe("OL");
    expect(toggle()).toHaveAttribute("aria-controls", list.id);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    await user.click(toggle());
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("shows the title link, snippet, and domain on a card", async () => {
    const user = userEvent.setup();
    renderCards({ sources: [source(1)] });
    await user.click(toggle());
    const link = screen.getByRole("link", {
      name: "Page 1 (opens in a new tab)",
    });
    expect(link).toHaveAttribute("href", "https://example.com/page-1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("Snippet 1.")).toBeInTheDocument();
    expect(screen.getByText("example.com")).toBeInTheDocument();
  });

  it("renders no snippet paragraph when the source has none", async () => {
    const user = userEvent.setup();
    renderCards({ sources: [source(1, { snippet: undefined })] });
    await user.click(toggle());
    const card = screen.getByRole("listitem");
    // Only the domain line is left.
    expect(card.querySelectorAll("p")).toHaveLength(1);
    expect(card).toHaveTextContent("example.com");
  });

  it("cuts a long snippet to 200 characters", async () => {
    const user = userEvent.setup();
    const words = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    renderCards({ sources: [source(1, { snippet: words })] });
    await user.click(toggle());
    const snippet = screen.getByText(/^word0 /);
    expect(snippet.textContent!.length).toBeLessThanOrEqual(201);
    expect(snippet.textContent!.endsWith("…")).toBe(true);
  });

  it("wraps a long unbroken snippet inside the card", async () => {
    const user = userEvent.setup();
    renderCards({ sources: [source(1, { snippet: "x".repeat(150) })] });
    await user.click(toggle());
    expect(screen.getByText(/^x+$/)).toHaveClass("break-words");
  });

  it("keeps a numbered card, without a link or favicon, for an unsafe URL", async () => {
    const user = userEvent.setup();
    renderCards({
      sources: [
        source(1),
        source(2, { url: "javascript:alert(1)", title: "Bad" }),
      ],
    });
    await user.click(toggle());
    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(cards[1]).toHaveTextContent("Bad");
    expect(within(cards[1]).queryByRole("link")).toBeNull();
    expect(cards[1].querySelector("img")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("requests the favicon from the source origin without a referrer, and falls back on error", async () => {
    const user = userEvent.setup();
    renderCards({ sources: [source(1)] });
    await user.click(toggle());
    const card = screen.getByRole("listitem");
    const img = card.querySelector("img")!;
    expect(img).toHaveAttribute("src", "https://example.com/favicon.ico");
    expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(img).toHaveAttribute("alt", "");
    // The external-link icon is the only svg while the favicon shows.
    expect(card.querySelectorAll("svg")).toHaveLength(1);

    fireEvent.error(img);

    expect(card.querySelector("img")).toBeNull();
    // Now the generic icon too.
    expect(card.querySelectorAll("svg")).toHaveLength(2);
  });

  it("requests no favicon when favicons is off", async () => {
    const user = userEvent.setup();
    renderCards({ sources: [source(1)], favicons: false });
    await user.click(toggle());
    const card = screen.getByRole("listitem");
    expect(card.querySelector("img")).toBeNull();
    expect(card.querySelectorAll("svg")).toHaveLength(2);
  });

  it("shows only maxSources cards until Show all, then all, then fewer again", async () => {
    const user = userEvent.setup();
    renderCards({ sources: many(7), maxSources: 5 });
    await user.click(toggle());
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    const more = screen.getByRole("button", { name: "Show all (7)" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    await user.click(more);
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
    const fewer = screen.getByRole("button", { name: "Show fewer" });
    expect(fewer).toHaveAttribute("aria-expanded", "true");
    await user.click(fewer);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("offers no Show all when every card already fits", async () => {
    const user = userEvent.setup();
    renderCards({ sources: many(5), maxSources: 5 });
    await user.click(toggle());
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  });

  it("a reveal opens the footer, scrolls to the card, focuses and highlights it", () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    const { rerender } = renderCards({ sources: many(3), reveal: null });
    expect(screen.queryByRole("list")).toBeNull();

    rerender({ reveal: { index: 1, key: 1 } });

    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(3);
    expect(cards[1]).toHaveFocus();
    expect(cards[1]).toHaveAttribute("data-highlight", "true");
    expect(cards[0]).not.toHaveAttribute("data-highlight");
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(cards[1]);
    expect(scroll).toHaveBeenCalledWith({
      block: "nearest",
      behavior: "smooth",
    });
  });

  it("a reveal past the cut shows all cards first", () => {
    const { rerender } = renderCards({
      sources: many(7),
      maxSources: 5,
      reveal: null,
    });
    rerender({ reveal: { index: 6, key: 1 } });
    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(7);
    expect(cards[6]).toHaveFocus();
    expect(
      screen.getByRole("button", { name: "Show fewer" }),
    ).toBeInTheDocument();
  });

  it("scrolls instantly when the visitor prefers reduced motion", () => {
    // Same override as the theme=auto test: the setup file defines
    // matchMedia as a writable, non-configurable property, which spyOn
    // cannot replace but defineProperty can.
    const original = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: query.includes("reduce"),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
    try {
      const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
      const { rerender } = renderCards({ reveal: null });
      rerender({ reveal: { index: 0, key: 1 } });
      expect(scroll).toHaveBeenCalledWith({
        block: "nearest",
        behavior: "auto",
      });
    } finally {
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: original,
      });
    }
  });

  it("clears the highlight after 1.5 seconds and flashes again on a new reveal", () => {
    vi.useFakeTimers();
    const { rerender } = renderCards({ reveal: null });
    rerender({ reveal: { index: 0, key: 1 } });
    const card = () => screen.getAllByRole("listitem")[0];
    expect(card()).toHaveAttribute("data-highlight", "true");

    act(() => {
      vi.advanceTimersByTime(1499);
    });
    expect(card()).toHaveAttribute("data-highlight", "true");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(card()).not.toHaveAttribute("data-highlight");

    rerender({ reveal: { index: 0, key: 2 } });
    expect(card()).toHaveAttribute("data-highlight", "true");
    expect(card()).toHaveFocus();
  });
});
