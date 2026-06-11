import { memo } from "react";

interface SourceIconProps {
  count: number;
  isActive: boolean;
  onClick: () => void;
}

export const SourceIcon = memo(function SourceIcon({
  count,
  isActive,
  onClick,
}: SourceIconProps) {
  return (
    <button
      onClick={onClick}
      aria-label="View sources"
      title="View sources"
      className={`group relative flex h-7 w-7 items-center justify-center rounded-claudius-full transition-colors ${
        isActive
          ? "bg-claudius-accent text-claudius-accent-text"
          : "text-claudius-text-muted hover:bg-claudius-surface-muted hover:text-claudius-text"
      }`}
    >
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
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-claudius-full bg-claudius-accent px-1 text-[10px] font-bold text-claudius-accent-text">
        {count}
      </span>
    </button>
  );
});
