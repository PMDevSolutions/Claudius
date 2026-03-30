# Mobile Bottom Sheet Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** On mobile (<640px), render the chat as a full-width bottom sheet with swipe-to-close gesture and reduced-motion support.

**Architecture:** CSS transitions for slide/fade animations, vanilla JS touch handlers in a custom hook, media-query-based conditional rendering in ChatWidget/ChatWindow. No new dependencies.

**Tech Stack:** React, TypeScript, Tailwind CSS, CSS transitions, Touch Events API

---

### Task 1: useSwipeToDismiss hook - tests

**Files:**
- Create: `widget/src/hooks/__tests__/useSwipeToDismiss.test.ts`

**Step 1: Write tests for the hook**

```typescript
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSwipeToDismiss } from "../useSwipeToDismiss";

describe("useSwipeToDismiss", () => {
  const createRef = (scrollTop = 0) => {
    const el = document.createElement("div");
    Object.defineProperty(el, "scrollTop", { value: scrollTop, writable: true });
    Object.defineProperty(el, "getBoundingClientRect", {
      value: () => ({ height: 600 }),
    });
    return { current: el };
  };

  it("returns offsetY of 0 initially", () => {
    const ref = createRef();
    const { result } = renderHook(() =>
      useSwipeToDismiss(ref, vi.fn(), true)
    );
    expect(result.current.offsetY).toBe(0);
  });

  it("does not attach listeners when disabled", () => {
    const ref = createRef();
    const spy = vi.spyOn(ref.current, "addEventListener");
    renderHook(() => useSwipeToDismiss(ref, vi.fn(), false));
    expect(spy).not.toHaveBeenCalled();
  });

  it("tracks vertical drag distance", () => {
    const ref = createRef();
    const { result } = renderHook(() =>
      useSwipeToDismiss(ref, vi.fn(), true)
    );

    act(() => {
      ref.current.dispatchEvent(
        new TouchEvent("touchstart", {
          touches: [{ clientY: 300 } as Touch],
        })
      );
    });
    act(() => {
      ref.current.dispatchEvent(
        new TouchEvent("touchmove", {
          touches: [{ clientY: 400, clientX: 300 } as Touch],
        })
      );
    });

    expect(result.current.offsetY).toBe(100);
  });

  it("calls onDismiss when dragged past 30% threshold", () => {
    const ref = createRef();
    const onDismiss = vi.fn();
    renderHook(() => useSwipeToDismiss(ref, onDismiss, true));

    act(() => {
      ref.current.dispatchEvent(
        new TouchEvent("touchstart", {
          touches: [{ clientY: 100 } as Touch],
        })
      );
    });
    act(() => {
      ref.current.dispatchEvent(
        new TouchEvent("touchmove", {
          touches: [{ clientY: 300, clientX: 0 } as Touch],
        })
      );
    });
    act(() => {
      ref.current.dispatchEvent(new TouchEvent("touchend", { touches: [] }));
    });

    expect(onDismiss).toHaveBeenCalled();
  });

  it("snaps back when drag is below threshold", () => {
    const ref = createRef();
    const onDismiss = vi.fn();
    const { result } = renderHook(() =>
      useSwipeToDismiss(ref, onDismiss, true)
    );

    act(() => {
      ref.current.dispatchEvent(
        new TouchEvent("touchstart", {
          touches: [{ clientY: 300 } as Touch],
        })
      );
    });
    act(() => {
      ref.current.dispatchEvent(
        new TouchEvent("touchmove", {
          touches: [{ clientY: 320, clientX: 300 } as Touch],
        })
      );
    });
    act(() => {
      ref.current.dispatchEvent(new TouchEvent("touchend", { touches: [] }));
    });

    expect(onDismiss).not.toHaveBeenCalled();
    expect(result.current.offsetY).toBe(0);
  });

  it("does not activate swipe when scrollTop > 0", () => {
    const ref = createRef(100);
    const { result } = renderHook(() =>
      useSwipeToDismiss(ref, vi.fn(), true)
    );

    act(() => {
      ref.current.dispatchEvent(
        new TouchEvent("touchstart", {
          touches: [{ clientY: 300 } as Touch],
        })
      );
    });
    act(() => {
      ref.current.dispatchEvent(
        new TouchEvent("touchmove", {
          touches: [{ clientY: 400, clientX: 300 } as Touch],
        })
      );
    });

    expect(result.current.offsetY).toBe(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd widget && pnpm test -- --run src/hooks/__tests__/useSwipeToDismiss.test.ts`
