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
  stopGenerating: "Stop generating",
  toolUsed: "Used tool:",
  toolDetails: "Tool details",
  typeYourMessage: "Type your message",

  // ChatToggleButton
  openChat: "Open chat",

  // GreetingBubble
  dismissGreeting: "Dismiss greeting",

  // Attachments
  attachFile: "Attach a file",
  removeAttachment: "Remove attachment",
  attachmentsLabel: "Attachments",
  dropFilesHint: "Drop files to attach",
  attachmentTooLarge: "{name} is too large. The maximum size is {max}.",
  attachmentTypeNotAllowed: "{name} is not a supported file type.",
  attachmentTooMany: "You can attach up to {max} files per message.",

  // Voice
  voiceInput: "Voice input",
  voiceInputHold: "Hold to talk",
  voiceListening: "Listening...",
  voicePermissionDenied:
    "Microphone access is blocked. Allow it in your browser settings to use voice input.",
  voiceNoSpeech: "No speech was detected. Please try again.",
  voiceNoMicrophone: "No microphone was found.",
  voiceUnavailable: "Voice input is not available right now.",
  readAloud: "Read aloud",
  pauseReading: "Pause reading",
  resumeReading: "Resume reading",
  stopReading: "Stop reading",

  // Conversation export
  moreOptions: "More options",
  copyAsMarkdown: "Copy as Markdown",
  downloadAsMarkdown: "Download as Markdown",
  downloadAsJson: "Download as JSON",
  copiedToClipboard: "Copied to clipboard",
  copyFailed: "Could not copy. Try downloading instead.",
  transcriptTitle: "Chat transcript",
  transcriptExported: "Exported {date}",
  transcriptUser: "User",
  transcriptAssistant: "Assistant",
  transcriptAttachments: "Attachments:",
  transcriptSources: "Sources:",

  // Errors
  errorGeneric: "Something went wrong. Please try again.",
  errorConnection: "Failed to connect. Please try again.",
  errorTimeout: "Request timed out. Please try again.",
  errorRateLimitMinute: "Too many requests. Please wait a minute.",
  errorRateLimitHour: "Hourly limit reached. Please try again later.",
  errorAttachmentRejected:
    "An attachment was rejected. Please remove it and try again.",
  errorAttachmentQuota: "Upload limit reached. Please try again later.",
  errorRetry: "Retry",
};
