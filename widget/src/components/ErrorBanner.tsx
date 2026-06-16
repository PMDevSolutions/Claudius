interface ErrorBannerProps {
  message: string;
  retryLabel: string;
  /** When provided, a retry button is shown. Omit for non-retryable errors. */
  onRetry?: () => void;
}

/**
 * Inline error notice rendered in the message list (role="alert"). A retry
 * button appears only when `onRetry` is supplied — the parent decides whether
 * the failure is retryable and whether a request is already in flight.
 */
export function ErrorBanner({
  message,
  retryLabel,
  onRetry,
}: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-[90%] flex-col items-center gap-2 rounded-claudius-sm bg-claudius-error-surface px-3 py-2 text-center text-xs text-claudius-error"
    >
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-claudius-md bg-claudius-error px-3 py-1 text-xs font-semibold text-claudius-error-text transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-claudius-error focus-visible:ring-offset-1"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}
