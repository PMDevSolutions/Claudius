import type { ReactNode } from "react";

/** Read-aloud state of one message. */
export type MessageSpeechState = "idle" | "speaking" | "paused";

interface MessageSpeechControlsProps {
  state: MessageSpeechState;
  labels: { play: string; pause: string; resume: string; stop: string };
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-7 w-7 items-center justify-center rounded-claudius-full text-claudius-text-muted transition-colors hover:bg-claudius-surface-muted hover:text-claudius-text"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}

/**
 * Read-aloud controls for an assistant message: a speaker button while idle,
 * pause and stop while speaking, resume and stop while paused.
 */
export function MessageSpeechControls({
  state,
  labels,
  onPlay,
  onPause,
  onResume,
  onStop,
}: MessageSpeechControlsProps) {
  if (state === "idle") {
    return (
      <IconButton label={labels.play} onClick={onPlay}>
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" fill="none" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" fill="none" />
      </IconButton>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {state === "paused" ? (
        <IconButton label={labels.resume} onClick={onResume}>
          <polygon points="6 3 20 12 6 21 6 3" />
        </IconButton>
      ) : (
        <IconButton label={labels.pause} onClick={onPause}>
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </IconButton>
      )}
      <IconButton label={labels.stop} onClick={onStop}>
        <rect x="6" y="6" width="12" height="12" rx="1.5" />
      </IconButton>
    </div>
  );
}
