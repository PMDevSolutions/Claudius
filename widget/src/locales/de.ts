import type { ClaudiusTranslations } from "../i18n";

export const de: ClaudiusTranslations = {
  // ChatWindow
  title: "Chat",
  subtitle: "Fragen Sie mich alles",
  welcomeMessage: "Hallo! Wie kann ich Ihnen heute helfen?",
  closeChat: "Chat schließen",
  chatMessages: "Chat-Nachrichten",
  typingIndicator: "Der Assistent schreibt",

  // ChatInput
  placeholder: "Geben Sie Ihre Nachricht ein...",
  sendMessage: "Nachricht senden",
  typeYourMessage: "Geben Sie Ihre Nachricht ein",

  // ChatToggleButton
  openChat: "Chat öffnen",

  // GreetingBubble
  dismissGreeting: "Begrüßung schließen",

  // Errors
  errorGeneric: "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.",
  errorConnection: "Verbindung fehlgeschlagen. Bitte versuchen Sie es erneut.",
  errorTimeout:
    "Zeitüberschreitung der Anfrage. Bitte versuchen Sie es erneut.",
  errorRateLimitMinute: "Zu viele Anfragen. Bitte warten Sie eine Minute.",
  errorRateLimitHour:
    "Stündliches Limit erreicht. Bitte versuchen Sie es später erneut.",
  errorRetry: "Erneut versuchen",
};
