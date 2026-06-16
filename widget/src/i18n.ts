// English is the single source of truth, defined in locales/en.ts.
import { en } from "./locales/en";

/**
 * Every user-facing string the widget renders. Pass a {@link ClaudiusTranslations}
 * (or a partial override) to localize the UI. English is the source of truth;
 * see {@link defaultTranslations}.
 */
export interface ClaudiusTranslations {
  /** Chat window header title. */
  title: string;
  /** Chat window header subtitle. */
  subtitle: string;
  /** First assistant message shown when the chat opens. */
  welcomeMessage: string;
  /** Accessible label for the close button. */
  closeChat: string;
  /** Accessible label for the message list region. */
  chatMessages: string;
  /** Accessible label for the typing indicator. */
  typingIndicator: string;
  /** Placeholder text for the message input. */
  placeholder: string;
  /** Accessible label for the send button. */
  sendMessage: string;
  /** Accessible label for the message input field. */
  typeYourMessage: string;
  /** Accessible label for the button that opens the chat. */
  openChat: string;
  /** Accessible label for dismissing the greeting bubble. */
  dismissGreeting: string;
  /** Generic fallback error message. */
  errorGeneric: string;
  /** Error shown when the network request fails. */
  errorConnection: string;
  /** Error shown when a request times out. */
  errorTimeout: string;
  /** Error shown when rate-limited (per-minute limit). */
  errorRateLimitMinute: string;
  /** Error shown when rate-limited (per-hour limit). */
  errorRateLimitHour: string;
  /** Label for the retry action on a failed message. */
  errorRetry: string;
}

/** The default (English) translations, used when no locale or override applies. */
export const defaultTranslations: ClaudiusTranslations = en;

/**
 * Build a complete {@link ClaudiusTranslations} from the English defaults,
 * applying the given overrides.
 *
 * @param overrides - Strings to override on top of {@link defaultTranslations}.
 * @returns A complete translations object.
 */
export function createTranslations(
  overrides?: Partial<ClaudiusTranslations>,
): ClaudiusTranslations {
  return { ...defaultTranslations, ...overrides };
}
