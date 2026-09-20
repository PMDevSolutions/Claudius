import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ChatWidget } from "../ChatWidget";

globalThis.fetch = vi.fn();

// The toggle is the only button before the chat opens.
async function openChat() {
  await userEvent.setup().click(screen.getByRole("button"));
}

describe("ChatWidget conversationExport option", () => {
  it("is off by default", async () => {
    render(<ChatWidget apiUrl="https://test.workers.dev" locale="en" />);
    await openChat();
    expect(screen.queryByRole("button", { name: "More options" })).toBeNull();
  });

  it("shows the header menu when enabled", async () => {
    render(
      <ChatWidget
        apiUrl="https://test.workers.dev"
        locale="en"
        conversationExport
      />,
    );
    await openChat();
    expect(
      screen.getByRole("button", { name: "More options" }),
    ).toBeInTheDocument();
  });

  it.each([["true"], ["false"], [1], [{}]])(
    "fails closed for %j, which is not the literal true",
    async (value) => {
      render(
        <ChatWidget
          apiUrl="https://test.workers.dev"
          locale="en"
          conversationExport={value as unknown as boolean}
        />,
      );
      await openChat();
      expect(screen.queryByRole("button", { name: "More options" })).toBeNull();
    },
  );

  it("labels the menu in the widget's language", async () => {
    render(
      <ChatWidget
        apiUrl="https://test.workers.dev"
        locale="de"
        conversationExport
      />,
    );
    await openChat();
    expect(
      screen.getByRole("button", { name: "Weitere Optionen" }),
    ).toBeInTheDocument();
  });
});
