export interface ClaudiusTranslations {
  // ChatWindow
  title: string;
  subtitle: string;
  welcomeMessage: string;
  closeChat: string;
  chatMessages: string;

  // ChatInput
  placeholder: string;
  sendMessage: string;
  typeYourMessage: string;

  // ChatToggleButton
  openChat: string;

  // Errors
  errorGeneric: string;
  errorConnection: string;
  errorRateLimitMinute: string;
  errorRateLimitHour: string;

  // Dialog / a11y
  dialogLabel: string;
  newMessageAnnouncement: string;
}

export const defaultTranslations: ClaudiusTranslations = {
  // ChatWindow
  title: "Chat",
  subtitle: "Ask me anything",
  welcomeMessage: "Hi! How can I help you today?",
  closeChat: "Close chat",
  chatMessages: "Chat messages",

  // ChatInput
  placeholder: "Type your message...",
  sendMessage: "Send message",
  typeYourMessage: "Type your message",

  // ChatToggleButton
  openChat: "Open chat",

  // Errors
  errorGeneric: "Something went wrong. Please try again.",
  errorConnection: "Failed to connect. Please try again.",
  errorRateLimitMinute: "Too many requests. Please wait a minute.",
  errorRateLimitHour: "Hourly limit reached. Please try again later.",

  // Dialog / a11y
  dialogLabel: "Chat dialog",
  newMessageAnnouncement: "New message from assistant",
};

export function createTranslations(
  overrides?: Partial<ClaudiusTranslations>
): ClaudiusTranslations {
  return { ...defaultTranslations, ...overrides };
}
