import { useState, useRef, useEffect, FormEvent } from "react";
import type { ClaudiusTranslations } from "../i18n";

const MAX_MESSAGE_LENGTH = 2000;
const WARNING_THRESHOLD = 1800;

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  placeholder?: string;
  translations?: ClaudiusTranslations;
}

export function ChatInput({
  onSend,
  isLoading,
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
  const inputLabel = translations?.typeYourMessage ?? "Type your message";

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
      className="border-t border-claudius-border dark:border-gray-700 dark:bg-gray-900 p-3"
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
          className="flex-1 rounded-lg border border-claudius-border dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder:text-gray-400 px-3 py-2 text-sm font-body text-claudius-dark placeholder:text-claudius-gray focus:border-claudius-primary focus:outline-none focus:ring-1 focus:ring-claudius-primary disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isLoading || isAtLimit}
          aria-label={sendLabel}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-claudius-primary text-white transition-colors hover:opacity-90 disabled:opacity-50"
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
      </div>
      {isNearLimit && (
        <div
          id="char-count"
          className={`mt-1 text-xs text-right ${isAtLimit ? "text-claudius-error" : "text-claudius-gray"}`}
          aria-live="polite"
        >
          {charCount}/{MAX_MESSAGE_LENGTH}
        </div>
      )}
    </form>
  );
}
