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
  stopGenerating: "Detener la respuesta",
  toolUsed: "Herramienta usada:",
  toolDetails: "Detalles de la herramienta",
  typeYourMessage: "Escribe tu mensaje",

  // ChatToggleButton
  openChat: "Abrir chat",

  // GreetingBubble
  dismissGreeting: "Descartar saludo",

  // Attachments
  attachFile: "Adjuntar un archivo",
  removeAttachment: "Quitar adjunto",
  attachmentsLabel: "Adjuntos",
  dropFilesHint: "Suelta los archivos para adjuntarlos",
  attachmentTooLarge: "{name} es demasiado grande. El tamaño máximo es {max}.",
  attachmentTypeNotAllowed: "{name} no es un tipo de archivo compatible.",
  attachmentTooMany: "Puedes adjuntar hasta {max} archivos por mensaje.",

  // Voice
  voiceInput: "Entrada de voz",
  voiceInputHold: "Mantén pulsado para hablar",
  voiceListening: "Escuchando...",
  voicePermissionDenied:
    "El acceso al micrófono está bloqueado. Permítelo en la configuración de tu navegador para usar la entrada de voz.",
  voiceNoSpeech: "No se detectó ninguna voz. Inténtalo de nuevo.",
  voiceNoMicrophone: "No se encontró ningún micrófono.",
  voiceUnavailable: "La entrada de voz no está disponible en este momento.",
  readAloud: "Leer en voz alta",
  pauseReading: "Pausar la lectura",
  resumeReading: "Reanudar la lectura",
  stopReading: "Detener la lectura",

  // Conversation export
  moreOptions: "Más opciones",
  copyAsMarkdown: "Copiar como Markdown",
  downloadAsMarkdown: "Descargar como Markdown",
  downloadAsJson: "Descargar como JSON",
  copiedToClipboard: "Copiado al portapapeles",
  copyFailed: "No se pudo copiar. Prueba a descargarlo.",
  transcriptTitle: "Transcripción del chat",
  transcriptExported: "Exportado el {date}",
  transcriptUser: "Usuario",
  transcriptAssistant: "Asistente",
  transcriptAttachments: "Adjuntos:",
  transcriptSources: "Fuentes:",

  // Errors
  errorGeneric: "Algo salió mal. Inténtalo de nuevo.",
  errorConnection: "No se pudo conectar. Inténtalo de nuevo.",
  errorTimeout: "La solicitud tardó demasiado. Inténtalo de nuevo.",
  errorRateLimitMinute: "Demasiadas solicitudes. Espera un minuto.",
  errorRateLimitHour: "Has alcanzado el límite por hora. Inténtalo más tarde.",
  errorAttachmentRejected:
    "Se rechazó un adjunto. Quítalo e inténtalo de nuevo.",
  errorAttachmentQuota: "Límite de subida alcanzado. Inténtalo más tarde.",
  errorRetry: "Reintentar",
};
