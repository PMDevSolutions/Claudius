import type { ClaudiusTranslations } from "../i18n";

export const en: ClaudiusTranslations = {
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

  // GreetingBubble
  dismissGreeting: "Dismiss greeting",

  // Errors
  errorGeneric: "Something went wrong. Please try again.",
  errorConnection: "Failed to connect. Please try again.",
  errorTimeout: "Request timed out. Please try again.",
  errorRateLimitMinute: "Too many requests. Please wait a minute.",
  errorRateLimitHour: "Hourly limit reached. Please try again later.",
  errorRetry: "Retry",
};
