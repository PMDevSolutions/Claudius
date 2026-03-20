import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ChatToggleButton } from "../ChatToggleButton";

describe("ChatToggleButton", () => {
  it("renders with chat icon when closed", () => {
    render(<ChatToggleButton isOpen={false} onClick={vi.fn()} />);
    const button = screen.getByRole("button", { name: /open chat/i });
    expect(button).toBeInTheDocument();
  });

  it("renders with close icon when open", () => {
    render(<ChatToggleButton isOpen={true} onClick={vi.fn()} />);
    const button = screen.getByRole("button", { name: /close chat/i });
    expect(button).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ChatToggleButton isOpen={false} onClick={onClick} />);

    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
