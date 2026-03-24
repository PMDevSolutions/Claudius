export { ChatWidget } from "./components/ChatWidget";
export type {
  ChatWidgetProps,
  WidgetPosition,
  ClaudiusTranslations,
} from "./components/ChatWidget";
export { defaultTranslations, createTranslations } from "./i18n";
export { ChatApiClient } from "./api/client";
export type { ChatApiClientOptions } from "./api/client";
export { ChatApiError, DebounceError } from "./api/errors";
export type {
  Source,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ChatErrorResponse,
} from "./api/types";
