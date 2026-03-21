import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import type { WidgetPosition } from "./ChatWidget";
import type { ClaudiusTranslations } from "../i18n";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatWindowProps {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  onSend: (message: string) => void;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  welcomeMessage?: string;
  placeholder?: string;
  position?: WidgetPosition;
  translations?: ClaudiusTranslations;
}

function TypingIndicator() {
  return (
    <div role="status" aria-live="polite" className="mr-auto flex max-w-[85%]">
      <div className="flex gap-1 rounded-2xl rounded-bl-sm bg-claudius-light dark:bg-gray-800 px-4 py-3">
        <span className="h-2 w-2 animate-bounce rounded-full bg-claudius-gray [animation-delay:0ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-claudius-gray [animation-delay:150ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-claudius-gray [animation-delay:300ms]" />
      </div>
    </div>
  );
}

const windowPositionClasses: Record<WidgetPosition, string> = {
  "bottom-right": "bottom-24 right-3 sm:right-6",
  "bottom-left": "bottom-24 left-3 sm:left-6",
  "top-right": "top-24 right-3 sm:right-6",
  "top-left": "top-24 left-3 sm:left-6",
};

export function ChatWindow({
  messages,
  isLoading,
  error,
  onSend,
  onClose,
  title = "Chat",
  subtitle = "Ask me anything",
  welcomeMessage = "Hi! How can I help you today?",
  placeholder,
  position = "bottom-right",
  translations,
}: ChatWindowProps) {
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, isLoading]);

  const closeLabel = translations?.closeChat ?? "Close chat";
  const messagesLabel = translations?.chatMessages ?? "Chat messages";

  return (
    <div
      className={`fixed ${windowPositionClasses[position]} z-50 flex h-[min(500px,calc(100vh-7rem))] w-[calc(100vw-1.5rem)] max-w-[380px] sm:max-w-[400px] md:max-w-[440px] flex-col overflow-hidden rounded-card bg-white dark:bg-gray-900 shadow-2xl font-body`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 bg-claudius-primary px-5 py-4">
        <div
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm font-bold text-white"
        >
          {title.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-heading font-semibold text-white">
            {title}
          </h2>
          <p className="text-xs text-white/90">{subtitle}</p>
        </div>
        <button
          onClick={onClose}
          aria-label={closeLabel}
          className="flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <svg
            width="18"
            height="18"
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

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        role="log"
        aria-live="polite"
        aria-label={messagesLabel}
        className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 && !error && (
          <div className="mr-auto flex max-w-[85%]">
            <div className="rounded-2xl rounded-bl-sm bg-claudius-light dark:bg-gray-800 px-4 py-2.5 text-sm leading-relaxed text-claudius-dark dark:text-gray-200">
              {welcomeMessage}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
        ))}

        {isLoading && <TypingIndicator />}

        {error && (
          <div
            role="alert"
            className="mx-auto max-w-[90%] rounded-lg bg-red-50 dark:bg-red-900/30 px-3 py-2 text-center text-xs text-red-600 dark:text-red-400"
          >
            {error}
          </div>
        )}
      </div>

      {/* Input */}
      <ChatInput
        onSend={onSend}
        isLoading={isLoading}
        placeholder={placeholder}
        translations={translations}
      />
    </div>
  );
}
