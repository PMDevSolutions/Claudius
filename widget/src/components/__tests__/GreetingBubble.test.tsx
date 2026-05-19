import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { GreetingBubble } from "../GreetingBubble";

describe("GreetingBubble", () => {
  it("renders the greeting message", () => {
    render(
      <GreetingBubble
        message="Need help getting started?"
        position="bottom-right"
        onOpen={vi.fn()}
        onDismiss={vi.fn()}
        dismissLabel="Dismiss greeting"
      />,
    );

    expect(screen.getByText("Need help getting started?")).toBeInTheDocument();
  });

  it("calls onOpen when the bubble body is clicked", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <GreetingBubble
        message="Hi"
        position="bottom-right"
        onOpen={onOpen}
        onDismiss={vi.fn()}
        dismissLabel="Dismiss greeting"
      />,
    );

    await user.click(screen.getByText("Hi"));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("calls onDismiss (and not onOpen) when the close button is clicked", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onDismiss = vi.fn();
    render(
      <GreetingBubble
        message="Hi"
        position="bottom-right"
        onOpen={onOpen}
        onDismiss={onDismiss}
        dismissLabel="Dismiss greeting"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Dismiss greeting" }));
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
  });
});
