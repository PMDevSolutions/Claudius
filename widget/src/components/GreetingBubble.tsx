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
        className="block w-full rounded-2xl bg-white p-4 pr-8 text-left text-sm text-slate-900 shadow-lg ring-1 ring-slate-200 transition hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-[var(--claudius-primary,#2563eb)] dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700"
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
        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--claudius-primary,#2563eb)] dark:text-slate-300 dark:hover:bg-slate-700"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
