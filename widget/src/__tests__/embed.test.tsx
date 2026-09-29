import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// embed.tsx auto-initializes on import by reading window.ClaudiusConfig, so
// each test sets the config first, then imports the module fresh.
describe("embed init via window.ClaudiusConfig", () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = "";
    window.sessionStorage.clear();
    window.ClaudiusConfig = undefined;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    window.ClaudiusConfig = undefined;
  });

  it("mounts the widget container from config", async () => {
    window.ClaudiusConfig = { apiUrl: "https://test.example/api" };
    await import("../embed");
    expect(document.getElementById("claudius-chat-widget")).not.toBeNull();
  });

  it("passes triggers through so a time-based greeting fires", async () => {
    window.ClaudiusConfig = {
      apiUrl: "https://test.example/api",
      triggers: [
        {
          on: "time",
          seconds: 0,
          action: { greeting: "Looking for a website quote?" },
        },
      ],
    };
    await import("../embed");
    expect(
      await screen.findByText("Looking for a website quote?"),
    ).toBeInTheDocument();
  });
});

describe("embed attachments option", () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = "";
    window.sessionStorage.clear();
    window.ClaudiusConfig = undefined;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    window.ClaudiusConfig = undefined;
  });

  it("enables the attach button from ClaudiusConfig", async () => {
    window.ClaudiusConfig = {
      apiUrl: "https://test.example/api",
      attachments: true,
    };
    await import("../embed");
    (await screen.findByRole("button", { name: /open chat/i })).click();
    expect(
      await screen.findByRole("button", { name: /attach a file/i }),
    ).toBeInTheDocument();
  });

  it("enables attachments via the web component attribute", async () => {
    await import("../embed");
    const el = document.createElement("claudius-chat");
    el.setAttribute("api-url", "https://test.example/api");
    el.setAttribute("attachments", "true");
    document.body.appendChild(el);
    (await screen.findByRole("button", { name: /open chat/i })).click();
    expect(
      await screen.findByRole("button", { name: /attach a file/i }),
    ).toBeInTheDocument();
  });
});

describe("embed voice option", () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = "";
    window.sessionStorage.clear();
    window.ClaudiusConfig = undefined;
    document.documentElement.lang = "en";
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition =
      class {
        start() {}
        stop() {}
        abort() {}
      };
  });

  afterEach(() => {
    document.body.innerHTML = "";
    window.ClaudiusConfig = undefined;
    document.documentElement.lang = "";
    delete (window as unknown as Record<string, unknown>)
      .webkitSpeechRecognition;
  });

  it("enables the mic from ClaudiusConfig", async () => {
    window.ClaudiusConfig = {
      apiUrl: "https://test.example/api",
      voice: { mode: "hold" },
    };
    await import("../embed");
    (await screen.findByRole("button", { name: /open chat/i })).click();
    expect(
      await screen.findByRole("button", { name: "Hold to talk" }),
    ).toBeInTheDocument();
  });

  it("enables the mic via web component attributes", async () => {
    await import("../embed");
    const el = document.createElement("claudius-chat");
    el.setAttribute("api-url", "https://test.example/api");
    el.setAttribute("voice", "");
    el.setAttribute("voice-mode", "hold");
    document.body.appendChild(el);
    (await screen.findByRole("button", { name: /open chat/i })).click();
    expect(
      await screen.findByRole("button", { name: "Hold to talk" }),
    ).toBeInTheDocument();
  });
});

