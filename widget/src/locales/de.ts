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
  stopGenerating: "Generierung stoppen",
  toolUsed: "Verwendetes Tool:",
  toolDetails: "Tool-Details",
  typeYourMessage: "Geben Sie Ihre Nachricht ein",

  // ChatToggleButton
  openChat: "Chat öffnen",

  // GreetingBubble
  dismissGreeting: "Begrüßung schließen",

  // Attachments
  attachFile: "Datei anhängen",
  removeAttachment: "Anhang entfernen",
  attachmentsLabel: "Anhänge",
  dropFilesHint: "Dateien hier ablegen, um sie anzuhängen",
  attachmentTooLarge: "{name} ist zu groß. Die maximale Größe beträgt {max}.",
  attachmentTypeNotAllowed: "{name} ist kein unterstützter Dateityp.",
  attachmentTooMany: "Sie können bis zu {max} Dateien pro Nachricht anhängen.",

  // Errors
  errorGeneric: "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.",
  errorConnection: "Verbindung fehlgeschlagen. Bitte versuchen Sie es erneut.",
  errorTimeout:
    "Zeitüberschreitung der Anfrage. Bitte versuchen Sie es erneut.",
  errorRateLimitMinute: "Zu viele Anfragen. Bitte warten Sie eine Minute.",
  errorRateLimitHour:
    "Stündliches Limit erreicht. Bitte versuchen Sie es später erneut.",
  errorAttachmentRejected:
    "Ein Anhang wurde abgelehnt. Bitte entfernen Sie ihn und versuchen Sie es erneut.",
  errorAttachmentQuota:
    "Upload-Limit erreicht. Bitte versuchen Sie es später erneut.",
  errorRetry: "Erneut versuchen",
};