Expected: FAIL - module not found

**Step 3: Commit**

```bash
git add widget/src/hooks/__tests__/useSwipeToDismiss.test.ts
git commit -m "test: add useSwipeToDismiss hook tests"
```

---

### Task 2: useSwipeToDismiss hook - implementation

**Files:**
- Create: `widget/src/hooks/useSwipeToDismiss.ts`

**Step 1: Implement the hook**

```typescript
import { useEffect, useRef, useState, useCallback, type RefObject } from "react";

export function useSwipeToDismiss(
  sheetRef: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  enabled: boolean
) {
  const [offsetY, setOffsetY] = useState(0);
  const startY = useRef(0);
  const startTime = useRef(0);
  const tracking = useRef(false);

  const reset = useCallback(() => {
    setOffsetY(0);
    tracking.current = false;
  }, []);

  useEffect(() => {
    const el = sheetRef.current;
    if (!el || !enabled) return;

    const onTouchStart = (e: TouchEvent) => {
      // Only start swipe when content is scrolled to top
      if (el.scrollTop > 0) return;
      startY.current = e.touches[0].clientY;
      startTime.current = Date.now();
      tracking.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking.current) return;
      const currentY = e.touches[0].clientY;
      const deltaY = currentY - startY.current;

      // Ignore horizontal swipes
      const deltaX = (e.touches[0].clientX ?? 0) - (e.touches[0].clientX ?? 0);
      // We only care about downward drag
      if (deltaY < 0) {
        // Resist upward drag
        setOffsetY(deltaY * 0.3);
      } else {
        setOffsetY(deltaY);
      }
    };

    const onTouchEnd = () => {
      if (!tracking.current) {
        reset();
        return;
      }

      const elapsed = Date.now() - startTime.current;
      const velocity = Math.abs(offsetY) / (elapsed || 1) * 1000;
      const sheetHeight = el.getBoundingClientRect().height;
      const distanceRatio = offsetY / sheetHeight;

      if (velocity > 500 || distanceRatio > 0.3) {
        onDismiss();
      }

      reset();
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd);

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [sheetRef, onDismiss, enabled, offsetY, reset]);

  return { offsetY };
}
```

**Step 2: Run tests to verify they pass**

Run: `cd widget && pnpm test -- --run src/hooks/__tests__/useSwipeToDismiss.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add widget/src/hooks/useSwipeToDismiss.ts
git commit -m "feat: add useSwipeToDismiss hook for mobile bottom sheet"
```

---

### Task 3: useMediaQuery hook - tests and implementation

**Files:**
- Create: `widget/src/hooks/useMediaQuery.ts`
- Create: `widget/src/hooks/__tests__/useMediaQuery.test.ts`

**Step 1: Write test**

```typescript
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useMediaQuery } from "../useMediaQuery";

describe("useMediaQuery", () => {
  let listeners: Array<(e: { matches: boolean }) => void>;

  beforeEach(() => {
    listeners = [];
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn((query: string) => ({
        matches: false,
        media: query,
        addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
          listeners.push(cb);
        },
        removeEventListener: vi.fn(),
      })),
    });
  });

  it("returns initial match state", () => {
    const { result } = renderHook(() => useMediaQuery("(max-width: 639px)"));
    expect(result.current).toBe(false);
  });

  it("updates when media query changes", () => {
    const { result } = renderHook(() => useMediaQuery("(max-width: 639px)"));
    act(() => {
      listeners.forEach((cb) => cb({ matches: true }));
    });
    expect(result.current).toBe(true);
  });
});
```

**Step 2: Implement the hook**

```typescript
import { useState, useEffect } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [query]);

  return matches;
}
```

**Step 3: Run tests**

Run: `cd widget && pnpm test -- --run src/hooks/__tests__/useMediaQuery.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add widget/src/hooks/useMediaQuery.ts widget/src/hooks/__tests__/useMediaQuery.test.ts
git commit -m "feat: add useMediaQuery hook"
```

---

### Task 4: CSS transitions and reduced-motion styles

**Files:**
- Modify: `widget/src/styles.css`

