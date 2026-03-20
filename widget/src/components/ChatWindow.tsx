import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatWindowProps {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  onSend: (message: string) => void;
  onClose: () => void;
}

function TypingIndicator() {
  return (
    <div aria-label="Typing" className="mr-auto flex max-w-[85%]">
      <div className="flex gap-1 rounded-2xl rounded-bl-sm bg-pmds-light-green px-4 py-3">
        <span className="h-2 w-2 animate-bounce rounded-full bg-pmds-gray [animation-delay:0ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-pmds-gray [animation-delay:150ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-pmds-gray [animation-delay:300ms]" />
      </div>
    </div>
  );
}

export function ChatWindow({
  messages,
  isLoading,
  error,
  onSend,
  onClose,
}: ChatWindowProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  return (
    <div className="fixed bottom-24 right-3 z-50 flex h-[min(500px,calc(100vh-7rem))] w-[calc(100vw-1.5rem)] max-w-[380px] flex-col overflow-hidden rounded-card bg-white shadow-2xl font-body sm:right-6">
      {/* Header */}
      <div className="flex items-center gap-3 bg-pmds-blue px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm font-bold text-white">
          P
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-heading font-semibold text-white">
            PMDS Chat
          </h2>
          <p className="text-xs text-white/70">
            Ask me anything about our services
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close chat"
          className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !error && (
          <div className="mr-auto flex max-w-[85%]">
            <div className="rounded-2xl rounded-bl-sm bg-pmds-light-green px-4 py-2.5 text-sm leading-relaxed text-pmds-dark">
              Hi! I&apos;m Paul&apos;s assistant. Ask me about web development
              services, pricing, or anything else. How can I help?
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} role={msg.role} content={msg.content} />
        ))}

        {isLoading && <TypingIndicator />}

        {error && (
          <div className="mx-auto max-w-[90%] rounded-lg bg-red-50 px-3 py-2 text-center text-xs text-red-600">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput onSend={onSend} isLoading={isLoading} />
    </div>
  );
}
