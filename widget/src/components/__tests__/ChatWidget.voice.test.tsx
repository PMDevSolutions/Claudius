import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ChatWidget } from "../ChatWidget";
import {
  installFakeSpeechRecognition,
  uninstallFakeSpeechRecognition,
  latestRecognition,
} from "../../test-utils/fakeSpeechRecognition";

globalThis.fetch = vi.fn();

// The toggle is the only button before the chat opens; its label depends on
// the locale under test.
async function openChat() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button"));
}

describe("ChatWidget voice option", () => {
  beforeEach(() => {
    installFakeSpeechRecognition();
    document.documentElement.lang = "";
    Object.defineProperty(window.navigator, "language", {
      value: undefined,
      configurable: true,
    });
  });
  afterEach(() => uninstallFakeSpeechRecognition());

  it("is off by default, even in a browser that supports speech", async () => {
    render(<ChatWidget apiUrl="https://test.workers.dev" locale="en" />);
    await openChat();
    expect(screen.queryByRole("button", { name: "Voice input" })).toBeNull();
  });

  it("shows the mic when enabled", async () => {
    render(<ChatWidget apiUrl="https://test.workers.dev" locale="en" voice />);
    await openChat();
    expect(
      screen.getByRole("button", { name: "Voice input" }),
    ).toBeInTheDocument();
  });

  it("passes options through to the composer", async () => {
    render(
      <ChatWidget
        apiUrl="https://test.workers.dev"
        locale="en"
        voice={{ mode: "hold" }}
      />,
    );
    await openChat();
    expect(
      screen.getByRole("button", { name: "Hold to talk" }),
    ).toBeInTheDocument();
  });

  it("recognizes speech in the widget's locale", async () => {
    render(<ChatWidget apiUrl="https://test.workers.dev" locale="de" voice />);
    await openChat();

    fireEvent.click(screen.getByRole("button", { name: "Spracheingabe" }));

    expect(latestRecognition().lang).toBe("de-DE");
  });

  it("follows the detected locale when none is given", async () => {
    document.documentElement.lang = "fr-CA";
    render(<ChatWidget apiUrl="https://test.workers.dev" voice />);
    await openChat();

    fireEvent.click(screen.getByRole("button", { name: "Saisie vocale" }));

    expect(latestRecognition().lang).toBe("fr-CA");
  });
});
