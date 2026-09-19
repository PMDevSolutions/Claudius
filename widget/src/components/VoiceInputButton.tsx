import {
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import type { VoiceInputMode } from "../utils/voice";

interface VoiceInputButtonProps {
  mode: VoiceInputMode;
  isListening: boolean;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
  /**
   * Accessible name. It stays the same in both states; `aria-pressed` carries
   * the state, so screen readers don't announce it twice.
   */
  label: string;
}

function isHoldKey(e: KeyboardEvent): boolean {
  return e.key === " " || e.key === "Enter";
}

/**
 * Mic button for dictation. In `"toggle"` mode a click starts and the next
 * click stops. In `"hold"` mode it records while pressed, by pointer or by
 * Space / Enter.
 */
export function VoiceInputButton({
  mode,
  isListening,
  disabled = false,
  onStart,
  onStop,
  label,
}: VoiceInputButtonProps) {
  const isHold = mode === "hold";
  const holdingRef = useRef(false);

  const beginHold = () => {
    if (disabled || holdingRef.current) return;
    holdingRef.current = true;
    onStart();
  };

  // Idempotent: a release is often reported twice (pointerup, then
  // lostpointercapture).
  const endHold = () => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    onStop();
  };

  const handleClick = (e: MouseEvent) => {
    // In hold mode the press handlers own pointer clicks. What is left is a
    // click with no click count: a screen reader or switch device activating
    // the button, which cannot hold it down. Let those toggle.
    if (isHold && e.detail !== 0) return;
    if (isListening) onStop();
    else onStart();
  };

  const handlePointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (!isHold || e.button !== 0) return;
    // Keep receiving the release even if the finger slides off the button.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    beginHold();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isHold || !isHoldKey(e)) return;
    // Stop the browser turning the key press into a click as well.
    e.preventDefault();
    if (!e.repeat) beginHold();
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    if (!isHold || !isHoldKey(e)) return;
    e.preventDefault();
    endHold();
  };

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      aria-pressed={isListening}
      title={label}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={endHold}
      onPointerCancel={endHold}
      onLostPointerCapture={endHold}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onBlur={endHold}
      // A long press on touch screens would otherwise open a menu mid-recording.
      onContextMenu={isHold ? (e) => e.preventDefault() : undefined}
      style={isHold ? { WebkitTouchCallout: "none" } : undefined}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-claudius-sm border transition-colors focus:outline-none focus:ring-1 focus:ring-claudius-accent disabled:opacity-50 ${
        isListening
          ? "border-claudius-accent bg-claudius-accent text-claudius-accent-text"
          : "border-claudius-border bg-claudius-field text-claudius-text-muted hover:text-claudius-text focus:border-claudius-accent"
      } ${isHold ? "touch-none select-none" : ""}`}
    >
      {isListening && !isHold ? (
        // Same stop square the send button turns into while a reply streams:
        // it says what a click will do, and keeps this button from looking
        // like a second send button.
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <rect x="6" y="6" width="12" height="12" rx="1.5" />
        </svg>
      ) : (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="22" />
        </svg>
      )}
    </button>
  );
}
