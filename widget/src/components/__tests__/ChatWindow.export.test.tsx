import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ChatWindow } from "../ChatWindow";
import type { ChatMessage } from "../../api/types";

const messages: ChatMessage[] = [
  { id: "msg-1", role: "user", content: "What are your prices?" },
  { id: "msg-2", role: "assistant", content: "Plans start at $10." },
];

function renderWindow(
  props: Partial<React.ComponentProps<typeof ChatWindow>> = {},
) {
  const onClose = vi.fn();
  render(
    <ChatWindow
      messages={messages}
      isLoading={false}
      error={null}
      onSend={vi.fn()}
      onClose={onClose}
      conversationExport
      {...props}
    />,
  );
  return { onClose, user: userEvent.setup() };
}

describe("ChatWindow conversation export", () => {
  it("renders no menu and no extra status region by default", () => {
    renderWindow({ conversationExport: false });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More options" })).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("puts the menu in the header, before the close button", () => {
    renderWindow();
    const buttons = within(screen.getByRole("dialog")).getAllByRole("button");
    const names = buttons.map((b) => b.getAttribute("aria-label"));
    // Both present first: two absent buttons would also satisfy -1 === 0 - 1.
    expect(names.indexOf("More options")).toBeGreaterThanOrEqual(0);
    expect(names.indexOf("Close chat")).toBeGreaterThanOrEqual(0);
    expect(names.indexOf("More options")).toBe(names.indexOf("Close chat") - 1);
  });

  it("offers the three actions", async () => {
    const { user } = renderWindow();
    await user.click(screen.getByRole("button", { name: "More options" }));
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "Copy as Markdown",
      "Download as Markdown",
      "Download as JSON",
    ]);
  });

  it("disables the actions while empty and while a reply is in flight", async () => {
    const { user } = renderWindow({ messages: [] });
    await user.click(screen.getByRole("button", { name: "More options" }));
    for (const item of screen.getAllByRole("menuitem")) {
      expect(item).toHaveAttribute("aria-disabled", "true");
    }
  });

  it("disables the actions while loading", async () => {
    const { user } = renderWindow({ isLoading: true });
    await user.click(screen.getByRole("button", { name: "More options" }));
    for (const item of screen.getAllByRole("menuitem")) {
      expect(item).toHaveAttribute("aria-disabled", "true");
    }
  });

  it("copies the transcript and announces it", async () => {
    const { user } = renderWindow();
    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.click(
      screen.getByRole("menuitem", { name: "Copy as Markdown" }),
    );

    expect(await screen.findByText("Copied to clipboard")).toBeInTheDocument();
    expect(
      screen.getByText("Copied to clipboard").closest('[role="status"]'),
    ).not.toBeNull();
    const copied = await navigator.clipboard.readText();
    expect(copied).toContain("## User\n\nWhat are your prices?");
    expect(copied).toContain("## Assistant\n\nPlans start at $10.");
  });

  it("clears the last status when the menu is opened again", async () => {
    const { user } = renderWindow();
    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.click(
      screen.getByRole("menuitem", { name: "Copy as Markdown" }),
    );
    await screen.findByText("Copied to clipboard");

    await user.click(screen.getByRole("button", { name: "More options" }));

    expect(screen.queryByText("Copied to clipboard")).toBeNull();
  });

  it("closes only the menu on the first Escape, and the chat on the second", async () => {
    const { user, onClose } = renderWindow();
    await user.click(screen.getByRole("button", { name: "More options" }));

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores an Escape that something else already handled", () => {
    const { onClose } = renderWindow();
    // A listener on body runs before the chat's listener on document.
    const handle = (event: Event) => event.preventDefault();
    document.body.addEventListener("keydown", handle);

    fireEvent.keyDown(document.body, { key: "Escape" });

    document.body.removeEventListener("keydown", handle);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("uses the translated labels", async () => {
    const { locales } = await import("../../locales");
    const { user } = renderWindow({ translations: locales.fr });
    await user.click(screen.getByRole("button", { name: "Plus d'options" }));
    expect(
      screen.getByRole("menuitem", { name: "Copier en Markdown" }),
    ).toBeInTheDocument();
  });

  it("tabs out of the open menu to the close button, closing the menu", async () => {
    const { user } = renderWindow();
    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.keyboard("{End}");
    expect(
      screen.getByRole("menuitem", { name: "Download as JSON" }),
    ).toHaveFocus();

    await user.keyboard("{Tab}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "Close chat" })).toHaveFocus();
  });

  it("keeps the focus trap wrapping now that the menu trigger is the first control", async () => {
    const { user } = renderWindow();
    const trigger = screen.getByRole("button", { name: "More options" });
    trigger.focus();

    await user.keyboard("{Shift>}{Tab}{/Shift}");

    // Wrapped to the dialog's last focusable control, not out of the dialog.
    expect(trigger).not.toHaveFocus();
    expect(screen.getByRole("dialog")).toContainElement(
      document.activeElement as HTMLElement,
    );
  });
});
