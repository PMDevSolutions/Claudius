import { memo } from "react";
import type { ChatAttachment } from "../api/types";
import { attachmentPreviewSrc, formatBytes } from "../utils/attachments";
import { sanitizeUrl } from "../utils/sanitize";

interface AttachmentPreviewProps {
  attachment: ChatAttachment;
  /**
   * `"composer"` renders a compact chip/thumbnail in the input area;
   * `"message"` renders a larger preview inside a message bubble.
   */
  variant: "composer" | "message";
  /** When provided, a remove button is rendered (composer only). */
  onRemove?: () => void;
  /** Accessible label for the remove button. */
  removeLabel?: string;
}

function FileIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function RemoveButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-claudius-full bg-claudius-text text-claudius-surface shadow-claudius-floating hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-claudius-accent"
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}

/**
 * Renders one attachment: an image thumbnail when the bytes (or a signed URL)
 * are available, otherwise a filename chip. Used both for pending files in the
 * composer and for sent files inside message bubbles.
 */
export const AttachmentPreview = memo(function AttachmentPreview({
  attachment,
  variant,
  onRemove,
  removeLabel,
}: AttachmentPreviewProps) {
  const src = attachmentPreviewSrc(attachment);
  const isComposer = variant === "composer";
  const label = `${attachment.name} (${formatBytes(attachment.size)})`;
  const safeUrl = attachment.url ? sanitizeUrl(attachment.url) : null;

  if (src) {
    const img = (
      <img
        src={src}
        alt={attachment.name}
        title={label}
        loading="lazy"
        className={
          isComposer
            ? "h-12 w-12 rounded-claudius-sm border border-claudius-border object-cover"
            : "max-h-48 max-w-full rounded-claudius-sm object-contain"
        }
      />
    );
    return (
      <div className="relative inline-block">
        {!isComposer && safeUrl ? (
          <a href={safeUrl} target="_blank" rel="noopener noreferrer">
            {img}
            <span className="sr-only">{label} (opens in a new tab)</span>
          </a>
        ) : (
          img
        )}
        {onRemove && removeLabel && (
          <RemoveButton label={removeLabel} onClick={onRemove} />
        )}
      </div>
    );
  }

  const chip = (
    <span
      title={label}
      className={`inline-flex max-w-[220px] items-center gap-1.5 rounded-claudius-sm border px-2 py-1 text-xs ${
        isComposer
          ? "border-claudius-border bg-claudius-field text-claudius-text"
          : "border-current/30 bg-transparent"
      }`}
    >
      <FileIcon />
      <span className="truncate">{attachment.name}</span>
      <span className="shrink-0 opacity-70">
        {formatBytes(attachment.size)}
      </span>
    </span>
  );

  return (
    <div className="relative inline-block">
      {!isComposer && safeUrl ? (
        <a
          href={safeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 hover:underline"
        >
          {chip}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : (
        chip
      )}
      {onRemove && removeLabel && (
        <RemoveButton label={removeLabel} onClick={onRemove} />
      )}
    </div>
  );
});
