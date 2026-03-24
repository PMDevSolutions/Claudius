import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { SourceIcon } from "../SourceIcon";

describe("SourceIcon", () => {
  it("renders with source count badge", () => {
    render(<SourceIcon count={3} isActive={false} onClick={vi.fn()} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("has tooltip text", () => {
    render(<SourceIcon count={2} isActive={false} onClick={vi.fn()} />);
    const button = screen.getByRole("button", { name: /view sources/i });
    expect(button).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<SourceIcon count={1} isActive={false} onClick={onClick} />);
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("applies active styling when isActive is true", () => {
    render(<SourceIcon count={2} isActive={true} onClick={vi.fn()} />);
    const button = screen.getByRole("button");
    expect(button.className).toContain("bg-claudius-primary");
  });

  it("applies inactive styling when isActive is false", () => {
    render(<SourceIcon count={2} isActive={false} onClick={vi.fn()} />);
    const button = screen.getByRole("button");
    expect(button.className).not.toContain("bg-claudius-primary");
  });
});
