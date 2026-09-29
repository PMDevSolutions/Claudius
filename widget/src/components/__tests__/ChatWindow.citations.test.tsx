import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ChatWindow } from "../ChatWindow";
import { de } from "../../locales/de";
import type { ChatMessage, Source } from "../../api/types";

const sources: Source[] = [
  { url: "https://example.com/pricing", title: "Pricing", type: "page" },
];

const messages: ChatMessage[] = [
  { id: "msg-1", role: "user", content: "What are your prices?" },
  {
    id: "msg-2",
    role: "assistant",
    content: "Plans start at $10 [1].",
    sources,
  },
];

const config = { maxSources: 5, favicons: false };

function renderWindow(
  props: Partial<React.ComponentProps<typeof ChatWindow>> = {},
) {
  render(
    <ChatWindow
      messages={messages}
      isLoading={false}
      error={null}
      onSend={vi.fn()}
      onClose={vi.fn()}
      citations={config}
      {...props}
    />,
  );
  return userEvent.setup();
}

const liveText = () =>
  document.querySelector('[data-claudius-live="assistant"]')!.textContent;

describe("ChatWindow citations", () => {
  it("renders chips and the footer, and never the sidebar", async () => {
    const user = renderWindow();
    await user.click(screen.getByRole("button", { name: "Source 1: Pricing" }));
    expect(screen.getByRole("list", { name: "Sources" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /view sources/i })).toBeNull();
    expect(screen.queryByText("1 source found")).toBeNull();
  });

  it("keeps the source icon and sidebar when citations are off", async () => {
    const user = renderWindow({ citations: null });
    expect(screen.queryByRole("button", { name: /^Source \d/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: /view sources/i }));
    expect(screen.getByText("1 source found")).toBeInTheDocument();
  });

  it("strips citation markers from the live region", () => {
    renderWindow();
    expect(liveText()).toBe("Plans start at $10.");
  });

  it("leaves the markers in the live region when citations are off", () => {
    renderWindow({ citations: null });
    expect(liveText()).toBe("Plans start at $10 [1].");
  });

  it("labels chips and the footer in the widget's language", () => {
    renderWindow({ translations: de });
    expect(
      screen.getByRole("button", { name: "Quelle 1: Pricing" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Quellen/ }),
    ).toBeInTheDocument();
  });

  it("each cited reply keeps its own footer state", async () => {
    const user = renderWindow({
      messages: [
        ...messages,
        { id: "msg-3", role: "user", content: "And support?" },
        {
          id: "msg-4",
          role: "assistant",
          content: "Email support is included [1].",
          sources: [
            {
              url: "https://example.com/support",
              title: "Support",
              type: "page",
            },
          ],
        },
      ],
    });
    const toggles = screen.getAllByRole("button", { name: /^Sources/ });
    expect(toggles).toHaveLength(2);
    await user.click(toggles[0]);
    expect(toggles[0]).toHaveAttribute("aria-expanded", "true");
    expect(toggles[1]).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByRole("list", { name: "Sources" })).toHaveLength(1);
  });
});