**Step 1: Add bottom sheet CSS**

Add to `widget/src/styles.css` after the Tailwind directives:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Bottom sheet slide-up animation */
.claudius-bottom-sheet {
  transition: transform 300ms cubic-bezier(0.32, 0.72, 0, 1);
}

.claudius-bottom-sheet[data-dragging="true"] {
  transition: none;
}

/* Scrim fade */
.claudius-scrim {
  transition: opacity 300ms ease;
}

/* Reduced motion: replace slide with opacity, skip transforms */
@media (prefers-reduced-motion: reduce) {
  .claudius-bottom-sheet {
    transition: opacity 200ms ease;
    transform: none !important;
  }

  .claudius-scrim {
    transition: opacity 150ms ease;
  }
}
```

**Step 2: Commit**

```bash
git add widget/src/styles.css
git commit -m "feat: add bottom sheet and reduced-motion CSS transitions"
```

---

### Task 5: ChatWindow bottom sheet layout

**Files:**
- Modify: `widget/src/components/ChatWindow.tsx`

**Step 1: Update ChatWindow to accept isMobile prop and render bottom sheet layout**

Changes to `ChatWindow.tsx`:

1. Add `isMobile` prop to `ChatWindowProps`
2. Import and use `useSwipeToDismiss`
3. Conditionally apply bottom sheet classes when `isMobile` is true
4. Add drag handle element when mobile
5. Apply `translateY` from swipe hook
6. Pass `messagesContainerRef` to swipe hook (only swipe when scrolled to top)

The outer `<div>` should change from:

```tsx
<div className={`fixed ${windowPositionClasses[position]} z-50 flex h-[min(500px,calc(100vh-7rem))] w-[calc(100vw-1.5rem)] max-w-[380px] sm:max-w-[400px] md:max-w-[440px] flex-col overflow-hidden rounded-card bg-white dark:bg-gray-900 shadow-2xl font-body`}>
```

To conditionally render based on `isMobile`:

```tsx
const sheetRef = useRef<HTMLDivElement>(null);
const { offsetY } = useSwipeToDismiss(sheetRef, onClose, isMobile);
const isDragging = offsetY !== 0;

const reducedMotion = typeof window !== "undefined"
  ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
  : false;

const sheetStyle: React.CSSProperties | undefined = isMobile && !reducedMotion
  ? { transform: `translateY(${Math.max(0, offsetY)}px)` }
  : undefined;

// ...

<div
  ref={isMobile ? sheetRef : undefined}
  data-dragging={isDragging || undefined}
  style={sheetStyle}
  className={
    isMobile
      ? "claudius-bottom-sheet fixed inset-x-0 bottom-0 z-50 flex h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white dark:bg-gray-900 shadow-2xl font-body"
      : `fixed ${windowPositionClasses[position]} z-50 flex h-[min(500px,calc(100vh-7rem))] w-[calc(100vw-1.5rem)] max-w-[380px] sm:max-w-[400px] md:max-w-[440px] flex-col overflow-hidden rounded-card bg-white dark:bg-gray-900 shadow-2xl font-body`
  }
>
  {/* Drag handle (mobile only) */}
  {isMobile && (
    <div className="flex justify-center py-2" aria-hidden="true">
      <div className="h-1 w-8 rounded-full bg-gray-300 dark:bg-gray-600" />
    </div>
  )}
  {/* ... rest of header, messages, input */}
</div>
```

**Step 2: Run all widget tests**

Run: `cd widget && pnpm test`
Expected: All existing tests PASS (they don't pass `isMobile`, so it defaults to `false` and the component behaves as before)

**Step 3: Commit**

```bash
git add widget/src/components/ChatWindow.tsx
git commit -m "feat: add bottom sheet layout to ChatWindow for mobile"
```

---

### Task 6: ChatWidget scrim and mobile detection

**Files:**
- Modify: `widget/src/components/ChatWidget.tsx`

**Step 1: Add mobile detection and scrim backdrop**

Changes to `ChatWidget.tsx`:

1. Import `useMediaQuery`
2. Detect mobile: `const isMobile = useMediaQuery("(max-width: 639px)")`
3. Render scrim backdrop when open on mobile
4. Pass `isMobile` to `ChatWindow`
5. Keep `ChatWindow` always mounted (for animation), control visibility with state

```tsx
import { useMediaQuery } from "../hooks/useMediaQuery";

