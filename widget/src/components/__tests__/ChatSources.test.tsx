import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ChatSources } from "../ChatSources";
import type { Source } from "../../api/types";

const mockSources: Source[] = [
  { url: "https://pmds.info/blog/seo-tips", title: "SEO Tips", type: "blog" },
  { url: "https://pmds.info/blog/web-design", title: "Web Design Guide", type: "blog" },
  { url: "https://pmds.info/services", title: "Our Services", type: "page" },
  { url: "https://example.com/resource", title: "External Resource", type: "external" },
];

describe("ChatSources", () => {
  it("renders source count header", () => {
    render(<ChatSources sources={mockSources} onClose={vi.fn()} />);
    expect(screen.getByText("4 sources found")).toBeInTheDocument();
  });

  it("renders singular count for one source", () => {
    render(<ChatSources sources={[mockSources[0]]} onClose={vi.fn()} />);
    expect(screen.getByText("1 source found")).toBeInTheDocument();
  });

  it("renders Sources heading", () => {
    render(<ChatSources sources={mockSources} onClose={vi.fn()} />);
    expect(screen.getByText("Sources")).toBeInTheDocument();
  });

  it("groups sources by type with blogs first", () => {
    render(<ChatSources sources={mockSources} onClose={vi.fn()} />);
    const headings = screen.getAllByRole("heading", { level: 4 });
    const texts = headings.map((h) => h.textContent);
    expect(texts).toEqual(["Blog", "Page", "External"]);
  });

  it("does not render empty type groups", () => {
    const blogOnly = mockSources.filter((s) => s.type === "blog");
    render(<ChatSources sources={blogOnly} onClose={vi.fn()} />);
    expect(screen.queryByText("Page")).not.toBeInTheDocument();
    expect(screen.queryByText("External")).not.toBeInTheDocument();
  });

  it("renders source titles as links", () => {
    render(<ChatSources sources={mockSources} onClose={vi.fn()} />);
    const link = screen.getByRole("link", { name: /SEO Tips/i });
    expect(link).toHaveAttribute("href", "https://pmds.info/blog/seo-tips");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("displays domain for each source", () => {
    render(<ChatSources sources={mockSources} onClose={vi.fn()} />);
    expect(screen.getAllByText("pmds.info").length).toBeGreaterThanOrEqual(1);
  });

  it("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ChatSources sources={mockSources} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
