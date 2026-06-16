interface ChatHeaderProps {
  title: string;
  subtitle: string;
  /** id linked from the dialog's aria-labelledby; applied to the heading. */
  titleId?: string;
  closeLabel: string;
  onClose: () => void;
}

/**
 * The accent-colored bar at the top of the chat window: avatar initial, title
 * and subtitle, and the close button. The heading carries `titleId` so the
 * parent dialog can reference it via aria-labelledby.
 */
export function ChatHeader({
  title,
  subtitle,
  titleId,
  closeLabel,
  onClose,
}: ChatHeaderProps) {
  return (
    <div className="flex items-center gap-3 bg-claudius-accent px-5 py-4">
      <div
        aria-hidden="true"
        className="flex h-8 w-8 items-center justify-center rounded-claudius-full bg-claudius-accent-soft text-sm font-bold text-claudius-accent-text"
      >
        {title.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1">
        <h2
          id={titleId}
          className="text-sm font-heading font-semibold text-claudius-accent-text"
        >
          {title}
        </h2>
        <p className="text-xs text-claudius-accent-text">{subtitle}</p>
      </div>
      <button
        onClick={onClose}
        aria-label={closeLabel}
        className="flex h-10 w-10 items-center justify-center rounded-claudius-full text-claudius-accent-text-muted transition-colors hover:bg-claudius-accent-soft hover:text-claudius-accent-text"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
