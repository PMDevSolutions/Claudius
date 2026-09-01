import { screen } from "@testing-library/react";
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
