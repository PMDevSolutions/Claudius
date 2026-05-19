import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useChat } from "../hooks/useChat";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useTriggers, type Trigger } from "../hooks/useTriggers";
import { ChatToggleButton } from "./ChatToggleButton";
import { ChatWindow } from "./ChatWindow";
import { GreetingBubble } from "./GreetingBubble";
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

const DISMISS_STORAGE_KEY = "claudius:triggers:dismissed";

export interface ChatWidgetProps {
  apiUrl: string;
  title?: string;
  subtitle?: string;
  welcomeMessage?: string;
  placeholder?: string;
  persistMessages?: boolean;
  storageKeyPrefix?: string;
  requestTimeoutMs?: number;
  theme?: "light" | "dark" | "auto";
  accentColor?: string;
  position?: WidgetPosition;
  translations?: Partial<ClaudiusTranslations>;
  triggers?: Trigger[];
}

function readDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(DISMISS_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DISMISS_STORAGE_KEY, "1");
  } catch {
    // sessionStorage may be unavailable (e.g. Safari private mode pre-iOS 17)
  }
}

export function ChatWidget({
  apiUrl,
  title,
  subtitle,
  welcomeMessage,
  placeholder,
  persistMessages,
  storageKeyPrefix,
  requestTimeoutMs,
  theme = "light",
  accentColor,
  position = "bottom-right",
  translations: translationOverrides,
  triggers,
}: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [greeting, setGreeting] = useState<string | null>(null);
  const [triggersDismissed, setTriggersDismissed] = useState(readDismissed);
  const openedByTriggerRef = useRef(false);
  const isMobile = useMediaQuery("(max-width: 639px)");

  const translations = useMemo(
    () => createTranslations(translationOverrides),
    [translationOverrides],
  );

  const { messages, isLoading, error, canRetry, sendMessage, retry } = useChat({
    apiUrl,
    persistMessages,
    storageKeyPrefix,
    timeoutMs: requestTimeoutMs,
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

  const dismissTriggers = useCallback(() => {
    setTriggersDismissed(true);
    writeDismissed();
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    if (openedByTriggerRef.current) {
      openedByTriggerRef.current = false;
      dismissTriggers();
    }
  }, [dismissTriggers]);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleTriggerOpen = useCallback(() => {
    openedByTriggerRef.current = true;
    setGreeting(null);
    setIsOpen(true);
  }, []);

  const handleTriggerGreeting = useCallback((message: string) => {
    setGreeting(message);
  }, []);

  const handleGreetingOpen = useCallback(() => {
    setGreeting(null);
    handleTriggerOpen();
  }, [handleTriggerOpen]);

  const handleGreetingDismiss = useCallback(() => {
    setGreeting(null);
    dismissTriggers();
  }, [dismissTriggers]);

  useTriggers({
    triggers,
    enabled: !triggersDismissed && !isOpen,
    onOpen: handleTriggerOpen,
    onGreeting: handleTriggerGreeting,
  });

  const isDark = theme === "dark" || (theme === "auto" && osDark);

  const wrapperStyle: React.CSSProperties | undefined = accentColor
    ? ({ "--claudius-primary": accentColor } as React.CSSProperties)
    : undefined;

  return (
    <div data-claudius-dark={isDark ? "true" : "false"} style={wrapperStyle}>
      {isOpen && isMobile && (
        <div
          className="claudius-scrim fixed inset-0 z-40 bg-black/50"
          onClick={handleClose}
          aria-hidden="true"
        />
      )}
      {isOpen && (
        <ChatWindow
          messages={messages}
          isLoading={isLoading}
          error={error}
          canRetry={canRetry}
          onSend={sendMessage}
          onRetry={retry}
          onClose={handleClose}
          title={title ?? translations.title}
          subtitle={subtitle ?? translations.subtitle}
          welcomeMessage={welcomeMessage ?? translations.welcomeMessage}
          placeholder={placeholder ?? translations.placeholder}
          position={position}
          translations={translations}
          isMobile={isMobile}
        />
      )}
      {!(isOpen && isMobile) && (
        <ChatToggleButton
          ref={toggleRef}
          isOpen={isOpen}
          onClick={handleToggle}
          position={position}
          translations={translations}
        />
      )}
      {!isOpen && greeting && (
        <GreetingBubble
          message={greeting}
          position={position}
          onOpen={handleGreetingOpen}
          onDismiss={handleGreetingDismiss}
          dismissLabel={translations.dismissGreeting}
        />
      )}
    </div>
  );
}

// Re-export for convenience
export { defaultTranslations, createTranslations };
export type { ClaudiusTranslations };
