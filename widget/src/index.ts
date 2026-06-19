export { ChatWidget } from "./components/ChatWidget";
export type {
  ChatWidgetProps,
  WidgetPosition,
  ClaudiusTranslations,
} from "./components/ChatWidget";
export { defaultTranslations, createTranslations } from "./i18n";
export { locales, detectLocale, resolveTranslations } from "./locales";
export type { LocaleCode, ResolveTranslationsOptions } from "./locales";
export type { Trigger, TriggerAction, UrlPattern } from "./hooks/useTriggers";
export { builtinThemes } from "./theme";
export type {
  ClaudiusTheme,
  ClaudiusThemeInput,
  BuiltinThemeName,
  ThemeColorToken,
  ThemeRadiusToken,
  ThemeShadowToken,
  ThemeFontToken,
} from "./theme";
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

// Plugin SDK: the ClaudiusPlugin interface, supporting types, and the three
// reference plugins.
export type {
  ClaudiusPlugin,
  PluginContext,
  BeforeSendContext,
  ErrorContext,
  PluginReply,
  MaybePromise,
} from "./plugins";
export {
  pluginAnalytics,
  pluginRedactPII,
  pluginCannedResponses,
  redactText,
  DEFAULT_PII_PATTERNS,
} from "./plugins";
export type {
  AnalyticsPluginOptions,
  ClaudiusAnalyticsEvent,
  RedactPiiOptions,
  CannedRule,
  CannedResponsesOptions,
} from "./plugins";
