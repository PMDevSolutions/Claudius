import { memo, useState, type ReactNode } from "react";
import { SourceIcon } from "./SourceIcon";
import { AttachmentPreview } from "./AttachmentPreview";
import type { ChatAttachment, Source, ToolUse } from "../api/types";
import { sanitizeUrl } from "../utils/sanitize";
import { stabilizeStreamingMarkdown } from "../utils/stabilizeStreamingMarkdown";

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

function renderLink(rawUrl: string, key: string): ReactNode {
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
    <>
      <a
        key={key}
        href={safeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="underline font-medium hover:opacity-80 text-claudius-link"
      >
        {safeUrl.replace(/^https?:\/\//, "")}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      {suffix}
    </>
  );
}

function renderInlineFormatting(text: string, keyPrefix: string): ReactNode[] {
  // First split by bold markers
  const boldParts = text.split(BOLD_REGEX);
  const result: ReactNode[] = [];

  boldParts.forEach((part, bIdx) => {
    if (BOLD_REGEX.test(part)) {
      // Strip the ** markers and render as strong
      const inner = part.slice(2, -2);
      result.push(<strong key={`${keyPrefix}-b${bIdx}`}>{inner}</strong>);
    } else {
      // Within non-bold segments, split by italic markers
      const italicParts = part.split(ITALIC_REGEX);
      italicParts.forEach((iPart, iIdx) => {
        if (ITALIC_REGEX.test(iPart)) {
          const inner = iPart.slice(1, -1);
          result.push(<em key={`${keyPrefix}-b${bIdx}-i${iIdx}`}>{inner}</em>);
        } else {
          // Within non-formatted segments, handle URLs
          const urlParts = iPart.split(URL_REGEX);
          urlParts.forEach((uPart, uIdx) => {
            if (URL_REGEX.test(uPart)) {
              result.push(
                renderLink(uPart, `${keyPrefix}-b${bIdx}-i${iIdx}-u${uIdx}`),
              );
            } else if (uPart) {
              result.push(uPart);
            }
          });
        }
      });
    }
  });

  return result;
}

function renderFormattedContent(content: string): ReactNode[] {
  const lines = content.split("\n");

  return lines.map((line, lineIndex) => (
    <span key={lineIndex}>
      {renderInlineFormatting(line, `l${lineIndex}`)}
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
}: ChatMessageProps) {
  const isUser = role === "user";
  const hasAttachments = !!attachments && attachments.length > 0;
  const displayContent = isStreaming
    ? stabilizeStreamingMarkdown(content)
    : content;
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
            renderFormattedContent(displayContent)}
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
      {!isUser && sources && sources.length > 0 && onSourceClick && (
        <div className="mt-1">
          <SourceIcon
            count={sources.length}
            isActive={isSourceActive ?? false}
            onClick={onSourceClick}
          />
        </div>
      )}
    </div>
  );
});
