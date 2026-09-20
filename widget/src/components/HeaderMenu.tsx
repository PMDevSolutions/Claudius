import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from "react";

export interface HeaderMenuItem {
  id: string;
  label: string;
  /** Shown greyed out and focusable, but does nothing when chosen. */
  disabled?: boolean;
  onSelect: () => void;
}

interface HeaderMenuProps {
  /** Accessible name of the trigger, and so of the menu. */
  label: string;
  items: HeaderMenuItem[];
  /** Called each time the menu opens. */
  onOpen?: () => void;
}

/**
 * The header's overflow menu, following the WAI-ARIA menu button pattern. It
 * is generic: it knows nothing about what its items do.
 *
 * It renders inline, not through a portal, so it stays inside the dialog's
 * focus trap and inherits the theme tokens and dark mode from
 * `.claudius-root`.
 */
export function HeaderMenu({ label, items, onOpen }: HeaderMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerId = useId();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // The item to focus once the popup has rendered.
  const pendingFocus = useRef<number | null>(null);

  const openMenu = (focusIndex: number) => {
    pendingFocus.current = focusIndex;
    setOpen(true);
    onOpen?.();
  };

  const closeMenu = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    if (pendingFocus.current !== null) {
      itemRefs.current[pendingFocus.current]?.focus();
      pendingFocus.current = null;
    }
    // onBlur alone would miss this in Safari, which does not focus a button
    // when it is clicked.
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const focusItem = (index: number) => {
    const count = items.length;
    itemRefs.current[(index + count) % count]?.focus();
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    // Enter and Space arrive as a click, which keeps them working the same
    // in every browser.
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openMenu(0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(items.length - 1);
    }
  };

  // On the menu, not the wrapper: focus is always inside the menu while it is
  // open, so this is where the keys arrive, and a plain wrapper div with
  // handlers would need a role it does not have.
  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = itemRefs.current.findIndex(
      (el) => el === document.activeElement,
    );
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusItem(current + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        // -1 when the menu itself has focus, after a click on its padding.
        focusItem(current === -1 ? items.length - 1 : current - 1);
        break;
      case "Home":
        event.preventDefault();
        focusItem(0);
        break;
      case "End":
        event.preventDefault();
        focusItem(items.length - 1);
        break;
      case "Escape":
        // Close the menu only. Without this the chat's document-level
        // Escape handler would close the whole window.
        event.preventDefault();
        event.stopPropagation();
        closeMenu(true);
        break;
      case "Tab":
        // Shift+Tab lands on the trigger anyway; going there ourselves
        // closes the menu in the same step. A forward Tab is left to the
        // browser, and onBlur closes the menu once focus has moved on.
        // Closing here instead would unmount the focused item mid-keystroke.
        if (event.shiftKey) {
          event.preventDefault();
          closeMenu(true);
        }
        break;
    }
  };

  const onMenuBlur = (event: FocusEvent<HTMLDivElement>) => {
    // Focus left the menu entirely: a Tab, or a click on another control.
    // Moving to the trigger does not count, or a click on it would close the
    // menu here and then reopen it in onClick.
    if (!rootRef.current?.contains(event.relatedTarget as Node | null)) {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? closeMenu(true) : openMenu(0))}
        onKeyDown={onTriggerKeyDown}
        className="flex h-10 w-10 items-center justify-center rounded-claudius-full text-claudius-accent-text-muted transition-colors hover:bg-claudius-accent-soft hover:text-claudius-accent-text"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="12" cy="5" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="12" cy="19" r="1.75" />
        </svg>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-labelledby={triggerId}
          // Focusable by script only, as an element with handlers must be.
          // The focus trap skips tabindex -1.
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
          onBlur={onMenuBlur}
          className="absolute right-0 top-full z-20 mt-1 min-w-[12rem] rounded-claudius-md border border-claudius-border bg-claudius-surface py-1 shadow-claudius-elevated"
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              // Not `disabled`: a focused control must never drop out from
              // under the dialog's focus trap.
              aria-disabled={item.disabled || undefined}
              onClick={() => {
                if (item.disabled) return;
                closeMenu(true);
                item.onSelect();
              }}
              className="flex min-h-[40px] w-full items-center whitespace-nowrap px-4 text-left text-sm text-claudius-text hover:bg-claudius-surface-muted focus:bg-claudius-surface-muted aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-transparent"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
