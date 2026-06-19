import { useState, useCallback, useRef, useMemo } from "react";
import type { ClaudiusTranslations } from "../i18n";
import type { ChatMessage } from "../api/types";
import { ChatApiClient } from "../api/client";
import { ChatApiError, DebounceError } from "../api/errors";
import type { ClaudiusPlugin } from "../plugins/types";
import { runBeforeSend, runAfterReceive, runError } from "../plugins/runner";

interface UseChatOptions {
  apiUrl: string;
  persistMessages?: boolean;
  storageKeyPrefix?: string;
  timeoutMs?: number;
  translations?: ClaudiusTranslations;
  plugins?: readonly ClaudiusPlugin[];
}

interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  canRetry: boolean;
  sendMessage: (content: string) => Promise<void>;
  retry: () => Promise<void>;
  clearMessages: () => void;
}

const MAX_PERSISTED_MESSAGES = 200;
const DEFAULT_STORAGE_KEY_PREFIX = "claudius:messages";

function getStorageKey(prefix: string, apiUrl: string): string {
  let host: string;
  try {
    host = new URL(apiUrl).host;
  } catch {
    host = apiUrl;
  }
  return `${prefix}:${host}`;
}

function getSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    return null;
  }
}

function loadMessages(storageKey: string): ChatMessage[] {
  const storage = getSessionStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(storageKey);
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
  storageKeyPrefix = DEFAULT_STORAGE_KEY_PREFIX,
  timeoutMs,
  translations,
  plugins,
}: UseChatOptions): UseChatReturn {
  const client = useMemo(
    () => new ChatApiClient(apiUrl, { debounceMs: 0, timeoutMs }),
    [apiUrl, timeoutMs],
  );

  const storageKey = getStorageKey(storageKeyPrefix, apiUrl);

  const initialMessages = persistMessages ? loadMessages(storageKey) : [];

  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);

  const idCounterRef = useRef(initialMessages.length);
  const isLoadingRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>(initialMessages);

  // Hold the latest plugins in a ref so the send callbacks stay stable while
  // always seeing the current array.
  const pluginsRef = useRef<readonly ClaudiusPlugin[]>(plugins ?? []);
  pluginsRef.current = plugins ?? [];

  const saveMessages = useCallback(
    (msgs: ChatMessage[]) => {
      if (!persistMessages) return;
      const storage = getSessionStorage();
      if (!storage) return;
      try {
        const toSave = msgs.slice(-MAX_PERSISTED_MESSAGES);
        storage.setItem(storageKey, JSON.stringify(toSave));
      } catch {
        // sessionStorage may be unavailable or quota-exceeded
      }
    },
    [persistMessages, storageKey],
  );

  const nextId = () => {
    idCounterRef.current += 1;
    return `msg-${idCounterRef.current}`;
  };

  const getErrorMessage = useCallback(
    (code?: string, fallback?: string): string => {
      if (!translations) {
        return fallback ?? "Something went wrong. Please try again.";
      }

      switch (code) {
        case "TIMEOUT":
          return translations.errorTimeout;
        case "NETWORK_ERROR":
          return translations.errorConnection;
        case "RATE_LIMITED":
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
    },
    [translations],
  );

  // Recoverable codes — show the retry button on failures the user can retry.
  // Validation/config errors aren't retryable: the input or server config
  // would need to change first.
  const isRetryableError = useCallback((err: unknown): boolean => {
    if (!(err instanceof ChatApiError)) return true; // unknown failure → allow retry
    if (
      err.code === "TIMEOUT" ||
      err.code === "NETWORK_ERROR" ||
      err.code === "RATE_LIMITED" ||
      err.code === "SERVICE_ERROR" ||
      err.code === "UNKNOWN_ERROR"
    ) {
      return true;
    }
    if (err.status >= 500 || err.status === 0) return true;
    return false;
  }, []);

  const submit = useCallback(
    async (msgsToSend: ChatMessage[]) => {
      setIsLoading(true);
      isLoadingRef.current = true;
      setError(null);
      setCanRetry(false);

      try {
        const data = await client.sendMessage(msgsToSend);

        let assistantMessage: ChatMessage = {
          id: nextId(),
          role: "assistant",
          content: data.reply,
          sources: data.sources,
        };
        if (pluginsRef.current.length > 0) {
          assistantMessage = await runAfterReceive(
            pluginsRef.current,
            assistantMessage,
            { messages: msgsToSend, apiUrl },
          );
        }
        const withReply = [...msgsToSend, assistantMessage];
        messagesRef.current = withReply;
        setMessages(withReply);
        saveMessages(withReply);
      } catch (err) {
        if (err instanceof DebounceError) return;

        // Give plugins a chance to recover with a fallback reply before we
        // surface the error UI.
        if (pluginsRef.current.length > 0) {
          const error = err instanceof Error ? err : new Error(String(err));
          const recovery = await runError(pluginsRef.current, error, {
            messages: msgsToSend,
            apiUrl,
          });
          if (recovery) {
            const assistantMessage: ChatMessage = {
              id: nextId(),
              role: "assistant",
              content: recovery.content,
              sources: recovery.sources,
            };
            const withReply = [...msgsToSend, assistantMessage];
            messagesRef.current = withReply;
            setMessages(withReply);
            saveMessages(withReply);
            setError(null);
            setCanRetry(false);
            return;
          }
        }

        if (err instanceof ChatApiError) {
          setError(getErrorMessage(err.code, err.message));
        } else {
          setError(
            translations?.errorConnection ??
              "Failed to connect. Please try again.",
          );
        }
        setCanRetry(isRetryableError(err));
      } finally {
        setIsLoading(false);
        isLoadingRef.current = false;
      }
    },
    [
      apiUrl,
      client,
      getErrorMessage,
      isRetryableError,
      saveMessages,
      translations,
    ],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || isLoadingRef.current) return;

      const userMessage: ChatMessage = {
        id: nextId(),
        role: "user",
        content: trimmed,
      };

      let outgoing = userMessage;

      if (pluginsRef.current.length > 0) {
        const outcome = await runBeforeSend(pluginsRef.current, userMessage, {
          messages: messagesRef.current,
          apiUrl,
        });

        // A plugin cancelled the send: drop the message, render nothing.
        if (outcome.type === "abort") return;

        // A plugin answered locally: show the user message and the canned
        // reply, and skip the network entirely.
        if (outcome.type === "respond") {
          const assistantMessage: ChatMessage = {
            id: nextId(),
            role: "assistant",
            content: outcome.reply.content,
            sources: outcome.reply.sources,
          };
          const next = [
            ...messagesRef.current,
            outcome.message,
            assistantMessage,
          ];
          messagesRef.current = next;
          setMessages(next);
          saveMessages(next);
          setError(null);
          setCanRetry(false);
          return;
        }

        outgoing = outcome.message;
      }

      const updatedMessages = [...messagesRef.current, outgoing];
      messagesRef.current = updatedMessages;
      setMessages(updatedMessages);
      saveMessages(updatedMessages);

      await submit(updatedMessages);
    },
    [apiUrl, saveMessages, submit],
  );

  const retry = useCallback(async () => {
    if (isLoadingRef.current) return;
    const last = messagesRef.current[messagesRef.current.length - 1];
    if (!last || last.role !== "user") return;
    await submit(messagesRef.current);
  }, [submit]);

  const clearMessages = useCallback(() => {
    messagesRef.current = [];
    setMessages([]);
    setError(null);
    setCanRetry(false);
    if (persistMessages) {
      const storage = getSessionStorage();
      if (!storage) return;
      try {
        storage.removeItem(storageKey);
      } catch {
        // sessionStorage may be unavailable
      }
    }
  }, [persistMessages, storageKey]);

  return {
    messages,
    isLoading,
    error,
    canRetry,
    sendMessage,
    retry,
    clearMessages,
  };
}

export type { ChatMessage };
