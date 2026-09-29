import { Fragment, memo, useRef, useState, type ReactNode } from "react";
import { SourceIcon } from "./SourceIcon";
import {
  SourceCards,
  type SourceCardsLabels,
  type SourceReveal,
} from "./SourceCards";
import { AttachmentPreview } from "./AttachmentPreview";
import {
  MessageSpeechControls,
  type MessageSpeechState,
} from "./MessageSpeechControls";
import type { ChatAttachment, Source, ToolUse } from "../api/types";
import { sanitizeUrl } from "../utils/sanitize";
import { stabilizeStreamingMarkdown } from "../utils/stabilizeStreamingMarkdown";
import {
  hideTrailingCitationOpener,
  parseCitations,
  type ResolvedCitationsConfig,
} from "../utils/citations";
import { interpolate } from "../utils/interpolate";

/** Citation rendering for one message: the resolved option plus its strings. */
export interface MessageCitations extends ResolvedCitationsConfig {
  labels: SourceCardsLabels & {
    /** Accessible name of a chip; takes `{n}` and `{title}`. */
    citation: string;
  };
}

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  /**
   * True while this message is still receiving streamed tokens. Partial
   * markdown is stabilized so unclosed `**`/`*` markers don't flash as
   * literal asterisks mid-stream.
   */
  isStreaming?: boolean;
  sources?: Source[];
  /** Files the user attached to this message; rendered inside the bubble. */
  attachments?: ChatAttachment[];
  /** Tools the assistant called for this message; rendered as compact chips. */
  toolUses?: ToolUse[];
  /** Label prefix for the tool affordance (e.g. "Used tool:"). */
  toolUsedLabel?: string;
  /** Accessible label for the tool details disclosure. */
  toolDetailsLabel?: string;
  onSourceClick?: () => void;
  isSourceActive?: boolean;
  /**
   * Read-aloud state and handlers. Omit to hide the controls, as the parent
   * does for messages that are still streaming or have nothing to read.
   */
  speech?: MessageSpeech;
  /**
   * Render `[n]` markers as chips and the sources as a card footer. Omit to
   * keep the source icon and sidebar.
   */
  citations?: MessageCitations;
  /** Visually hidden hint appended to links that open a new tab. */
  linkNewTabLabel?: string;
}

