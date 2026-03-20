import { useState } from "react";
import { useChat } from "../hooks/useChat";
import { ChatToggleButton } from "./ChatToggleButton";
import { ChatWindow } from "./ChatWindow";

export interface ChatWidgetProps {
  apiUrl: string;
}

export function ChatWidget({ apiUrl }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { messages, isLoading, error, sendMessage } = useChat({ apiUrl });

  return (
    <>
      {isOpen && (
        <ChatWindow
          messages={messages}
          isLoading={isLoading}
          error={error}
          onSend={sendMessage}
        />
      )}
      <ChatToggleButton isOpen={isOpen} onClick={() => setIsOpen(!isOpen)} />
    </>
  );
}
