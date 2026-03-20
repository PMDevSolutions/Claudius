import { memo, type ReactNode } from "react";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
}

const URL_REGEX = /(https?:\/\/[^\s)]+)/;
const BOLD_REGEX = /(\*\*[^*]+\*\*)/;
const ITALIC_REGEX = /(\*[^*]+\*)/;

function renderLink(rawUrl: string, key: string): ReactNode {
  // Strip trailing punctuation that's likely not part of the URL
  const trailingPunct = rawUrl.match(/[.,;:!?'"]+$/);
  const url = trailingPunct ? rawUrl.slice(0, -trailingPunct[0].length) : rawUrl;
  const suffix = trailingPunct ? trailingPunct[0] : "";

  return (
    <>
      <a
        key={key}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline font-medium hover:opacity-80"
      >
        {url.replace(/^https?:\/\//, "")}
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
          result.push(
            <em key={`${keyPrefix}-b${bIdx}-i${iIdx}`}>{inner}</em>
          );
        } else {
          // Within non-formatted segments, handle URLs
          const urlParts = iPart.split(URL_REGEX);
          urlParts.forEach((uPart, uIdx) => {
            if (URL_REGEX.test(uPart)) {
              result.push(
                renderLink(uPart, `${keyPrefix}-b${bIdx}-i${iIdx}-u${uIdx}`)
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

export const MessageBubble = memo(function MessageBubble({
  role,
  content,
}: MessageBubbleProps) {
  const isUser = role === "user";

  return (
    <div
      className={`${isUser ? "ml-auto" : "mr-auto"} max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed font-body ${
        isUser
          ? "bg-pmds-blue text-white rounded-br-sm"
          : "bg-pmds-light-green text-pmds-dark rounded-bl-sm"
      }`}
    >
      {renderFormattedContent(content)}
    </div>
  );
});
