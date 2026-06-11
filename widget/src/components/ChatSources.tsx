import { memo } from "react";
import type { Source } from "../api/types";
import { sanitizeUrl } from "../utils/sanitize";

interface ChatSourcesProps {
  sources: Source[];
  onClose: () => void;
}

const TYPE_ORDER: Source["type"][] = ["blog", "page", "external"];

const TYPE_LABELS: Record<Source["type"], string> = {
  blog: "Blog",
  page: "Page",
  external: "External",
};

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export const ChatSources = memo(function ChatSources({
  sources,
  onClose,
}: ChatSourcesProps) {
  const grouped = TYPE_ORDER.map((type) => ({
    type,
    label: TYPE_LABELS[type],
    items: sources.filter((s) => s.type === type),
  })).filter((group) => group.items.length > 0);

  const countText =
    sources.length === 1 ? "1 source found" : `${sources.length} sources found`;

  return (
    <div className="absolute inset-y-0 left-0 z-10 flex w-[280px] flex-col border-r-2 border-claudius-border bg-claudius-surface rounded-r-claudius-lg transition-transform duration-200 ease-out">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-claudius-border px-4 py-3">
        <div>
          <h3 className="text-sm font-heading font-semibold text-claudius-text">
            Sources
          </h3>
          <p className="text-xs text-claudius-text-muted">{countText}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close sources"
          className="flex h-7 w-7 items-center justify-center rounded-claudius-full text-claudius-text-muted transition-colors hover:bg-claudius-surface-muted hover:text-claudius-text"
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
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Source list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {grouped.map((group) => (
          <div key={group.type}>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-claudius-text-muted">
              {group.label}
            </h4>
            <div className="space-y-2">
              {group.items.map((source) => {
                // Validate URL to prevent javascript:, data:, vbscript: attacks
                const safeUrl = sanitizeUrl(source.url);
                if (!safeUrl) {
                  // Skip sources with unsafe URLs
                  return null;
                }
                return (
                  <a
                    key={safeUrl}
                    href={safeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-claudius-md border-2 border-claudius-border bg-claudius-surface-muted p-3 transition-colors hover:bg-claudius-border"
                  >
                    <p className="truncate text-sm font-medium text-claudius-text">
                      {source.title}
                    </p>
                    <p className="mt-0.5 text-xs text-claudius-text-muted">
                      {extractDomain(safeUrl)}
                    </p>
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
