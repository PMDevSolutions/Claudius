import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChatMessage, type MessageCitations } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { ChatSources } from "./ChatSources";
import { ChatHeader } from "./ChatHeader";
import { ErrorBanner } from "./ErrorBanner";
import { TypingIndicator } from "./TypingIndicator";
import { HeaderMenu } from "./HeaderMenu";
import { useSwipeToDismiss } from "../hooks/useSwipeToDismiss";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis";
import { useConversationExport } from "../hooks/useConversationExport";
import { stripAnnouncementFormatting } from "../utils/stripAnnouncementFormatting";
import type { WidgetPosition } from "./ChatWidget";
import type { ClaudiusTranslations } from "../i18n";
import type {
  ChatAttachment,
  ChatMessage as ChatMessageData,
  Source,
} from "../api/types";
import type { ResolvedAttachmentsConfig } from "../utils/attachments";
import type { ResolvedVoiceConfig } from "../utils/voice";
import {
  stripCitationMarkers,
  type ResolvedCitationsConfig,
} from "../utils/citations";

interface ChatWindowProps {
  messages: ChatMessageData[];
  isLoading: boolean;
  /** True while an assistant reply is streaming in. */
  isStreaming?: boolean;
  /** Id of the message currently receiving streamed tokens, when any. */
  streamingMessageId?: string | null;
  error: string | null;
  canRetry?: boolean;
  onSend: (message: string, attachments?: ChatAttachment[]) => void;
  /** Cancels the in-flight stream (renders the stop button when provided). */
  onStop?: () => void;
  onRetry?: () => void;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  welcomeMessage?: string;
  placeholder?: string;
  position?: WidgetPosition;
  translations?: ClaudiusTranslations;
  isMobile?: boolean;
  /** Attachment limits, or `null` to hide file controls. */
  attachments?: ResolvedAttachmentsConfig | null;
  /** Voice settings, or `null` to hide the mic and read-aloud controls. */
  voice?: ResolvedVoiceConfig | null;
  /** Show the header menu that copies or downloads the conversation. */
  conversationExport?: boolean;
  /** BCP-47 tag for the dates in an exported transcript. */
  locale?: string;
  /** Citation rendering, or `null` to keep the source icon and sidebar. */
  citations?: ResolvedCitationsConfig | null;
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
  isStreaming = false,
  streamingMessageId = null,
  error,
  canRetry = false,
  onSend,
  onStop,
  onRetry,
  onClose,
  title = "Chat",
  subtitle = "Ask me anything",
  welcomeMessage = "Hi! How can I help you today?",
  placeholder,
  position = "bottom-right",
  translations,
  isMobile = false,
  attachments = null,
  voice = null,
  conversationExport = false,
  locale = "en-US",
  citations = null,
}: ChatWindowProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [activeSources, setActiveSources] = useState<{
    messageId: string;
    sources: Source[];
  } | null>(null);

  useFocusTrap(dialogRef, true);

  // One reader for the whole window, so only one reply speaks at a time.
  const reader = useSpeechSynthesis(voice?.lang ?? "en-US");
  const canReadAloud = !!voice?.output && reader.isSupported;
  const speechLabels = {
    play: translations?.readAloud ?? "Read aloud",
    pause: translations?.pauseReading ?? "Pause reading",
    resume: translations?.resumeReading ?? "Resume reading",
    stop: translations?.stopReading ?? "Stop reading",
  };

  const exporter = useConversationExport({
    enabled: conversationExport,
    messages,
    busy: isLoading,
    locale,
    translations,
  });

  const newTabLabel = translations?.opensInNewTab ?? "(opens in a new tab)";
  // One object per config or language change, so memoized messages do not
  // re-render on every keystroke elsewhere in the window.
  const messageCitations = useMemo<MessageCitations | undefined>(
    () =>
      citations
        ? {
            ...citations,
            labels: {
              sources: translations?.sources ?? "Sources",
              showAllSources:
                translations?.showAllSources ?? "Show all ({count})",
              showFewerSources: translations?.showFewerSources ?? "Show fewer",
              citation: translations?.citation ?? "Source {n}: {title}",
              opensInNewTab: newTabLabel,
            },
          }
        : undefined,
    [citations, translations, newTabLabel],
  );

  // What a screen reader or the read-aloud voice gets: no markdown markers,
  // hostnames for URLs, and no citation markers when chips render them.
  const announceText = (message: ChatMessageData) =>
    stripAnnouncementFormatting(
      messageCitations && message.sources?.length
        ? stripCitationMarkers(message.content, message.sources.length)
        : message.content,
    );

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
      if (e.key === "Escape" && !e.isComposing && !e.defaultPrevented) {
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
        actions={
          conversationExport ? (
            <HeaderMenu
              label={translations?.moreOptions ?? "More options"}
              items={exporter.items}
              onOpen={exporter.clearStatus}
            />
          ) : undefined
        }
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

        {/* Mounted whenever export is on, so the text is announced when it
            changes. Absent otherwise: the typing indicator is a status too. */}
        {conversationExport && (
          <div
            role="status"
            className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center px-4"
          >
            {exporter.status && (
              <span className="rounded-claudius-full bg-claudius-text px-3 py-1 text-xs text-claudius-surface shadow-claudius-elevated">
                {exporter.status}
              </span>
            )}
          </div>
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
              isStreaming={msg.id === streamingMessageId}
              sources={msg.sources}
              attachments={msg.attachments}
              toolUses={msg.toolUses}
              toolUsedLabel={translations?.toolUsed}
              toolDetailsLabel={translations?.toolDetails}
              citations={messageCitations}
              linkNewTabLabel={newTabLabel}
              isSourceActive={
                messageCitations
                  ? undefined
                  : activeSources?.messageId === msg.id
              }
              onSourceClick={
                messageCitations
                  ? undefined
                  : () => {
                      if (activeSources?.messageId === msg.id) {
                        setActiveSources(null);
                      } else if (msg.sources && msg.sources.length > 0) {
                        setActiveSources({
                          messageId: msg.id,
                          sources: msg.sources,
                        });
                      }
                    }
              }
              speech={
                // Only settled replies with something to say: reading a
                // message that is still streaming would stop mid-sentence.
                canReadAloud &&
                msg.role === "assistant" &&
                msg.id !== streamingMessageId &&
                msg.content.trim() !== ""
                  ? {
                      state:
                        reader.activeId !== msg.id
                          ? "idle"
                          : reader.isPaused
                            ? "paused"
                            : "speaking",
                      labels: speechLabels,
                      // Same cleanup as the screen-reader announcement:
                      // no literal asterisks, URLs shortened to hostnames.
                      onPlay: () => reader.speak(msg.id, announceText(msg)),
                      onPause: reader.pause,
                      onResume: reader.resume,
                      onStop: reader.cancel,
                    }
                  : undefined
              }
            />
          ))}

          {isLoading &&
            /* Once streamed tokens are rendering in a bubble, the typing
               indicator is redundant — show it only until the first token.
               A tool-only placeholder (no text yet) keeps the indicator. */
            !(
              streamingMessageId !== null &&
              messages.some(
                (m) => m.id === streamingMessageId && m.content.length > 0,
              )
            ) && (
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
        {/* Announce only settled messages: reading a reply that's still
            streaming would re-announce the whole text on every token. */}
        {lastAssistantMessage && lastAssistantMessage.id !== streamingMessageId
          ? announceText(lastAssistantMessage)
          : ""}
      </div>

      {/* Input */}
      <ChatInput
        onSend={onSend}
        isLoading={isLoading}
        isStreaming={isStreaming}
        onStop={onStop}
        placeholder={placeholder}
        translations={translations}
        attachments={attachments}
        voice={voice}
        // The mic would otherwise transcribe the widget's own voice, so each
        // of the two ends the other.
        onVoiceStart={reader.cancel}
        isReadingAloud={reader.activeId !== null}
      />
    </div>
  );
}
