import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useTriggers, matchesUrl, type Trigger } from "../useTriggers";

describe("matchesUrl", () => {
  it("does case-insensitive substring match for strings", () => {
    expect(matchesUrl("/pricing", "https://example.com/Pricing")).toBe(true);
    expect(matchesUrl("/about", "https://example.com/pricing")).toBe(false);
  });

  it("uses RegExp.test for regex patterns", () => {
    expect(matchesUrl(/^https:\/\/.*\/pricing/, "https://x.com/pricing")).toBe(
      true,
    );
    expect(matchesUrl(/^https:\/\/.*\/pricing/, "http://x.com/pricing")).toBe(
      false,
    );
  });
});

describe("useTriggers", () => {
  let onOpen: ReturnType<typeof vi.fn>;
  let onGreeting: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    onOpen = vi.fn();
    onGreeting = vi.fn();
    Object.defineProperty(window, "location", {
      writable: true,
      value: { href: "https://example.com/pricing" },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires a time trigger after the configured delay", () => {
    const triggers: Trigger[] = [{ on: "time", seconds: 2, action: "open" }];

    renderHook(() =>
      useTriggers({ triggers, enabled: true, onOpen, onGreeting }),
    );

    expect(onOpen).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(onOpen).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("only fires each trigger once even when conditions stay true", () => {
    const triggers: Trigger[] = [
      {
        on: "exit-intent",
        action: { greeting: "Need help?" },
      },
    ];

    renderHook(() =>
      useTriggers({ triggers, enabled: true, onOpen, onGreeting }),
    );

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseleave", { clientY: -10 }));
      document.dispatchEvent(new MouseEvent("mouseleave", { clientY: -20 }));
    });

    expect(onGreeting).toHaveBeenCalledTimes(1);
    expect(onGreeting).toHaveBeenCalledWith("Need help?");
  });

  it("skips triggers whose matchUrl does not match the current URL", () => {
    const triggers: Trigger[] = [
      {
        on: "time",
        seconds: 1,
        matchUrl: "/checkout",
        action: "open",
      },
    ];

    renderHook(() =>
      useTriggers({ triggers, enabled: true, onOpen, onGreeting }),
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onOpen).not.toHaveBeenCalled();
  });

  it("fires url triggers immediately on mount when the URL matches", () => {
    const triggers: Trigger[] = [
      {
        on: "url",
        pattern: /pricing/,
        action: { greeting: "Pricing questions?" },
      },
    ];

    renderHook(() =>
      useTriggers({ triggers, enabled: true, onOpen, onGreeting }),
    );

    expect(onGreeting).toHaveBeenCalledWith("Pricing questions?");
  });

  it("does nothing when disabled", () => {
    const triggers: Trigger[] = [
      { on: "time", seconds: 1, action: "open" },
      { on: "url", pattern: "/pricing", action: "open" },
    ];

    renderHook(() =>
      useTriggers({ triggers, enabled: false, onOpen, onGreeting }),
    );

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(onOpen).not.toHaveBeenCalled();
    expect(onGreeting).not.toHaveBeenCalled();
  });

  it("cleans up listeners on unmount", () => {
    const triggers: Trigger[] = [{ on: "exit-intent", action: "open" }];

    const removeSpy = vi.spyOn(document, "removeEventListener");
    const { unmount } = renderHook(() =>
      useTriggers({ triggers, enabled: true, onOpen, onGreeting }),
    );

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("mouseleave", expect.any(Function));
    removeSpy.mockRestore();
  });

  it("ignores exit-intent events that are not from the top edge", () => {
    const triggers: Trigger[] = [{ on: "exit-intent", action: "open" }];

    renderHook(() =>
      useTriggers({ triggers, enabled: true, onOpen, onGreeting }),
    );

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseleave", { clientY: 50 }));
    });

    expect(onOpen).not.toHaveBeenCalled();
  });
});
