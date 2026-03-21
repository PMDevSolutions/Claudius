import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useChat } from "../hooks/useChat";
import { ChatToggleButton } from "./ChatToggleButton";
import { ChatWindow } from "./ChatWindow";
import {
  ClaudiusTranslations,
  defaultTranslations,
  createTranslations,
} from "../i18n";

export type WidgetPosition =
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left";

export interface ChatWidgetProps {
  apiUrl: string;
  title?: string;
  subtitle?: string;
  welcomeMessage?: string;
  placeholder?: string;
  persistMessages?: boolean;
  theme?: "light" | "dark" | "auto";
  accentColor?: string;
  position?: WidgetPosition;
  translations?: Partial<ClaudiusTranslations>;
}

export function ChatWidget({
  apiUrl,
  title,
  subtitle,
  welcomeMessage,
  placeholder,
  persistMessages,
  theme = "light",
  accentColor,
  position = "bottom-right",
  translations: translationOverrides,
}: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);

  const translations = useMemo(
    () => createTranslations(translationOverrides),
    [translationOverrides]
  );

  const { messages, isLoading, error, sendMessage } = useChat({
    apiUrl,
    persistMessages,
    translations,
  });
  const toggleRef = useRef<HTMLButtonElement>(null);
  const prevOpenRef = useRef(isOpen);

  const [osDark, setOsDark] = useState(false);

  useEffect(() => {
    if (theme !== "auto") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setOsDark(mq.matches);

    const handler = (e: MediaQueryListEvent) => setOsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

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

  const isDark = theme === "dark" || (theme === "auto" && osDark);

  const wrapperStyle: React.CSSProperties | undefined = accentColor
    ? ({ "--claudius-primary": accentColor } as React.CSSProperties)
    : undefined;

  return (
    <div data-claudius-dark={isDark ? "true" : "false"} style={wrapperStyle}>
      {isOpen && (
        <ChatWindow
          messages={messages}
          isLoading={isLoading}
          error={error}
          onSend={sendMessage}
          onClose={handleClose}
          title={title ?? translations.title}
          subtitle={subtitle ?? translations.subtitle}
          welcomeMessage={welcomeMessage ?? translations.welcomeMessage}
          placeholder={placeholder ?? translations.placeholder}
          position={position}
          translations={translations}
        />
      )}
      <ChatToggleButton
        ref={toggleRef}
        isOpen={isOpen}
        onClick={handleToggle}
        position={position}
        translations={translations}
      />
    </div>
  );
}

// Re-export for convenience
export { defaultTranslations, createTranslations };
export type { ClaudiusTranslations };
