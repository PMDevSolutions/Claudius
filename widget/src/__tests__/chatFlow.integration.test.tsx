import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ChatWidget } from "../components/ChatWidget";
import { MockChatApiClient } from "../test-utils/MockChatApiClient";
import { ChatApiError } from "../api/errors";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>(
    "../api/client",
  );
  return {
    ...actual,
    ChatApiClient: vi.fn(),
  };
});

let mock: MockChatApiClient;

beforeEach(async () => {
  sessionStorage.clear();
  mock = new MockChatApiClient();
  const { ChatApiClient } = await import("../api/client");
  (ChatApiClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    function MockChatApiClientCtor() {
      return mock;
    },
  );
});

async function openWidget() {
  const user = userEvent.setup();
  render(<ChatWidget apiUrl="https://test.workers.dev" />);
  await user.click(screen.getByRole("button", { name: /open chat/i }));
  return user;
}

describe("ChatWidget integration: send → receive → display", () => {
  it("opens, sends a user message, shows the typing indicator, and renders the assistant reply", async () => {
    const pending = mock.mockPending();
    const user = await openWidget();

    const log = await screen.findByRole("log");
    expect(within(log).getByText(/How can I help you today/i)).toBeInTheDocument();

    const input = screen.getByLabelText(/type your message/i);
    await user.type(input, "What are your prices?");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    // User message appears immediately and the typing indicator surfaces.
    expect(within(log).getByText("What are your prices?")).toBeInTheDocument();
    expect(
      await screen.findByRole("status", { name: /assistant is typing/i }),
    ).toBeInTheDocument();

    // The mock client received the user message verbatim.
    expect(mock.lastCall).toHaveLength(1);
    expect(mock.lastCall![0]).toMatchObject({
      role: "user",
      content: "What are your prices?",
    });

    // Resolve the in-flight request.
    pending.resolve({ reply: "Plans start at $1,000/month." });

    // Assistant reply renders and the typing indicator disappears.
    await waitFor(() => {
      expect(within(log).getByText(/Plans start at \$1,000/)).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("status", { name: /assistant is typing/i }),
    ).not.toBeInTheDocument();
  });

  it("renders sources on assistant replies", async () => {
    mock.mockReply({
      reply: "Here are some resources.",
      sources: [
        { url: "https://pmds.info/pricing", title: "Pricing", type: "page" },
      ],
    });

    const user = await openWidget();
    await user.type(screen.getByLabelText(/type your message/i), "Tell me more");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    const log = await screen.findByRole("log");
    await waitFor(() => {
      expect(within(log).getByText(/Here are some resources/)).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /view sources/i }),
    ).toBeInTheDocument();
  });

  it("shows error + Retry on network failure, then recovers when the user retries", async () => {
    mock.mockNetworkError();

    const user = await openWidget();
    await user.type(screen.getByLabelText(/type your message/i), "Hello");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    const errorAlert = await screen.findByRole("alert");
    expect(errorAlert).toHaveTextContent(/connect/i);

    const retryBtn = await screen.findByRole("button", { name: /retry/i });

    // The user's message is preserved during the failure.
    expect(within(screen.getByRole("log")).getByText("Hello")).toBeInTheDocument();

    // Network recovers; clicking Retry re-sends without duplicating the user turn.
    mock.mockReply({ reply: "Welcome back!" });
    await user.click(retryBtn);

    const log = await screen.findByRole("log");
    await waitFor(() => {
      expect(within(log).getByText(/Welcome back/)).toBeInTheDocument();
    });

    // Two sendMessage calls, both with exactly one user message.
    expect(mock.calls).toHaveLength(2);
    expect(mock.calls[0]).toHaveLength(1);
    expect(mock.calls[1]).toHaveLength(1);
    expect(mock.calls[1][0]).toMatchObject({ role: "user", content: "Hello" });

    // Error and Retry button both clear after success.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /retry/i }),
    ).not.toBeInTheDocument();
  });

  it("does not show Retry on validation errors (non-recoverable)", async () => {
    mock.mockError(
      new ChatApiError("Invalid input", 400, "VALIDATION_ERROR"),
    );

    const user = await openWidget();
    await user.type(screen.getByLabelText(/type your message/i), "...");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    await screen.findByRole("alert");
    expect(
      screen.queryByRole("button", { name: /retry/i }),
    ).not.toBeInTheDocument();
  });

  it("persists the conversation across remounts via sessionStorage", async () => {
    mock.mockReply({ reply: "Hello!" });

    const user = userEvent.setup();
    const { unmount } = render(<ChatWidget apiUrl="https://test.workers.dev" />);
    await user.click(screen.getByRole("button", { name: /open chat/i }));
    await user.type(screen.getByLabelText(/type your message/i), "Hi there");
    await user.click(screen.getByRole("button", { name: /send message/i }));
    {
      const log = await screen.findByRole("log");
      await waitFor(() => {
        expect(within(log).getByText("Hello!")).toBeInTheDocument();
      });
    }

    unmount();

    // Remount as if the page was navigated within the same tab.
    render(<ChatWidget apiUrl="https://test.workers.dev" />);
    await user.click(screen.getByRole("button", { name: /open chat/i }));

    const log = await screen.findByRole("log");
    expect(within(log).getByText("Hi there")).toBeInTheDocument();
    expect(within(log).getByText("Hello!")).toBeInTheDocument();
  });
});
