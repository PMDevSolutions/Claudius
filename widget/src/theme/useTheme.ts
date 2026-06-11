import { useEffect, useMemo, useState } from "react";
import {
  resolveThemeInput,
  themeToCssVars,
  type ColorSchemeMode,
} from "./resolve";
import type { ClaudiusTheme, ClaudiusThemeInput } from "./types";

function isThemeShaped(value: unknown): value is ClaudiusTheme {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface UseThemeResult {
  mode: ColorSchemeMode;
  /** --cl-* custom properties to apply inline on the widget root. */
  cssVars: Record<string, string>;
}

/**
 * Resolves the `theme` option into a color-scheme mode and a set of CSS
 * custom properties. URL inputs are fetched; any failure (network, JSON,
 * shape) logs one console.error and leaves the default theme active so the
 * widget never breaks because a theme file is unreachable.
 */
export function useTheme(
  input: ClaudiusThemeInput | undefined,
): UseThemeResult {
  const resolved = useMemo(() => resolveThemeInput(input), [input]);
  const [fetched, setFetched] = useState<ClaudiusTheme | null>(null);

  const url = resolved.url;

  useEffect(() => {
    setFetched(null);
    if (!url) return;

    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      })
      .then((json: unknown) => {
        if (!isThemeShaped(json)) {
          throw new Error("theme JSON must be an object");
        }
        setFetched(json);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        console.error(`[Claudius] Failed to load theme from ${url}:`, err);
      });

    return () => controller.abort();
  }, [url]);

  const activeTheme = resolved.theme ?? fetched ?? null;
  const mode = fetched?.colorScheme ?? resolved.mode;

  const cssVars = useMemo(
    () => (activeTheme ? themeToCssVars(activeTheme) : {}),
    [activeTheme],
  );

  return { mode, cssVars };
}
