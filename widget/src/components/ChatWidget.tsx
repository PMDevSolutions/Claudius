import { useState, useCallback, useRef, useEffect } from "react";
import { useChat } from "../hooks/useChat";
import { ChatToggleButton } from "./ChatToggleButton";
import { ChatWindow } from "./ChatWindow";

export interface ChatWidgetProps {
  apiUrl: string;
  title?: string;
  subtitle?: string;
  welcomeMessage?: string;
  placeholder?: string;
  persistMessages?: boolean;
}

export function ChatWidget({
  apiUrl,
  title,
  subtitle,
  welcomeMessage,
  placeholder,
  persistMessages,
}: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { messages, isLoading, error, sendMessage } = useChat({
    apiUrl,
    persistMessages,
  });
  const toggleRef = useRef<HTMLButtonElement>(null);
  const prevOpenRef = useRef(isOpen);

  useEffect(() => {
    // Return focus to toggle button when chat closes
    if (prevOpenRef.current && !isOpen) {
      toggleRef.current?.focus();
    }
    prevOpenRef.current = isOpen;
  }, [isOpen]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return (
    <>
      {isOpen && (
        <ChatWindow
          messages={messages}
          isLoading={isLoading}
          error={error}
          onSend={sendMessage}
          onClose={handleClose}
          title={title}
          subtitle={subtitle}
          welcomeMessage={welcomeMessage}
          placeholder={placeholder}
        />
      )}
      <ChatToggleButton
        ref={toggleRef}
        isOpen={isOpen}
        onClick={handleToggle}
      />
    </>
  );
}
