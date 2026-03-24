import { useState, useCallback, useRef, useMemo } from "react";
import type { ClaudiusTranslations } from "../i18n";
import type { ChatMessage } from "../api/types";
import { ChatApiClient } from "../api/client";
import { ChatApiError, DebounceError } from "../api/errors";

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
  const client = useMemo(
    () => new ChatApiClient(apiUrl, { debounceMs: 0 }),
    [apiUrl],
  );

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
        const data = await client.sendMessage(updatedMessages);

        const assistantMessage: ChatMessage = {
          id: nextId(),
          role: "assistant",
          content: data.reply,
          sources: data.sources,
        };
        const withReply = [...updatedMessages, assistantMessage];
        messagesRef.current = withReply;
        setMessages(withReply);
        saveMessages(withReply);
      } catch (err) {
        if (err instanceof DebounceError) return;
        if (err instanceof ChatApiError) {
          setError(getErrorMessage(err.code, err.message));
        } else {
          setError(
            translations?.errorConnection ??
              "Failed to connect. Please try again.",
          );
        }
      } finally {
        setIsLoading(false);
        isLoadingRef.current = false;
      }
    },
    [client, saveMessages, translations]
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

export type { ChatMessage };
