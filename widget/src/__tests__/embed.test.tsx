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
