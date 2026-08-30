import { useState, useRef, useEffect, FormEvent } from "react";
import type { ClaudiusTranslations } from "../i18n";

const MAX_MESSAGE_LENGTH = 2000;
const WARNING_THRESHOLD = 1800;

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  /** True while an assistant reply is streaming; swaps send for a stop button. */
  isStreaming?: boolean;
  /** Cancels the in-flight stream. Required for the stop button to render. */
  onStop?: () => void;
  placeholder?: string;
  translations?: ClaudiusTranslations;
}

export function ChatInput({
  onSend,
  isLoading,
  isStreaming = false,
  onStop,
  placeholder,
  translations,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const charCount = value.length;
  const isNearLimit = charCount >= WARNING_THRESHOLD;
  const isAtLimit = charCount >= MAX_MESSAGE_LENGTH;

  const placeholderText =
    placeholder ?? translations?.placeholder ?? "Type your message...";
  const sendLabel = translations?.sendMessage ?? "Send message";
  const stopLabel = translations?.stopGenerating ?? "Stop generating";
  const inputLabel = translations?.typeYourMessage ?? "Type your message";
  const showStop = isStreaming && !!onStop;

  useEffect(() => {
    if (!isLoading) {
      inputRef.current?.focus();
    }
  }, [isLoading]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || isAtLimit) return;
    onSend(trimmed);
    setValue("");
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    if (newValue.length <= MAX_MESSAGE_LENGTH) {
      setValue(newValue);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-claudius-border bg-claudius-surface p-3"
    >
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleChange}
          placeholder={placeholderText}
          disabled={isLoading}
          aria-label={inputLabel}
          aria-describedby={isNearLimit ? "char-count" : undefined}
          className="flex-1 rounded-claudius-sm border border-claudius-border bg-claudius-field px-3 py-2 text-sm font-body text-claudius-text placeholder:text-claudius-text-muted focus:border-claudius-accent focus:outline-none focus:ring-1 focus:ring-claudius-accent disabled:opacity-50"
        />
        {showStop ? (
          <button
            type="button"
            onClick={onStop}
            aria-label={stopLabel}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-claudius-sm bg-claudius-accent text-claudius-accent-text transition-colors hover:opacity-90"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <rect x="6" y="6" width="12" height="12" rx="1.5" />
            </svg>
          </button>
        ) : (
          <button
            type="submit"
            disabled={isLoading || isAtLimit}
            aria-label={sendLabel}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-claudius-sm bg-claudius-accent text-claudius-accent-text transition-colors hover:opacity-90 disabled:opacity-50"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        )}
      </div>
      {isNearLimit && (
        <div
          id="char-count"
          className={`mt-1 text-xs text-right ${isAtLimit ? "text-claudius-error" : "text-claudius-text-muted"}`}
          aria-live="polite"
        >
          {charCount}/{MAX_MESSAGE_LENGTH}
        </div>
      )}
    </form>
  );
}
