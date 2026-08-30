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
  /**
   * Stream replies token-by-token via the Worker's SSE endpoint, falling
   * back to the non-streaming API when unsupported.
   * @defaultValue `true`
   */
  streaming?: boolean;
}

interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  /** True while an assistant reply is actively streaming in. */
  isStreaming: boolean;
  /** Id of the assistant message currently receiving streamed tokens. */
  streamingMessageId: string | null;
  error: string | null;
  canRetry: boolean;
  sendMessage: (content: string) => Promise<void>;
  /** Cancels the in-flight stream, keeping any partial reply. */
  stop: () => void;
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
  streaming = true,
}: UseChatOptions): UseChatReturn {
  const client = useMemo(
    () => new ChatApiClient(apiUrl, { debounceMs: 0, timeoutMs }),
    [apiUrl, timeoutMs],
  );

  const storageKey = getStorageKey(storageKeyPrefix, apiUrl);

  const initialMessages = persistMessages ? loadMessages(storageKey) : [];

  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);

  const idCounterRef = useRef(initialMessages.length);
  const isLoadingRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>(initialMessages);
  const abortControllerRef = useRef<AbortController | null>(null);

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

      // Custom or test clients may predate streamMessage; treat them as
      // non-streaming rather than failing.
      const canStream = streaming && typeof client.streamMessage === "function";

      // Set once the first token (or tool call) arrives; the placeholder
      // assistant message is created lazily so the typing indicator shows
      // until then.
      let placeholderId: string | null = null;

      const upsertPlaceholder = (patch: Partial<ChatMessage>) => {
        if (placeholderId === null) {
          placeholderId = nextId();
          setStreamingMessageId(placeholderId);
          const next: ChatMessage[] = [
            ...messagesRef.current,
            { id: placeholderId, role: "assistant", content: "", ...patch },
          ];
          messagesRef.current = next;
          setMessages(next);
        } else {
          const id = placeholderId;
          const next = messagesRef.current.map((m) =>
            m.id === id ? { ...m, ...patch } : m,
          );
          messagesRef.current = next;
          setMessages(next);
        }
      };

      const dropPlaceholder = () => {
        if (placeholderId === null) return;
        const id = placeholderId;
        const next = messagesRef.current.filter((m) => m.id !== id);
        messagesRef.current = next;
        setMessages(next);
      };

      try {
        let reply: string;
        let sources: ChatMessage["sources"];
        let toolUses: ChatMessage["toolUses"];
        let aborted = false;

        if (canStream) {
          const controller = new AbortController();
          abortControllerRef.current = controller;
          setIsStreaming(true);
          const result = await client.streamMessage(msgsToSend, {
            signal: controller.signal,
            onChunk: (_text, fullText) =>
              upsertPlaceholder({ content: fullText }),
            onToolUse: (_toolUse, allToolUses) =>
              upsertPlaceholder({ toolUses: [...allToolUses] }),
          });
          reply = result.reply;
          sources = result.sources;
          toolUses = result.toolUses;
          aborted = result.aborted ?? false;
        } else {
          const result = await client.sendMessage(msgsToSend);
          reply = result.reply;
          sources = result.sources;
          toolUses = result.toolUses;
        }

        // Cancelled before any reply text arrived: drop the send silently
        // (including a tool-only placeholder with nothing to show).
        if (aborted && !reply) {
          dropPlaceholder();
          return;
        }

        let assistantMessage: ChatMessage = {
          id: placeholderId ?? nextId(),
          role: "assistant",
          content: reply,
          sources,
          toolUses,
        };
        // A cancelled reply is intentionally partial; don't hand it to
        // afterReceive plugins as if it were a complete answer.
        if (pluginsRef.current.length > 0 && !aborted) {
          assistantMessage = await runAfterReceive(
            pluginsRef.current,
            assistantMessage,
            { messages: msgsToSend, apiUrl },
          );
        }
        const withReply =
          placeholderId !== null
            ? messagesRef.current.map((m) =>
                m.id === assistantMessage.id ? assistantMessage : m,
              )
            : [...msgsToSend, assistantMessage];
        messagesRef.current = withReply;
        setMessages(withReply);
        saveMessages(withReply);
      } catch (err) {
        if (err instanceof DebounceError) return;

        // The stream broke after partial content rendered: keep the partial
        // text and surface the error beneath it. No retry button — retrying
        // would resend the conversation and duplicate the partial reply.
        if (placeholderId !== null) {
          saveMessages(messagesRef.current);
          if (err instanceof ChatApiError) {
            setError(getErrorMessage(err.code, err.message));
          } else {
            setError(
              translations?.errorConnection ??
                "Failed to connect. Please try again.",
            );
          }
          setCanRetry(false);
          return;
        }

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
        setIsStreaming(false);
        setStreamingMessageId(null);
        abortControllerRef.current = null;
      }
    },
    [
      apiUrl,
      client,
      getErrorMessage,
      isRetryableError,
      saveMessages,
      streaming,
      translations,
    ],
  );

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

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
    isStreaming,
    streamingMessageId,
    error,
    canRetry,
    sendMessage,
    stop,
    retry,
    clearMessages,
  };
}

export type { ChatMessage };