describe("embed conversationExport option", () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = "";
    window.sessionStorage.clear();
    window.ClaudiusConfig = undefined;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    window.ClaudiusConfig = undefined;
  });

  async function openChat() {
    (await screen.findByRole("button", { name: /open chat/i })).click();
    await screen.findByRole("dialog");
  }

  function mountElement(attributes: Record<string, string>) {
    const el = document.createElement("claudius-chat");
    el.setAttribute("api-url", "https://test.example/api");
    for (const [name, value] of Object.entries(attributes)) {
      el.setAttribute(name, value);
    }
    document.body.appendChild(el);
  }

  /** The open dialog, so an absent menu cannot be a chat that never opened. */
  function expectNoMenu() {
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More options" })).toBeNull();
  }

  it("enables the header menu from ClaudiusConfig", async () => {
    window.ClaudiusConfig = {
      apiUrl: "https://test.example/api",
      conversationExport: true,
    };
    await import("../embed");
    await openChat();
    expect(
      screen.getByRole("button", { name: "More options" }),
    ).toBeInTheDocument();
  });

  it("stays off when ClaudiusConfig does not mention it", async () => {
    window.ClaudiusConfig = { apiUrl: "https://test.example/api" };
    await import("../embed");
    await openChat();
    expectNoMenu();
  });

  it("stays off for a templated string in ClaudiusConfig", async () => {
    window.ClaudiusConfig = {
      apiUrl: "https://test.example/api",
      conversationExport: "false" as unknown as boolean,
    };
    await import("../embed");
    await openChat();
    expectNoMenu();
  });

  // The attribute is stricter than `attachments` and `voice`, which take any
  // value but "false": a privacy switch has to fail closed for whatever a
  // template renders, and "False" is what Python and Jinja produce.
  it.each([[""], ["true"], ["TRUE"], [" true "]])(
    "enables it for conversation-export=%j",
    async (value) => {
      await import("../embed");
      mountElement({ "conversation-export": value });
      await openChat();
      expect(
        screen.getByRole("button", { name: "More options" }),
      ).toBeInTheDocument();
    },
  );

  it.each([["false"], ["False"], ["0"], ["no"], ["yes"], ["1"]])(
    "stays off for conversation-export=%j",
    async (value) => {
      await import("../embed");
      mountElement({ "conversation-export": value });
      await openChat();
      expectNoMenu();
    },
  );

  it("stays off when the attribute is absent", async () => {
    await import("../embed");
    mountElement({});
    await openChat();
    expectNoMenu();
  });
});

describe("embed citations option", () => {
  const mockFetch = vi.fn();
  const sources = [
    { url: "https://example.com/pricing", title: "Pricing", type: "page" },
    { url: "https://example.com/faq", title: "FAQ", type: "page" },
  ];

  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = "";
    window.sessionStorage.clear();
    window.ClaudiusConfig = undefined;
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      json: () =>
        Promise.resolve({ reply: "Plans start at $10 [1].", sources }),
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    window.ClaudiusConfig = undefined;
  });

  function mountElement(attributes: Record<string, string>) {
    const el = document.createElement("claudius-chat");
    el.setAttribute("api-url", "https://test.example/api");
    for (const [name, value] of Object.entries(attributes)) {
      el.setAttribute(name, value);
    }
    document.body.appendChild(el);
  }

  async function ask() {
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /open chat/i }));
    await user.type(screen.getByLabelText(/type your message/i), "Prices?");
    await user.keyboard("{Enter}");
    // Scoped to the log: the live region repeats the reply text.
    await within(screen.getByRole("log")).findByText(/Plans start at/);
    return user;
  }

  function sentBody(): Record<string, unknown> {
    return JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string,
    );
  }

  it("enables chips from ClaudiusConfig", async () => {
    window.ClaudiusConfig = {
      apiUrl: "https://test.example/api",
      citations: true,
    };
    await import("../embed");
    await ask();
    expect(
      screen.getByRole("button", { name: "Source 1: Pricing" }),
    ).toBeInTheDocument();
    expect(sentBody().citations).toBe(true);
  });

  it("enables chips for a bare citations attribute", async () => {
    await import("../embed");
    mountElement({ citations: "" });
    await ask();
    expect(
      screen.getByRole("button", { name: "Source 1: Pricing" }),
    ).toBeInTheDocument();
    expect(sentBody().citations).toBe(true);
  });

  it('stays off for citations="false"', async () => {
    await import("../embed");
    mountElement({ citations: "false" });
    await ask();
    expect(
      within(screen.getByRole("log")).getByText("Plans start at $10 [1]."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Source \d/ })).toBeNull();
    expect(sentBody()).not.toHaveProperty("citations");
  });

  it("reads the companion attributes", async () => {
    await import("../embed");
    mountElement({
      citations: "true",
      "citations-max-sources": "1",
      "citations-favicons": "false",
    });
    const user = await ask();
    await user.click(screen.getByRole("button", { name: "Source 1: Pricing" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Show all (2)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("listitem").querySelector("img")).toBeNull();
  });
});
