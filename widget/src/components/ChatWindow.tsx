import { useEffect, useId, useRef, useState } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { ChatSources } from "./ChatSources";
import { useSwipeToDismiss } from "../hooks/useSwipeToDismiss";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { stripAnnouncementFormatting } from "../utils/stripAnnouncementFormatting";
import type { WidgetPosition } from "./ChatWidget";
import type { ClaudiusTranslations } from "../i18n";
import type { ChatMessage as ChatMessageData, Source } from "../api/types";

interface ChatWindowProps {
  messages: ChatMessageData[];
  isLoading: boolean;
  error: string | null;
  canRetry?: boolean;
  onSend: (message: string) => void;
  onRetry?: () => void;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  welcomeMessage?: string;
  placeholder?: string;
  position?: WidgetPosition;
  translations?: ClaudiusTranslations;
  isMobile?: boolean;
}

function TypingIndicator({ label }: { label: string }) {
  // motion-safe: variant disables the bounce when prefers-reduced-motion is
  // set; the dots remain visible as a static status pill.
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className="mr-auto flex max-w-[85%]"
    >
      <div className="flex gap-1 rounded-claudius-bubble rounded-bl-claudius-tail bg-claudius-assistant-bubble px-4 py-3">
        <span className="h-2 w-2 motion-safe:animate-bounce rounded-claudius-full bg-claudius-text-muted [animation-delay:0ms]" />
        <span className="h-2 w-2 motion-safe:animate-bounce rounded-claudius-full bg-claudius-text-muted [animation-delay:150ms]" />
        <span className="h-2 w-2 motion-safe:animate-bounce rounded-claudius-full bg-claudius-text-muted [animation-delay:300ms]" />
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
  canRetry = false,
  onSend,
  onRetry,
  onClose,
  title = "Chat",
  subtitle = "Ask me anything",
  welcomeMessage = "Hi! How can I help you today?",
  placeholder,
  position = "bottom-right",
  translations,
  isMobile = false,
}: ChatWindowProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [activeSources, setActiveSources] = useState<{
    messageId: string;
    sources: Source[];
  } | null>(null);

  useFocusTrap(dialogRef, true);

  const { offsetY } = useSwipeToDismiss(
    messagesContainerRef,
    onClose,
    isMobile,
  );
  const isDragging = offsetY !== 0;
  const reducedMotion =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, isLoading]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.isComposing) {
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const closeLabel = translations?.closeChat ?? "Close chat";
  const messagesLabel = translations?.chatMessages ?? "Chat messages";
  const lastAssistantMessage = [...messages]
    .reverse()
    .find((m) => m.role === "assistant");

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal={isMobile ? "true" : undefined}
      aria-labelledby={titleId}
      className={
        isMobile
          ? "claudius-bottom-sheet fixed inset-x-0 bottom-0 z-50 flex h-[90vh] w-full flex-col overflow-hidden rounded-t-claudius-lg bg-claudius-surface shadow-claudius-elevated font-body"
          : `fixed ${windowPositionClasses[position]} z-50 flex h-[min(500px,calc(100vh-7rem))] w-[calc(100vw-1.5rem)] max-w-[380px] sm:max-w-[400px] md:max-w-[440px] flex-col overflow-hidden rounded-claudius-lg bg-claudius-surface shadow-claudius-elevated font-body`
      }
      style={
        isMobile && !reducedMotion
          ? { transform: `translateY(${Math.max(0, offsetY)}px)` }
          : undefined
      }
      data-dragging={isDragging || undefined}
    >
      {isMobile && (
        <div className="flex justify-center py-2" aria-hidden="true">
          <div className="h-1 w-8 rounded-claudius-full bg-claudius-border" />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 bg-claudius-accent px-5 py-4">
        <div
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-claudius-full bg-claudius-accent-soft text-sm font-bold text-claudius-accent-text"
        >
          {title.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <h2
            id={titleId}
            className="text-sm font-heading font-semibold text-claudius-accent-text"
          >
            {title}
          </h2>
          <p className="text-xs text-claudius-accent-text">{subtitle}</p>
        </div>
        <button
          onClick={onClose}
          aria-label={closeLabel}
          className="flex h-10 w-10 items-center justify-center rounded-claudius-full text-claudius-accent-text-muted transition-colors hover:bg-claudius-accent-soft hover:text-claudius-accent-text"
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

      {/* Messages area */}
      <div className="relative flex-1 overflow-hidden">
        {/* Sources sidebar */}
        {activeSources && (
          <ChatSources
            sources={activeSources.sources}
            onClose={() => setActiveSources(null)}
          />
        )}

        {/* Messages */}
        <div
          ref={messagesContainerRef}
          role="log"
          aria-label={messagesLabel}
          className="h-full space-y-3 overflow-y-auto px-4 py-4"
        >
          {messages.length === 0 && !error && (
            <div className="mr-auto flex max-w-[85%]">
              <div className="rounded-claudius-bubble rounded-bl-claudius-tail bg-claudius-assistant-bubble px-4 py-2.5 text-sm leading-relaxed text-claudius-assistant-bubble-text">
                {welcomeMessage}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              role={msg.role}
              content={msg.content}
              sources={msg.sources}
              isSourceActive={activeSources?.messageId === msg.id}
              onSourceClick={() => {
                if (activeSources?.messageId === msg.id) {
                  setActiveSources(null);
                } else if (msg.sources && msg.sources.length > 0) {
                  setActiveSources({ messageId: msg.id, sources: msg.sources });
                }
              }}
            />
          ))}

          {isLoading && (
            <TypingIndicator
              label={translations?.typingIndicator ?? "Assistant is typing"}
            />
          )}

          {error && (
            <div
              role="alert"
              className="mx-auto flex max-w-[90%] flex-col items-center gap-2 rounded-claudius-sm bg-claudius-error-surface px-3 py-2 text-center text-xs text-claudius-error"
            >
              <span>{error}</span>
              {canRetry && onRetry && !isLoading && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded-claudius-md bg-claudius-error px-3 py-1 text-xs font-semibold text-claudius-error-text transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-claudius-error focus-visible:ring-offset-1"
                >
                  {translations?.errorRetry ?? "Retry"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Dedicated live region for new assistant messages.
          Outside `role="log"` so typing indicator / sources panel mutations
          don't trigger redundant announcements. aria-atomic forces the full
          reply to be read; stripAnnouncementFormatting removes markdown
          markers and collapses URLs to hostnames for SR-friendliness. */}
      <div
        data-claudius-live="assistant"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {lastAssistantMessage
          ? stripAnnouncementFormatting(lastAssistantMessage.content)
          : ""}
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
