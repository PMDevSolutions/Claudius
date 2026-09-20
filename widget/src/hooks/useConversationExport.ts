import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage } from "../api/types";
import type { HeaderMenuItem } from "../components/HeaderMenu";
import { defaultTranslations, type ClaudiusTranslations } from "../i18n";
import {
  conversationToJson,
  conversationToMarkdown,
  exportFilename,
} from "../utils/exportConversation";
import { copyText, downloadTextFile } from "../utils/saveText";

const STATUS_MS = 4000;

interface UseConversationExportOptions {
  enabled: boolean;
  messages: readonly ChatMessage[];
  /** True while a reply is in flight. Export waits for it. */
  busy: boolean;
  /** BCP-47 tag used for the dates in a transcript. */
  locale: string;
  translations?: ClaudiusTranslations;
}

interface UseConversationExportReturn {
  /** The header menu's items. Empty when the feature is off. */
  items: HeaderMenuItem[];
  /** The result of the last copy, shown briefly, or `null`. */
  status: string | null;
  clearStatus: () => void;
}

/**
 * The three export actions as header-menu items, plus the transient status a
 * copy reports. Everything happens in the browser.
 */
export function useConversationExport({
  enabled,
  messages,
  busy,
  locale,
  translations,
}: UseConversationExportOptions): UseConversationExportReturn {
  const t = translations ?? defaultTranslations;
  const [status, setStatus] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    // Set here, not only at the ref's creation: React 18 Strict Mode mounts,
    // runs the cleanup, and mounts again, which would otherwise leave this
    // false for the whole life of the component.
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const clearStatus = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setStatus(null);
  }, []);

  const showStatus = useCallback((text: string) => {
    // The copy can settle after the window has closed.
    if (!mounted.current) return;
    if (timer.current) clearTimeout(timer.current);
    setStatus(text);
    timer.current = setTimeout(() => {
      timer.current = null;
      setStatus(null);
    }, STATUS_MS);
  }, []);

  const items = useMemo<HeaderMenuItem[]>(() => {
    if (!enabled) return [];

    // A transcript whose last message is cut short is worse than a control
    // that is unavailable for a few seconds.
    const disabled = busy || messages.length === 0;
    const markdown = () =>
      conversationToMarkdown(messages, {
        locale,
        labels: {
          title: t.transcriptTitle,
          exported: t.transcriptExported,
          user: t.transcriptUser,
          assistant: t.transcriptAssistant,
          attachments: t.transcriptAttachments,
          sources: t.transcriptSources,
          toolUsed: t.toolUsed,
        },
      });

    return [
      {
        id: "copy-markdown",
        label: t.copyAsMarkdown,
        disabled,
        onSelect: () => {
          // Built and handed over synchronously: Firefox and Safari only
          // allow a clipboard write during the click's user activation.
          void copyText(markdown()).then((ok) =>
            showStatus(ok ? t.copiedToClipboard : t.copyFailed),
          );
        },
      },
      {
        id: "download-markdown",
        label: t.downloadAsMarkdown,
        disabled,
        onSelect: () =>
          downloadTextFile(
            exportFilename("md"),
            markdown(),
            "text/markdown;charset=utf-8",
          ),
      },
      {
        id: "download-json",
        label: t.downloadAsJson,
        disabled,
        onSelect: () =>
          downloadTextFile(
            exportFilename("json"),
            conversationToJson(messages),
            "application/json",
          ),
      },
    ];
  }, [enabled, busy, messages, locale, t, showStatus]);

  return { items, status, clearStatus };
}
