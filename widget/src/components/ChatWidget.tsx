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
import { resolveTranslations, type LocaleCode } from "../locales";
import { useTheme } from "../theme/useTheme";
import type { ClaudiusThemeInput } from "../theme/types";
import type { ClaudiusPlugin } from "../plugins/types";

/** Corner of the viewport the widget docks to. */
export type WidgetPosition =
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left";

const DISMISS_STORAGE_KEY = "claudius:triggers:dismissed";

/**
 * Props for the {@link ChatWidget} component.
 */
export interface ChatWidgetProps {
  /** Absolute URL of the Worker chat endpoint (e.g. `https://api.example.com`). */
  apiUrl: string;
  /** Header title. Falls back to the active locale's default title. */
  title?: string;
  /** Header subtitle shown beneath the title. */
  subtitle?: string;
  /** First assistant message shown when the chat opens. */
  welcomeMessage?: string;
  /** Placeholder text for the message input. */
  placeholder?: string;
  /**
   * Persist the conversation to storage so it survives reloads.
   * @defaultValue `false`
   */
  persistMessages?: boolean;
  /** Prefix for the storage key used when {@link ChatWidgetProps.persistMessages} is enabled. */
  storageKeyPrefix?: string;
  /** Abort a chat request after this many milliseconds. */
  requestTimeoutMs?: number;
  /**
   * Color-scheme mode ("light" | "dark" | "auto"), a built-in theme name
   * ("default" | "minimal" | "playful" | "corporate"), an inline
   * ClaudiusTheme object, or a URL to a theme JSON file.
   * @defaultValue `"light"`
   */
  theme?: ClaudiusThemeInput;
  /** Accent color override; wins over the theme's accent in both light and dark. */
  accentColor?: string;
  /**
   * Corner of the viewport the widget docks to.
   * @defaultValue `"bottom-right"`
   */
  position?: WidgetPosition;
  /** BCP-47 locale used to select built-in translations. */
  locale?: LocaleCode;
  /** Partial overrides merged over the resolved locale translations. */
  translations?: Partial<ClaudiusTranslations>;
  /** Proactive open/greeting rules evaluated against the current page. */
  triggers?: Trigger[];
  /**
   * Middleware run around each message: `onBeforeSend`, `onAfterReceive`, and
   * `onError`. Hooks run in array order and may modify, replace, or
   * short-circuit messages. See {@link ClaudiusPlugin}.
   */
  plugins?: ClaudiusPlugin[];
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

/**
 * Root Claudius chat widget: a floating toggle button that opens a chat window
 * backed by the Worker chat API. Render a single instance on the page.
 *
 * @param props - See {@link ChatWidgetProps}.
 * @example
 * ```tsx
 * <ChatWidget apiUrl="https://api.example.com" title="Support" />
 * ```
 */
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
  locale,
  translations: translationOverrides,
  triggers,
  plugins,
}: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [greeting, setGreeting] = useState<string | null>(null);
  const [triggersDismissed, setTriggersDismissed] = useState(readDismissed);
  const openedByTriggerRef = useRef(false);
  const isMobile = useMediaQuery("(max-width: 639px)");

  const translations = useMemo(
    () => resolveTranslations({ locale, translations: translationOverrides }),
    [locale, translationOverrides],
  );

  const { messages, isLoading, error, canRetry, sendMessage, retry } = useChat({
    apiUrl,
    persistMessages,
    storageKeyPrefix,
    timeoutMs: requestTimeoutMs,
    translations,
    plugins,
  });
  const toggleRef = useRef<HTMLButtonElement>(null);
  const prevOpenRef = useRef(isOpen);

  const { mode, cssVars } = useTheme(theme);

  const [osDark, setOsDark] = useState(false);

  useEffect(() => {
    if (mode !== "auto") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setOsDark(mq.matches);

    const handler = (e: MediaQueryListEvent) => setOsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

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

  const isDark = mode === "dark" || (mode === "auto" && osDark);

  // accentColor (the v1 API) wins over the theme's accent; it also overrides
  // the dark mirror so the override holds in dark mode.
  const tokenVars: Record<string, string> = {
    ...cssVars,
    ...(accentColor
      ? {
          "--cl-color-accent": accentColor,
          "--cl-color-accent-dark": accentColor,
        }
      : {}),
  };
  const wrapperStyle: React.CSSProperties | undefined =
    Object.keys(tokenVars).length > 0
      ? (tokenVars as React.CSSProperties)
      : undefined;

  return (
    // Outer div carries theme token vars; the inner div carries the dark-mode
    // attribute so the [data-claudius-dark] token reassignments in styles.css
    // beat inherited (inline) light values.
    <div className="claudius-root" style={wrapperStyle}>
      <div data-claudius-dark={isDark ? "true" : "false"}>
        {isOpen && isMobile && (
          <div
            className="claudius-scrim fixed inset-0 z-40 bg-claudius-scrim"
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
    </div>
  );
}

// Re-export for convenience
export { defaultTranslations, createTranslations };
export type { ClaudiusTranslations };
