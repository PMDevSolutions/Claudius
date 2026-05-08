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

  // Errors
  errorGeneric: string;
  errorConnection: string;
  errorTimeout: string;
  errorRateLimitMinute: string;
  errorRateLimitHour: string;
  errorRetry: string;
}

export const defaultTranslations: ClaudiusTranslations = {
  // ChatWindow
  title: "Chat",
  subtitle: "Ask me anything",
  welcomeMessage: "Hi! How can I help you today?",
  closeChat: "Close chat",
  chatMessages: "Chat messages",
  typingIndicator: "Assistant is typing",

  // ChatInput
  placeholder: "Type your message...",
  sendMessage: "Send message",
  typeYourMessage: "Type your message",

  // ChatToggleButton
  openChat: "Open chat",

  // Errors
  errorGeneric: "Something went wrong. Please try again.",
  errorConnection: "Failed to connect. Please try again.",
  errorTimeout: "Request timed out. Please try again.",
  errorRateLimitMinute: "Too many requests. Please wait a minute.",
  errorRateLimitHour: "Hourly limit reached. Please try again later.",
  errorRetry: "Retry",
};

export function createTranslations(
  overrides?: Partial<ClaudiusTranslations>
): ClaudiusTranslations {
  return { ...defaultTranslations, ...overrides };
}
