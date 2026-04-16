import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { useRef } from "react";
import { useFocusTrap } from "../useFocusTrap";

function Harness({ active }: { active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, active);
  return (
    <>
      <button>outside-before</button>
      <div ref={ref}>
        <button>first</button>
        <button>middle</button>
        <button>last</button>
      </div>
      <button>outside-after</button>
    </>
  );
}

describe("useFocusTrap", () => {
  it("cycles forward from last to first on Tab", async () => {
    const user = userEvent.setup();
    render(<Harness active={true} />);
    screen.getByText("last").focus();
    await user.tab();
    expect(screen.getByText("first")).toHaveFocus();
  });

  it("cycles backward from first to last on Shift+Tab", async () => {
    const user = userEvent.setup();
    render(<Harness active={true} />);
    screen.getByText("first").focus();
    await user.tab({ shift: true });
    expect(screen.getByText("last")).toHaveFocus();
  });

  it("does nothing when inactive", async () => {
    const user = userEvent.setup();
    render(<Harness active={false} />);
    screen.getByText("last").focus();
    await user.tab();
    expect(screen.getByText("outside-after")).toHaveFocus();
  });
});
