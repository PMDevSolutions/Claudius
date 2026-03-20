interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
}

const URL_REGEX = /(https?:\/\/[^\s)]+)/;

function renderContentWithLinks(content: string) {
  // Split by newlines first, then handle URLs within each line
  const lines = content.split("\n");

  return lines.map((line, lineIndex) => {
    const parts = line.split(URL_REGEX);
    const renderedParts = parts.map((part, partIndex) => {
      if (URL_REGEX.test(part)) {
        return (
          <a
            key={`${lineIndex}-${partIndex}`}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-medium hover:opacity-80"
          >
            {part.replace(/^https?:\/\//, "")}
          </a>
        );
      }
      return part;
    });

    return (
      <span key={lineIndex}>
        {renderedParts}
        {lineIndex < lines.length - 1 && <br />}
      </span>
    );
  });
}

export function MessageBubble({ role, content }: MessageBubbleProps) {
  const isUser = role === "user";

  return (
    <div
      className={`${isUser ? "ml-auto" : "mr-auto"} max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed font-body ${
        isUser
          ? "bg-pmds-blue text-white rounded-br-sm"
          : "bg-pmds-light-green text-pmds-dark rounded-bl-sm"
      }`}
    >
      {renderContentWithLinks(content)}
    </div>
  );
}