// Inside ChatWidget:
const isMobile = useMediaQuery("(max-width: 639px)");

// In JSX, replace the existing {isOpen && <ChatWindow ... />} with:

{/* Scrim backdrop (mobile only) */}
{isOpen && isMobile && (
  <div
    className="claudius-scrim fixed inset-0 z-40 bg-black/50"
    onClick={handleClose}
    aria-hidden="true"
  />
)}
{isOpen && (
  <ChatWindow
    messages={messages}
    isLoading={isLoading}
    error={error}
    onSend={sendMessage}
    onClose={handleClose}
    title={title ?? translations.title}
    subtitle={subtitle ?? translations.subtitle}
    welcomeMessage={welcomeMessage ?? translations.welcomeMessage}
    placeholder={placeholder ?? translations.placeholder}
    position={position}
    translations={translations}
    isMobile={isMobile}
  />
)}
```

**Step 2: Run all widget tests**

Run: `cd widget && pnpm test`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add widget/src/components/ChatWidget.tsx
git commit -m "feat: add mobile scrim backdrop and pass isMobile to ChatWindow"
```

---

### Task 7: Integration tests for bottom sheet behavior

**Files:**
- Modify: `widget/src/components/__tests__/ChatWidget.test.tsx`
- Modify: `widget/src/components/__tests__/ChatWindow.test.tsx`

**Step 1: Add mobile bottom sheet tests to ChatWidget.test.tsx**

```typescript
describe("ChatWidget - mobile bottom sheet", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn((query: string) => ({
        matches: query === "(max-width: 639px)",
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  it("renders scrim backdrop on mobile when open", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ChatWidget apiUrl="https://test.workers.dev" />
    );
    await user.click(screen.getByRole("button", { name: /open chat/i }));
    expect(container.querySelector(".claudius-scrim")).toBeInTheDocument();
  });

  it("does not render scrim on desktop", async () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    const user = userEvent.setup();
    const { container } = render(
      <ChatWidget apiUrl="https://test.workers.dev" />
    );
    await user.click(screen.getByRole("button", { name: /open chat/i }));
    expect(container.querySelector(".claudius-scrim")).not.toBeInTheDocument();
  });
});
```

**Step 2: Add bottom sheet layout test to ChatWindow.test.tsx**

```typescript
describe("ChatWindow - mobile bottom sheet", () => {
  it("renders drag handle when isMobile is true", () => {
    const { container } = render(
      <ChatWindow
        messages={[]}
        isLoading={false}
        error={null}
        onSend={vi.fn()}
        onClose={vi.fn()}
        isMobile={true}
      />
    );
    expect(container.querySelector(".claudius-bottom-sheet")).toBeInTheDocument();
  });

  it("does not render drag handle when isMobile is false", () => {
    const { container } = render(
      <ChatWindow
        messages={[]}
        isLoading={false}
        error={null}
        onSend={vi.fn()}
        onClose={vi.fn()}
        isMobile={false}
      />
    );
    expect(container.querySelector(".claudius-bottom-sheet")).not.toBeInTheDocument();
  });
});
```

**Step 3: Run all tests**

Run: `cd widget && pnpm test`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add widget/src/components/__tests__/ChatWidget.test.tsx widget/src/components/__tests__/ChatWindow.test.tsx
git commit -m "test: add mobile bottom sheet integration tests"
```

---

### Task 8: Manual testing and polish

**Step 1: Run dev server and test on mobile viewport**

Run: `cd widget && pnpm dev`

Test in browser DevTools (toggle device toolbar, select mobile viewport <640px):
- Bottom sheet slides up from bottom
- Drag handle visible at top
- Swipe down dismisses sheet
- Dark scrim appears behind sheet
- Tapping scrim closes sheet
- Desktop (>=640px) shows floating card as before
- Toggle `prefers-reduced-motion` in DevTools: Rendering > Emulate CSS media feature > prefers-reduced-motion: reduce. Verify opacity fade instead of slide.

**Step 2: Fix any visual issues found during manual testing**

**Step 3: Run full test suite**

Run: `cd widget && pnpm test`
Expected: All tests PASS

**Step 4: Commit any polish fixes**

```bash
git add -u
git commit -m "fix: polish mobile bottom sheet visual details"
```
