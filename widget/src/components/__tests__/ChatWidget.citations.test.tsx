import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChatWidget } from "../ChatWidget";
import type { Source } from "../../api/types";

const sources: Source[] = [
  {
    url: "https://example.com/pricing",
    title: "Pricing",
    type: "page",
    snippet: "Plans start at $10.",
  },
  { url: "https://example.com/faq", title: "FAQ", type: "page" },
];

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// A JSON reply on the stream endpoint: the client treats it as a blocking
// reply, so one mock serves both endpoints.
function jsonReply(reply: string) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "Content-Type": "application/json" }),
    json: () => Promise.resolve({ reply, sources }),
  };
}

// Locale-independent: the toggle is the only button before the chat opens,
// and the composer is the only textbox after.
async function ask(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button"));
  await user.type(screen.getByRole("textbox"), "Prices?");
  await user.keyboard("{Enter}");
  // Scoped to the log: the live region repeats the reply text.
  await log().findByText(/Plans start at/);
}

const log = () => within(screen.getByRole("log"));

function sentBody(): Record<string, unknown> {
  return JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
}

describe("ChatWidget citations option", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(jsonReply("Plans start at $10 [1]."));
    sessionStorage.clear();
  });

  it("is off by default: literal markers, the source icon, and no request flag", async () => {
    const user = userEvent.setup();
    render(<ChatWidget apiUrl="https://test.workers.dev" locale="en" />);
    await ask(user);
    expect(log().getByText("Plans start at $10 [1].")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Source \d/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: /view sources/i }),
    ).toBeInTheDocument();
    expect(sentBody()).not.toHaveProperty("citations");
  });

  it("renders chips and asks the worker for citations when enabled", async () => {
    const user = userEvent.setup();
    render(
      <ChatWidget apiUrl="https://test.workers.dev" locale="en" citations />,
    );
    await ask(user);
    expect(
      screen.getByRole("button", { name: "Source 1: Pricing" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /view sources/i })).toBeNull();
    expect(sentBody().citations).toBe(true);
  });

  it.each([["true"], ["false"], [1], [[]]])(
    "fails closed for %j, which is neither true nor an options object",
    async (value) => {
      const user = userEvent.setup();
      render(
        <ChatWidget
          apiUrl="https://test.workers.dev"
          locale="en"
          citations={value as unknown as boolean}
        />,
      );
      await ask(user);
      expect(log().getByText("Plans start at $10 [1].")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Source \d/ })).toBeNull();
      expect(sentBody()).not.toHaveProperty("citations");
    },
  );

  it("applies maxSources and favicons from an options object", async () => {
    const user = userEvent.setup();
    render(
      <ChatWidget
        apiUrl="https://test.workers.dev"
        locale="en"
        citations={{ maxSources: 1, favicons: false }}
      />,
    );
    await ask(user);
    await user.click(screen.getByRole("button", { name: "Source 1: Pricing" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Show all (2)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("listitem").querySelector("img")).toBeNull();
  });

  it("labels chips in the widget's language", async () => {
    const user = userEvent.setup();
    render(
      <ChatWidget apiUrl="https://test.workers.dev" locale="de" citations />,
    );
    await ask(user);
    expect(
      screen.getByRole("button", { name: "Quelle 1: Pricing" }),
    ).toBeInTheDocument();
  });
});
