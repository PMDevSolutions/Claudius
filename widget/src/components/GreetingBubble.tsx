import type { WidgetPosition } from "./ChatWidget";

interface GreetingBubbleProps {
  message: string;
  position: WidgetPosition;
  onOpen: () => void;
  onDismiss: () => void;
  dismissLabel: string;
}

export function GreetingBubble({
  message,
  position,
  onOpen,
  onDismiss,
  dismissLabel,
}: GreetingBubbleProps) {
  const isBottom = position.startsWith("bottom");
  const isRight = position.endsWith("right");

  const containerClasses = [
    "claudius-greeting-bubble",
    "fixed z-40 max-w-xs",
    isBottom ? "bottom-20" : "top-20",
    isRight ? "right-4" : "left-4",
  ].join(" ");

  return (
    <div className={containerClasses} role="status" aria-live="polite">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full rounded-claudius-lg bg-claudius-surface p-4 pr-8 text-left text-sm font-body text-claudius-text shadow-claudius-floating ring-1 ring-claudius-border transition hover:shadow-claudius-floating-hover focus:outline-none focus:ring-2 focus:ring-claudius-accent"
      >
        {message}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        aria-label={dismissLabel}
        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-claudius-full text-claudius-text-muted hover:bg-claudius-surface-muted focus:outline-none focus:ring-2 focus:ring-claudius-accent"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
