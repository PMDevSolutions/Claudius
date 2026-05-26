export interface ClaudiusTranslations {
  // ChatWindow
  title: string;
  subtitle: string;
  welcomeMessage: string;
  closeChat: string;
  chatMessages: string;
  typingIndicator: string;

  // ChatInput
  placeholder: string;
  sendMessage: string;
  typeYourMessage: string;

  // ChatToggleButton
  openChat: string;

  // GreetingBubble
  dismissGreeting: string;

  // Errors
  errorGeneric: string;
  errorConnection: string;
  errorTimeout: string;
  errorRateLimitMinute: string;
  errorRateLimitHour: string;
  errorRetry: string;
}

// English is the single source of truth, defined in locales/en.ts.
import { en } from "./locales/en";

export const defaultTranslations: ClaudiusTranslations = en;

export function createTranslations(
  overrides?: Partial<ClaudiusTranslations>,
): ClaudiusTranslations {
  return { ...defaultTranslations, ...overrides };
}
