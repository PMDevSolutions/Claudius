interface TypingIndicatorProps {
  /** Accessible label announced to screen readers while the assistant replies. */
  label: string;
}

/**
 * The animated "assistant is typing" pill shown in the message list while a
 * reply is in flight. Rendered as a polite live region so screen readers
 * announce it without stealing focus.
 */
export function TypingIndicator({ label }: TypingIndicatorProps) {
  // motion-safe: variant disables the bounce when prefers-reduced-motion is
  // set; the dots remain visible as a static status pill.
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className="mr-auto flex max-w-[85%]"
    >
      <div className="flex gap-1 rounded-claudius-bubble rounded-bl-claudius-tail bg-claudius-assistant-bubble px-4 py-3">
        <span className="h-2 w-2 motion-safe:animate-bounce rounded-claudius-full bg-claudius-text-muted [animation-delay:0ms]" />
        <span className="h-2 w-2 motion-safe:animate-bounce rounded-claudius-full bg-claudius-text-muted [animation-delay:150ms]" />
        <span className="h-2 w-2 motion-safe:animate-bounce rounded-claudius-full bg-claudius-text-muted [animation-delay:300ms]" />
      </div>
    </div>
  );
}
