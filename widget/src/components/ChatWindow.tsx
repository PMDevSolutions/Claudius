import { useEffect, useId, useRef, useState } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { ChatSources } from "./ChatSources";
import { ChatHeader } from "./ChatHeader";
import { ErrorBanner } from "./ErrorBanner";
import { TypingIndicator } from "./TypingIndicator";
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

      <ChatHeader
        title={title}
        subtitle={subtitle}
        titleId={titleId}
        closeLabel={closeLabel}
        onClose={onClose}
      />

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
            <ErrorBanner
              message={error}
              retryLabel={translations?.errorRetry ?? "Retry"}
              onRetry={canRetry && onRetry && !isLoading ? onRetry : undefined}
            />
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
