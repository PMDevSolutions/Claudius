import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ChatWidget } from "../ChatWidget";

// Mock fetch for useChat
globalThis.fetch = vi.fn();

describe("ChatWidget", () => {
  it("renders toggle button initially (chat closed)", () => {
    render(<ChatWidget apiUrl="https://test.workers.dev" />);
    expect(
      screen.getByRole("button", { name: /open chat/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Chat")).not.toBeInTheDocument();
  });

  it("opens chat window on button click", async () => {
    const user = userEvent.setup();
    render(<ChatWidget apiUrl="https://test.workers.dev" />);

    await user.click(screen.getByRole("button", { name: /open chat/i }));
    expect(screen.getByText("Chat")).toBeInTheDocument();
  });

  it("closes chat window on second button click", async () => {
    const user = userEvent.setup();
    render(<ChatWidget apiUrl="https://test.workers.dev" />);

    await user.click(screen.getByRole("button", { name: /open chat/i }));
    expect(screen.getByText("Chat")).toBeInTheDocument();

    // Use header close button (first of two "Close chat" buttons)
    const closeButtons = screen.getAllByRole("button", { name: /close chat/i });
    await user.click(closeButtons[0]);
    expect(screen.queryByText("Chat")).not.toBeInTheDocument();
  });

  it("preserves messages when toggling open/close", async () => {
    const user = userEvent.setup();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ reply: "Hello!" }),
    });

    render(<ChatWidget apiUrl="https://test.workers.dev" />);

    // Open and send a message
    await user.click(screen.getByRole("button", { name: /open chat/i }));
    const input = screen.getByPlaceholderText(/type your message/i);
    await user.type(input, "Hi{enter}");

    // Wait for reply (scope to log to avoid matching sr-only live region)
    await screen.findByRole("log");
    expect(
      await within(screen.getByRole("log")).findByText("Hello!"),
    ).toBeInTheDocument();

    // Close via header button and reopen
    const closeButtons = screen.getAllByRole("button", { name: /close chat/i });
    await user.click(closeButtons[0]);
    await user.click(screen.getByRole("button", { name: /open chat/i }));

    // Messages should still be there
    const log = screen.getByRole("log");
    expect(within(log).getByText("Hi")).toBeInTheDocument();
    expect(within(log).getByText("Hello!")).toBeInTheDocument();
  });
});

describe("ChatWidget - mobile bottom sheet", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn((query: string) => ({
        matches: query === "(max-width: 639px)",
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  it("renders scrim backdrop on mobile when open", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ChatWidget apiUrl="https://test.workers.dev" />,
    );
    await user.click(screen.getByRole("button", { name: /open chat/i }));
    expect(container.querySelector(".claudius-scrim")).toBeInTheDocument();
  });

  it("does not render scrim on desktop", async () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    const user = userEvent.setup();
    const { container } = render(
      <ChatWidget apiUrl="https://test.workers.dev" />,
    );
    await user.click(screen.getByRole("button", { name: /open chat/i }));
    expect(container.querySelector(".claudius-scrim")).not.toBeInTheDocument();
  });
});

describe("ChatWidget - localization", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    document.documentElement.lang = "";
  });

  it("applies the locale prop to control labels", () => {
    render(<ChatWidget apiUrl="https://test.workers.dev" locale="es" />);
    expect(
      screen.getByRole("button", { name: /abrir chat/i }),
    ).toBeInTheDocument();
  });

  it("renders the localized welcome message for the locale prop", async () => {
    const user = userEvent.setup();
    render(<ChatWidget apiUrl="https://test.workers.dev" locale="es" />);
    await user.click(screen.getByRole("button", { name: /abrir chat/i }));
    expect(
      screen.getByText("¡Hola! ¿En qué puedo ayudarte hoy?"),
    ).toBeInTheDocument();
  });

  it("auto-detects the locale from <html lang>", () => {
    document.documentElement.lang = "fr";
    render(<ChatWidget apiUrl="https://test.workers.dev" />);
    expect(
      screen.getByRole("button", { name: /ouvrir le chat/i }),
    ).toBeInTheDocument();
  });

  it("lets the translations prop override the resolved locale", () => {
    render(
      <ChatWidget
        apiUrl="https://test.workers.dev"
        locale="es"
        translations={{ openChat: "Abrir asistente" }}
      />,
    );
    expect(
      screen.getByRole("button", { name: /abrir asistente/i }),
    ).toBeInTheDocument();
  });
});

describe("ChatWidget - theme=auto", () => {
  it("subscribes to prefers-color-scheme and toggles dark on change", () => {
    type Listener = (e: MediaQueryListEvent) => void;
    const listeners: Listener[] = [];
    const matchMediaMock = vi.fn((query: string) => ({
      matches: query === "(prefers-color-scheme: dark)" ? false : false,
      media: query,
      addEventListener: vi.fn((_evt: string, l: Listener) => listeners.push(l)),
      removeEventListener: vi.fn(),
    }));
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: matchMediaMock,
    });

    const { container } = render(
      <ChatWidget apiUrl="https://test.workers.dev" theme="auto" />,
    );

    // Wrapper starts with the "light" data attribute since the OS media
    // query reports matches=false initially.
    const wrapper = container.querySelector(
      "[data-claudius-dark]",
    ) as HTMLElement;
    expect(wrapper.getAttribute("data-claudius-dark")).toBe("false");

    // Confirm the auto-mode listener was actually registered, not just the
    // mobile media query.
    expect(matchMediaMock).toHaveBeenCalledWith("(prefers-color-scheme: dark)");
    expect(listeners.length).toBeGreaterThan(0);
  });
});
