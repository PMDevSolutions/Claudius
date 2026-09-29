import { forwardRef, memo, useEffect, useId, useRef, useState } from "react";
import type { Source } from "../api/types";
import { sanitizeUrl } from "../utils/sanitize";
import { interpolate } from "../utils/interpolate";
import { faviconUrl, sourceDomain, truncateSnippet } from "../utils/citations";

/** The strings the footer is rendered with. */
export interface SourceCardsLabels {
  /** Footer toggle text and the list's accessible name. */
  sources: string;
  /** Reveals the remaining cards; takes `{count}`. */
  showAllSources: string;
  /** Hides the extra cards again. */
  showFewerSources: string;
  /** Visually hidden hint appended to each card's link. */
  opensInNewTab: string;
}

/** A request to open the footer and bring one card into view and focus. */
export interface SourceReveal {
  /** Zero-based source index. */
  index: number;
  /** Changes on every request, so the same card can be revealed twice. */
  key: number;
}

interface SourceCardsProps {
  sources: Source[];
  /** Cards shown before the "Show all" control. */
  maxSources: number;
  /** Fetch `/favicon.ico` from each source's origin. */
  favicons: boolean;
  labels: SourceCardsLabels;
  /** Set by a citation chip; each new `key` reveals its card again. */
  reveal?: SourceReveal | null;
}

const HIGHLIGHT_MS = 1500;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

const BADGE_CLASS =
  "flex h-4 min-w-4 shrink-0 items-center justify-center rounded-claudius-full bg-claudius-accent px-1 text-[10px] font-bold leading-none text-claudius-accent-text";

interface SourceCardProps {
  source: Source;
  /** One-based, matching the chips in the reply. */
  number: number;
  favicons: boolean;
  labels: SourceCardsLabels;
  highlighted: boolean;
}

const SourceCard = forwardRef<HTMLLIElement, SourceCardProps>(
  function SourceCard({ source, number, favicons, labels, highlighted }, ref) {
    // An unsafe URL still gets a card, so the numbering holds, but no link.
    const safeUrl = sanitizeUrl(source.url);
    const [iconFailed, setIconFailed] = useState(false);
    const icon = favicons && safeUrl ? faviconUrl(safeUrl) : null;
    const snippet = source.snippet ? truncateSnippet(source.snippet) : "";

    return (
      <li
        ref={ref}
        tabIndex={-1}
        data-highlight={highlighted || undefined}
        className={`flex gap-2 rounded-claudius-md border bg-claudius-surface-muted p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-claudius-accent ${
          highlighted
            ? "border-claudius-accent ring-2 ring-claudius-accent"
            : "border-claudius-border"
        }`}
      >
        <span aria-hidden="true" className={`mt-0.5 ${BADGE_CLASS}`}>
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {icon && !iconFailed ? (
              <img
                src={icon}
                alt=""
                width={14}
                height={14}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => setIconFailed(true)}
                className="h-3.5 w-3.5 shrink-0 rounded-sm"
              />
            ) : (
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
                className="shrink-0"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                <path d="M2 12h20" />
              </svg>
            )}
            {safeUrl ? (
              <a
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate font-medium text-claudius-text hover:underline"
              >
                {source.title}
                <span className="sr-only"> {labels.opensInNewTab}</span>
              </a>
            ) : (
              <span className="truncate font-medium text-claudius-text">
                {source.title}
              </span>
            )}
            {safeUrl && (
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="shrink-0"
              >
                <path d="M15 3h6v6" />
                <path d="M10 14 21 3" />
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              </svg>
            )}
          </div>
          {snippet && <p className="mt-0.5">{snippet}</p>}
          {safeUrl && (
            <p className="mt-0.5 truncate">{sourceDomain(safeUrl)}</p>
          )}
        </div>
      </li>
    );
  },
);

/**
 * Collapsible "Sources" footer under a cited reply: one card per source with
 * favicon, title link, snippet, and domain. A `reveal` request from a chip
 * opens it, shows the whole list when the card is past `maxSources`, scrolls
 * the card into view, focuses it, and flashes a ring around it.
 */
export const SourceCards = memo(function SourceCards({
  sources,
  maxSources,
  favicons,
  labels,
  reveal = null,
}: SourceCardsProps) {
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [pending, setPending] = useState<SourceReveal | null>(null);
  const [highlighted, setHighlighted] = useState<SourceReveal | null>(null);
  const cardRefs = useRef(new Map<number, HTMLLIElement>());

  // A reveal opens the footer and, when the card is past the cut, the whole
  // list. The scroll and focus wait for the render that adds the card.
  useEffect(() => {
    if (!reveal) return;
    setPending(reveal);
    setExpanded(true);
    if (reveal.index >= maxSources) setShowAll(true);
  }, [reveal, maxSources]);

  useEffect(() => {
    if (!pending) return;
    const card = cardRefs.current.get(pending.index);
    if (!card) return;
    if (typeof card.scrollIntoView === "function") {
      card.scrollIntoView({
        block: "nearest",
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    }
    card.focus({ preventScroll: true });
    setHighlighted(pending);
    setPending(null);
  }, [pending]);

  // The ring is a flash, not a state. A second reveal of the same card is a
  // new object, so the timer restarts.
  useEffect(() => {
    if (!highlighted) return;
    const timer = setTimeout(() => setHighlighted(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlighted]);

  const count = sources.length;
  const visible = showAll ? sources : sources.slice(0, maxSources);

  return (
    <div className="mt-1 text-xs text-claudius-text-muted">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        className="flex items-center gap-1.5 rounded-claudius-full border border-claudius-border bg-claudius-surface px-2 py-0.5 hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-claudius-accent"
      >
        <svg
          width="11"
          height="11"
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
        <span>{labels.sources}</span>
        <span className={BADGE_CLASS}>{count}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={expanded ? "rotate-180" : undefined}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {expanded && (
        <>
          <ol
            id={listId}
            aria-label={labels.sources}
            className="mt-1 space-y-1.5"
          >
            {visible.map((source, index) => (
              <SourceCard
                key={`${index}-${source.url}`}
                ref={(el) => {
                  if (el) cardRefs.current.set(index, el);
                  else cardRefs.current.delete(index);
                }}
                source={source}
                number={index + 1}
                favicons={favicons}
                labels={labels}
                highlighted={highlighted?.index === index}
              />
            ))}
          </ol>
          {count > maxSources && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              className="mt-1 font-medium text-claudius-link underline hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-claudius-accent"
            >
              {showAll
                ? labels.showFewerSources
                : interpolate(labels.showAllSources, { count })}
            </button>
          )}
        </>
      )}
    </div>
  );
});
