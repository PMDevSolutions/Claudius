import { useState, useCallback, useRef } from "react";
import type { ClaudiusTranslations } from "../i18n";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface UseChatOptions {
  apiUrl: string;
  persistMessages?: boolean;
  translations?: ClaudiusTranslations;
}

interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
}

const MAX_PERSISTED_MESSAGES = 200;

function getStorageKey(apiUrl: string): string {
  let host: string;
  try {
    host = new URL(apiUrl).host;
  } catch {
    host = apiUrl;
  }
  return `claudius:messages:${host}`;
}

function loadMessages(storageKey: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function useChat({
  apiUrl,
  persistMessages = true,
  translations,
}: UseChatOptions): UseChatReturn {
  const storageKey = getStorageKey(apiUrl);

  const initialMessages = persistMessages ? loadMessages(storageKey) : [];

  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idCounterRef = useRef(initialMessages.length);
  const isLoadingRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>(initialMessages);

  const saveMessages = useCallback(
    (msgs: ChatMessage[]) => {
      if (!persistMessages) return;
      try {
        const toSave = msgs.slice(-MAX_PERSISTED_MESSAGES);
        localStorage.setItem(storageKey, JSON.stringify(toSave));
      } catch {
        // localStorage may be unavailable in private browsing
      }
    },
    [persistMessages, storageKey]
  );

  const nextId = () => {
    idCounterRef.current += 1;
    return `msg-${idCounterRef.current}`;
  };

  const getErrorMessage = (
    code?: string,
    fallback?: string
  ): string => {
    if (!translations) {
      return fallback ?? "Something went wrong. Please try again.";
    }

    switch (code) {
      case "RATE_LIMITED":
        // Check the message to determine minute vs hour
        if (fallback?.includes("minute")) {
          return translations.errorRateLimitMinute;
        }
        return translations.errorRateLimitHour;
      case "VALIDATION_ERROR":
      case "CONFIG_ERROR":
      case "SERVICE_ERROR":
      case "UNKNOWN_ERROR":
      default:
        return fallback ?? translations.errorGeneric;
    }
  };

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || isLoadingRef.current) return;

      const userMessage: ChatMessage = {
        id: nextId(),
        role: "user",
        content: trimmed,
      };

      const updatedMessages = [...messagesRef.current, userMessage];
      messagesRef.current = updatedMessages;
      setMessages(updatedMessages);
      saveMessages(updatedMessages);
      setIsLoading(true);
      isLoadingRef.current = true;
      setError(null);

      try {
        const response = await fetch(`${apiUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: updatedMessages }),
        });

        const data = await response.json();

        if (!response.ok) {
          const errorMsg = getErrorMessage(data.code, data.error);
          setError(errorMsg);
          return;
        }

        const assistantMessage: ChatMessage = {
          id: nextId(),
          role: "assistant",
          content: data.reply,
        };
        const withReply = [...updatedMessages, assistantMessage];
        messagesRef.current = withReply;
        setMessages(withReply);
        saveMessages(withReply);
      } catch {
        setError(
          translations?.errorConnection ??
            "Failed to connect. Please try again."
        );
      } finally {
        setIsLoading(false);
        isLoadingRef.current = false;
      }
    },
    [apiUrl, saveMessages, translations]
  );

  const clearMessages = useCallback(() => {
    messagesRef.current = [];
    setMessages([]);
    setError(null);
    if (persistMessages) {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // localStorage may be unavailable
      }
    }
  }, [persistMessages, storageKey]);

  return { messages, isLoading, error, sendMessage, clearMessages };
}
