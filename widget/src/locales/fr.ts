import type { ClaudiusTranslations } from "../i18n";

export const fr: ClaudiusTranslations = {
  // ChatWindow
  title: "Chat",
  subtitle: "Posez-moi vos questions",
  welcomeMessage: "Bonjour ! Comment puis-je vous aider aujourd'hui ?",
  closeChat: "Fermer le chat",
  chatMessages: "Messages du chat",
  typingIndicator: "L'assistant écrit",

  // ChatInput
  placeholder: "Saisissez votre message...",
  sendMessage: "Envoyer le message",
  typeYourMessage: "Saisissez votre message",

  // ChatToggleButton
  openChat: "Ouvrir le chat",

  // GreetingBubble
  dismissGreeting: "Ignorer le message d'accueil",

  // Errors
  errorGeneric: "Une erreur s'est produite. Veuillez réessayer.",
  errorConnection: "Échec de la connexion. Veuillez réessayer.",
  errorTimeout: "La requête a expiré. Veuillez réessayer.",
  errorRateLimitMinute: "Trop de requêtes. Veuillez patienter une minute.",
  errorRateLimitHour: "Limite horaire atteinte. Veuillez réessayer plus tard.",
  errorRetry: "Réessayer",
};