/** Read-aloud wiring for one assistant message. */
export interface MessageSpeech {
  state: MessageSpeechState;
  labels: { play: string; pause: string; resume: string; stop: string };
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

/**
 * Compact "used tool" chip with an optional disclosure revealing the tool's
 * input and result.
 */
function ToolUseChip({
  toolUse,
  usedLabel,
  detailsLabel,
}: {
  toolUse: ToolUse;
  usedLabel: string;
  detailsLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails =
    toolUse.input !== undefined || toolUse.result !== undefined;

  return (
    <div className="text-xs text-claudius-text-muted">
      <button
        type="button"
        disabled={!hasDetails}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={hasDetails ? expanded : undefined}
        className="flex items-center gap-1.5 rounded-claudius-full border border-claudius-border bg-claudius-surface px-2 py-0.5 hover:opacity-80 disabled:cursor-default disabled:hover:opacity-100"
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
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
        <span>
          {usedLabel}{" "}
          <span className="font-mono text-claudius-text">{toolUse.name}</span>
          {toolUse.isError && <span className="text-claudius-error"> ✕</span>}
        </span>
        {hasDetails && (
          <>
            <span className="sr-only">{detailsLabel}</span>
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
          </>
        )}
      </button>
      {expanded && hasDetails && (
        <div className="mt-1 overflow-x-auto rounded-claudius-sm border border-claudius-border bg-claudius-field p-2 font-mono">
          {toolUse.input !== undefined && (
            <pre className="whitespace-pre-wrap break-all">
              {JSON.stringify(toolUse.input, null, 2)}
            </pre>
          )}
          {toolUse.result !== undefined && (
            <pre className="mt-1 whitespace-pre-wrap break-all border-t border-claudius-border pt-1">
              {toolUse.result}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

const URL_REGEX = /(https?:\/\/[^\s)]+)/;
const BOLD_REGEX = /(\*\*[^*]+\*\*)/;
const ITALIC_REGEX = /(\*[^*]+\*)/;

/** Everything the inline renderer needs beyond the text itself. */
interface RenderContext {
  /** Visually hidden hint appended to links that open a new tab. */
  newTabLabel: string;
  /** Present only when `[n]` markers should become chips. */
  citations?: CitationContext;
}

interface CitationContext {
  sources: Source[];
  /** Chip accessible name; takes `{n}` and `{title}`. */
  label: string;
  onCite: (index: number) => void;
}

function renderLink(
  rawUrl: string,
  key: string,
  ctx: RenderContext,
): ReactNode {
  // Strip trailing punctuation that's likely not part of the URL
  const trailingPunct = rawUrl.match(/[.,;:!?'"]+$/);
  const url = trailingPunct
    ? rawUrl.slice(0, -trailingPunct[0].length)
    : rawUrl;
  const suffix = trailingPunct ? trailingPunct[0] : "";

  // Validate URL scheme to prevent javascript:, data:, vbscript: attacks
  const safeUrl = sanitizeUrl(url);
  if (!safeUrl) {
    // If URL is not safe, render as plain text
    return rawUrl;
  }

  return (
    <Fragment key={key}>
      <a
        href={safeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="underline font-medium hover:opacity-80 text-claudius-link"
      >
        {safeUrl.replace(/^https?:\/\//, "")}
        <span className="sr-only"> {ctx.newTabLabel}</span>
      </a>
      {suffix}
    </Fragment>
  );
}

/** `[n]` markers become chips; everything else stays text. */
function renderCitations(
  text: string,
  keyPrefix: string,
  ctx: RenderContext,
): ReactNode[] {
  const cites = ctx.citations;
  if (!cites) return text ? [text] : [];
  return parseCitations(text, cites.sources.length).map((segment, index) => {
    if (segment.type === "text") return segment.value;
    return (
      <span
        key={`${keyPrefix}-c${index}`}
        className="inline-flex gap-0.5 align-super"
      >
        {segment.indexes.map((sourceIndex) => (
          <button
            key={sourceIndex}
            type="button"
            onClick={() => cites.onCite(sourceIndex)}
            aria-label={interpolate(cites.label, {
              n: sourceIndex + 1,
              title: cites.sources[sourceIndex].title,
            })}
            title={cites.sources[sourceIndex].title}
            className="inline-flex h-4 min-w-4 items-center justify-center rounded-claudius-full bg-claudius-accent px-1 text-[10px] font-semibold leading-none text-claudius-accent-text hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-claudius-accent focus-visible:ring-offset-1"
          >
            {sourceIndex + 1}
          </button>
        ))}
      </span>
    );
  });
}

/** Text with no bold or italic left in it: links first, then citation chips. */
function renderLeaf(
  text: string,
  keyPrefix: string,
  ctx: RenderContext,
): ReactNode[] {
  const result: ReactNode[] = [];
  text.split(URL_REGEX).forEach((part, index) => {
    if (URL_REGEX.test(part)) {
      result.push(renderLink(part, `${keyPrefix}-u${index}`, ctx));
    } else if (part) {
      result.push(...renderCitations(part, `${keyPrefix}-u${index}`, ctx));
    }
  });
  return result;
}

function renderInlineFormatting(
  text: string,
  keyPrefix: string,
  ctx: RenderContext,
): ReactNode[] {
  const result: ReactNode[] = [];
  text.split(BOLD_REGEX).forEach((part, bIdx) => {
    if (BOLD_REGEX.test(part)) {
      // Strip the ** markers; the inside still gets links and chips.
      result.push(
        <strong key={`${keyPrefix}-b${bIdx}`}>
          {renderLeaf(part.slice(2, -2), `${keyPrefix}-b${bIdx}`, ctx)}
        </strong>,
      );
      return;
    }
    part.split(ITALIC_REGEX).forEach((iPart, iIdx) => {
      const key = `${keyPrefix}-b${bIdx}-i${iIdx}`;
      if (ITALIC_REGEX.test(iPart)) {
        result.push(
          <em key={key}>{renderLeaf(iPart.slice(1, -1), key, ctx)}</em>,
        );
      } else {
        result.push(...renderLeaf(iPart, key, ctx));
      }
    });
  });
  return result;
}

function renderFormattedContent(
  content: string,
  ctx: RenderContext,
): ReactNode[] {
  const lines = content.split("\n");

  return lines.map((line, lineIndex) => (
    <span key={lineIndex}>
      {renderInlineFormatting(line, `l${lineIndex}`, ctx)}
      {lineIndex < lines.length - 1 && <br />}
    </span>
  ));
}

export const ChatMessage = memo(function ChatMessage({
  role,
  content,
  isStreaming = false,
  sources,
  attachments,
  toolUses,
  toolUsedLabel = "Used tool:",
  toolDetailsLabel = "Tool details",
  onSourceClick,
  isSourceActive,
  speech,
  citations,
  linkNewTabLabel = "(opens in a new tab)",
}: ChatMessageProps) {
  const isUser = role === "user";
  const [reveal, setReveal] = useState<SourceReveal | null>(null);
  const revealCount = useRef(0);
  // Chips and the footer need both the option and something to cite.
  const cited =
    !isUser && citations && sources && sources.length > 0
      ? { config: citations, sources }
      : null;
  const hasAttachments = !!attachments && attachments.length > 0;
  const streamed = isStreaming ? stabilizeStreamingMarkdown(content) : content;
  // A half-typed `[1` would flash as text before its chip; hide it like the
  // bold stabilizer hides a bare `**`.
  const displayContent =
    isStreaming && cited ? hideTrailingCitationOpener(streamed) : streamed;
  const renderContext: RenderContext = {
    newTabLabel: linkNewTabLabel,
    citations: cited
      ? {
          sources: cited.sources,
          label: cited.config.labels.citation,
          onCite: (index) => {
            revealCount.current += 1;
            setReveal({ index, key: revealCount.current });
          },
        }
      : undefined,
  };
  // While a tool runs before any reply text streams in, there is nothing to
  // put in a bubble yet — show only the tool chips.
  const showBubble = isUser || content !== "" || !toolUses?.length;

  return (
    <div className={`${isUser ? "ml-auto" : "mr-auto"} max-w-[85%]`}>
      {showBubble && (
        <div
          className={`rounded-claudius-bubble px-4 py-2.5 text-sm leading-relaxed font-body ${
            isUser
              ? "bg-claudius-user-bubble text-claudius-user-bubble-text rounded-br-claudius-tail"
              : "bg-claudius-assistant-bubble text-claudius-assistant-bubble-text rounded-bl-claudius-tail"
          }`}
        >
          {hasAttachments && (
            <ul
              className={`flex flex-wrap gap-2 ${content ? "mb-2" : ""}`}
              aria-label="Attachments"
            >
              {attachments.map((att) => (
                <li key={att.id}>
                  <AttachmentPreview attachment={att} variant="message" />
                </li>
              ))}
            </ul>
          )}
          {(content !== "" || !hasAttachments) &&
            renderFormattedContent(displayContent, renderContext)}
        </div>
      )}
      {!isUser && toolUses && toolUses.length > 0 && (
        <div className="mt-1 space-y-1">
          {toolUses.map((toolUse, index) => (
            <ToolUseChip
              key={`${toolUse.name}-${index}`}
              toolUse={toolUse}
              usedLabel={toolUsedLabel}
              detailsLabel={toolDetailsLabel}
            />
          ))}
        </div>
      )}
      {cited ? (
        <SourceCards
          sources={cited.sources}
          maxSources={cited.config.maxSources}
          favicons={cited.config.favicons}
          labels={cited.config.labels}
          reveal={reveal}
        />
      ) : (
        !isUser &&
        sources &&
        sources.length > 0 &&
        onSourceClick && (
          <div className="mt-1">
            <SourceIcon
              count={sources.length}
              isActive={isSourceActive ?? false}
              onClick={onSourceClick}
            />
          </div>
        )
      )}
      {!isUser && speech && (
        <div className="mt-1">
          <MessageSpeechControls {...speech} />
        </div>
      )}
    </div>
  );
});
