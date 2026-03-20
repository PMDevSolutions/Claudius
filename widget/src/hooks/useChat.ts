import { useState, useCallback } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface UseChatOptions {
  apiUrl: string;
}

interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
}

export function useChat({ apiUrl }: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || isLoading) return;

      const userMessage: ChatMessage = { role: "user", content: trimmed };
      const updatedMessages = [...messages, userMessage];

      setMessages(updatedMessages);
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${apiUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: updatedMessages }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.error || "Something went wrong");
          return;
        }

        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: data.reply,
        };
        setMessages([...updatedMessages, assistantMessage]);
      } catch {
        setError("Failed to connect. Please try again.");
      } finally {
        setIsLoading(false);
      }
    },
    [messages, isLoading, apiUrl]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, isLoading, error, sendMessage, clearMessages };
}
