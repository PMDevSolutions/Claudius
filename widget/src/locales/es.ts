import type { ClaudiusTranslations } from "../i18n";

export const es: ClaudiusTranslations = {
  // ChatWindow
  title: "Chat",
  subtitle: "Pregúntame lo que quieras",
  welcomeMessage: "¡Hola! ¿En qué puedo ayudarte hoy?",
  closeChat: "Cerrar chat",
  chatMessages: "Mensajes del chat",
  typingIndicator: "El asistente está escribiendo",

  // ChatInput
  placeholder: "Escribe tu mensaje...",
  sendMessage: "Enviar mensaje",
  typeYourMessage: "Escribe tu mensaje",

  // ChatToggleButton
  openChat: "Abrir chat",

  // GreetingBubble
  dismissGreeting: "Descartar saludo",

  // Errors
  errorGeneric: "Algo salió mal. Inténtalo de nuevo.",
  errorConnection: "No se pudo conectar. Inténtalo de nuevo.",
  errorTimeout: "La solicitud tardó demasiado. Inténtalo de nuevo.",
  errorRateLimitMinute: "Demasiadas solicitudes. Espera un minuto.",
  errorRateLimitHour: "Has alcanzado el límite por hora. Inténtalo más tarde.",
  errorRetry: "Reintentar",
};
