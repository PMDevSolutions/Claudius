import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { HeaderMenu, type HeaderMenuItem } from "../HeaderMenu";

function setup(overrides: Partial<HeaderMenuItem>[] = []) {
  const items: HeaderMenuItem[] = ["Copy", "Download", "Archive"].map(
    (label, i) => ({
      id: label.toLowerCase(),
      label,
      onSelect: vi.fn(),
      ...overrides[i],
    }),
  );
  const onOpen = vi.fn();
  // The sibling stands in for the header's close button, so Tab has
  // somewhere to go.
  render(
    <>
      <HeaderMenu label="More options" items={items} onOpen={onOpen} />
      <button type="button">Close chat</button>
    </>,
  );
  return {
    items,
    onOpen,
    user: userEvent.setup(),
    trigger: screen.getByRole("button", { name: "More options" }),
  };
}

describe("HeaderMenu", () => {
  it("is a closed menu button until it is used", () => {
    const { trigger } = setup();
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).not.toHaveAttribute("aria-controls");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens on click, labelled by its trigger, with focus on the first item", async () => {
    const { user, trigger, onOpen } = setup();
    await user.click(trigger);

    const menu = screen.getByRole("menu", { name: "More options" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls", menu.id);
    expect(screen.getByRole("menuitem", { name: "Copy" })).toHaveFocus();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("opens from the keyboard: Enter and ArrowDown on the first item, ArrowUp on the last", async () => {
    const { user, trigger } = setup();
    trigger.focus();

    await user.keyboard("{Enter}");
    expect(screen.getByRole("menuitem", { name: "Copy" })).toHaveFocus();
    await user.keyboard("{Escape}");

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Copy" })).toHaveFocus();
    await user.keyboard("{Escape}");

    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Archive" })).toHaveFocus();
  });

  it("moves with the arrows, wrapping, and jumps with Home and End", async () => {
    const { user, trigger } = setup();
    await user.click(trigger);

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Download" })).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Copy" })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Archive" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("menuitem", { name: "Copy" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Archive" })).toHaveFocus();
  });

  it("keeps its items out of the tab order", async () => {
    const { user, trigger } = setup();
    await user.click(trigger);
    for (const item of screen.getAllByRole("menuitem")) {
      expect(item).toHaveAttribute("tabindex", "-1");
    }
  });

  it("runs the chosen item, closes, and returns focus to the trigger", async () => {
    const { user, trigger, items } = setup();
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Download" }));

    expect(items[1].onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("activates the focused item with Enter", async () => {
    const { user, trigger, items } = setup();
    await user.click(trigger);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(items[1].onSelect).toHaveBeenCalledTimes(1);
  });

  it("keeps a disabled item focusable but inert, and stays open", async () => {
    const { user, trigger, items } = setup([{ disabled: true }]);
    await user.click(trigger);
    const copy = screen.getByRole("menuitem", { name: "Copy" });

    expect(copy).toHaveAttribute("aria-disabled", "true");
    expect(copy).not.toBeDisabled();
    expect(copy).toHaveFocus();
    await user.click(copy);

    expect(items[0].onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("closes on Escape, returns focus, and keeps the key from the page", async () => {
    const onDocumentKeyDown = vi.fn();
    document.addEventListener("keydown", onDocumentKeyDown);
    const { user, trigger } = setup();
    await user.click(trigger);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
    expect(onDocumentKeyDown).not.toHaveBeenCalled();
    document.removeEventListener("keydown", onDocumentKeyDown);
  });

  it("lets Escape through when it is closed", async () => {
    const onDocumentKeyDown = vi.fn();
    document.addEventListener("keydown", onDocumentKeyDown);
    const { user, trigger } = setup();
    trigger.focus();

    await user.keyboard("{Escape}");

    expect(onDocumentKeyDown).toHaveBeenCalledTimes(1);
    document.removeEventListener("keydown", onDocumentKeyDown);
  });

  it("closes on Tab once focus has moved on to the next control", async () => {
    const { user, trigger } = setup();
    await user.click(trigger);
    await user.keyboard("{Tab}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "Close chat" })).toHaveFocus();
  });

  it("closes on Shift+Tab with focus back on the trigger", async () => {
    const { user, trigger } = setup();
    await user.click(trigger);
    await user.keyboard("{Shift>}{Tab}{/Shift}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("closes on a press outside, and on a second click of the trigger", async () => {
    const { user, trigger } = setup();
    await user.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();

    await user.click(trigger);
    await user.click(trigger);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
