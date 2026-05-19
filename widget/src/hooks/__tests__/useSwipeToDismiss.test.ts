import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSwipeToDismiss } from "../useSwipeToDismiss";

const createRef = (scrollTop = 0) => {
  const el = document.createElement("div");
  Object.defineProperty(el, "scrollTop", { value: scrollTop, writable: true });
  Object.defineProperty(el, "getBoundingClientRect", {
    value: () => ({ height: 600 }),
  });
  return { current: el };
};

const fireTouch = (
  el: HTMLElement,
  type: "touchstart" | "touchmove" | "touchend",
  clientY: number,
) => {
  const event = new TouchEvent(type, {
    touches: type === "touchend" ? [] : [{ clientY } as Touch],
    changedTouches: [{ clientY } as Touch],
  });
  el.dispatchEvent(event);
};

describe("useSwipeToDismiss", () => {
  let onDismiss: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onDismiss = vi.fn();
  });

  it("returns offsetY of 0 initially", () => {
    const ref = createRef();
    const { result } = renderHook(() =>
      useSwipeToDismiss(ref, onDismiss, true),
    );

    expect(result.current.offsetY).toBe(0);
  });

  it("does not attach listeners when disabled", () => {
    const ref = createRef();
    const addSpy = vi.spyOn(ref.current, "addEventListener");

    renderHook(() => useSwipeToDismiss(ref, onDismiss, false));

    expect(addSpy).not.toHaveBeenCalled();
  });

  it("tracks vertical drag distance", () => {
    const ref = createRef();
    const { result } = renderHook(() =>
      useSwipeToDismiss(ref, onDismiss, true),
    );

    act(() => {
      fireTouch(ref.current, "touchstart", 300);
      fireTouch(ref.current, "touchmove", 400);
    });

    expect(result.current.offsetY).toBe(100);
  });

  it("calls onDismiss when dragged past 30% threshold", () => {
    const ref = createRef();
    renderHook(() => useSwipeToDismiss(ref, onDismiss, true));

    // 30% of 600 = 180, so dragging 200 should exceed threshold
    act(() => {
      fireTouch(ref.current, "touchstart", 200);
      fireTouch(ref.current, "touchmove", 400);
      fireTouch(ref.current, "touchend", 400);
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("snaps back when drag is below threshold", () => {
    const ref = createRef();
    const { result } = renderHook(() =>
      useSwipeToDismiss(ref, onDismiss, true),
    );

    // 30% of 600 = 180, so dragging 100 should snap back
    act(() => {
      fireTouch(ref.current, "touchstart", 300);
      fireTouch(ref.current, "touchmove", 400);
      fireTouch(ref.current, "touchend", 400);
    });

    expect(onDismiss).not.toHaveBeenCalled();
    expect(result.current.offsetY).toBe(0);
  });

  it("does not activate swipe when scrollTop > 0", () => {
    const ref = createRef(50);
    const { result } = renderHook(() =>
      useSwipeToDismiss(ref, onDismiss, true),
    );

    act(() => {
      fireTouch(ref.current, "touchstart", 200);
      fireTouch(ref.current, "touchmove", 500);
      fireTouch(ref.current, "touchend", 500);
    });

    expect(onDismiss).not.toHaveBeenCalled();
    expect(result.current.offsetY).toBe(0);
  });
});
