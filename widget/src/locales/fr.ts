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
  stopGenerating: "Arrêter la génération",
  toolUsed: "Outil utilisé :",
  toolDetails: "Détails de l'outil",
  typeYourMessage: "Saisissez votre message",

  // ChatToggleButton
  openChat: "Ouvrir le chat",

  // GreetingBubble
  dismissGreeting: "Ignorer le message d'accueil",

  // Attachments
  attachFile: "Joindre un fichier",
  removeAttachment: "Retirer la pièce jointe",
  attachmentsLabel: "Pièces jointes",
  dropFilesHint: "Déposez les fichiers pour les joindre",
  attachmentTooLarge:
    "{name} est trop volumineux. La taille maximale est de {max}.",
  attachmentTypeNotAllowed:
    "{name} n'est pas un type de fichier pris en charge.",
  attachmentTooMany: "Vous pouvez joindre jusqu'à {max} fichiers par message.",

  // Errors
  errorGeneric: "Une erreur s'est produite. Veuillez réessayer.",
  errorConnection: "Échec de la connexion. Veuillez réessayer.",
  errorTimeout: "La requête a expiré. Veuillez réessayer.",
  errorRateLimitMinute: "Trop de requêtes. Veuillez patienter une minute.",
  errorRateLimitHour: "Limite horaire atteinte. Veuillez réessayer plus tard.",
  errorAttachmentRejected:
    "Une pièce jointe a été refusée. Retirez-la et réessayez.",
  errorAttachmentQuota:
    "Limite d'envoi atteinte. Veuillez réessayer plus tard.",
  errorRetry: "Réessayer",
};
