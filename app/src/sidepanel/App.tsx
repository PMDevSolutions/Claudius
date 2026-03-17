import { useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { runSEOChecks } from "@/lib/seo-analyzer";
import { calculateAnalysis } from "@/lib/scoring";
import { fetchAndAnalyzePage } from "@/lib/fetch-page";
import { detectLanguage } from "@/lib/languages";
import { generateRecommendation, generateAllH2Suggestions } from "@/lib/openai";
import {
  saveKeywordForUrl,
  getKeywordForUrl,
  saveAdvancedOptions,
  getAdvancedOptions,
  saveTabAnalysis,
  getTabAnalysis,
  clearTabAnalysis,
} from "@/lib/storage";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Onboarding } from "@/components/Onboarding";
import { Toast } from "@/components/ui/Toast";
import { SetupPage } from "./pages/SetupPage";
import { LoadingPage } from "./pages/LoadingPage";
import { ScorePage } from "./pages/ScorePage";
import { SubscoresPage } from "./pages/SubscoresPage";
import type { PageSEOData, SEOCheck, SEOAnalysis } from "@/types/seo";

const isDevMode =
  typeof chrome === "undefined" || chrome.tabs === undefined;

/** Auto-generate AI recommendations for failing copyable checks and H2 suggestions. */
async function generateAIRecommendations(
  analysis: SEOAnalysis,
  apiKey: string,
  keyword: string,
  advancedOptions?: { pageType?: string; secondaryKeywords?: string; languageCode?: string },
): Promise<string | null> {
  const allChecks = analysis.categories.flatMap((c) => c.checks);
  const promises: Promise<void>[] = [];
  for (const check of allChecks) {
    if (check.status === "pass") continue;

    // Auto-generate H2 suggestions
    if (check.id === "h2-keyword" && check.h2Recommendations?.length) {
      promises.push(
        generateAllH2Suggestions(
          apiKey,
          check.h2Recommendations.map((h) => h.text),
          keyword,
          advancedOptions,
        ).then((suggestions) => {
          check.h2Recommendations!.forEach((h, i) => {
            h.suggestion = suggestions[i] ?? "";
          });
        }),
      );
      continue;
    }

    // Auto-generate text recommendations for copyable checks
    if (check.copyable) {
      const context = getCheckContext(check, analysis);
      promises.push(
        generateRecommendation(apiKey, check.id, keyword, context, advancedOptions)
          .then((rec) => { check.recommendation = rec; }),
      );
    }
  }

  if (promises.length === 0) return null;

  const settled = await Promise.allSettled(promises);
  const failures = settled.filter((r) => r.status === "rejected");

  if (failures.length === 0) return null;

  // Determine error type from the first failure
  const firstError = (failures[0] as PromiseRejectedResult).reason;
  const errorMsg = firstError?.message ?? String(firstError);

  if (errorMsg.includes("401") || errorMsg.includes("Incorrect API key") || errorMsg.includes("invalid_api_key")) {
    return "Invalid OpenAI API key — AI suggestions could not be generated.";
  }
  if (errorMsg.includes("429") || errorMsg.includes("rate_limit")) {
    return "OpenAI rate limit reached — some AI suggestions were skipped.";
  }
  if (errorMsg.includes("insufficient_quota") || errorMsg.includes("billing")) {
    return "OpenAI quota exceeded — check your billing at platform.openai.com.";
  }

  if (failures.length === settled.length) {
    return `AI suggestions failed: ${errorMsg}`;
  }

  return `${failures.length} of ${settled.length} AI suggestions failed to generate.`;
}

function getCheckContext(check: SEOCheck, analysis: SEOAnalysis): string {
  switch (check.id) {
    case "title-keyword": return analysis.pageData.title;
    case "meta-description-keyword": return analysis.pageData.metaDescription;
    case "keyword-url": return analysis.pageData.url;
    case "h1-keyword": return analysis.pageData.h1[0] ?? "";
    case "keyword-intro": return analysis.pageData.paragraphs[0] ?? "";
    default: return check.details ?? "";
  }
}

/** Send a message to the service worker, handling MV3 error edge cases. */
async function sendToServiceWorker<T>(
  message: unknown,
  timeout = 15000,
  retries = 2,
): Promise<{ data?: T; error?: string }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // Wait before retry to give service worker time to wake up
      console.log(`[AI SEO Copilot] Retrying service worker message (attempt ${attempt + 1})`);
      await new Promise((r) => setTimeout(r, 500));
    }

    const result = await new Promise<{ data?: T; error?: string }>((resolve) => {
      const timer = setTimeout(
        () => resolve({ error: "Service worker timed out. Please refresh the page and try again." }),
        timeout,
      );

      try {
        chrome.runtime.sendMessage(message, (resp) => {
          clearTimeout(timer);
          // Check lastError first (MV3 sets this for various failures)
          if (chrome.runtime.lastError) {
            resolve({ error: chrome.runtime.lastError.message });
            return;
          }
          if (resp?.error) {
            resolve({ error: resp.error });
          } else if (resp?.data !== undefined) {
            resolve({ data: resp.data as T });
          } else if (resp) {
            resolve({ data: resp as T });
          } else {
            resolve({ error: "No response from service worker" });
          }
        });
      } catch (err) {
        // MV3 can throw synchronously if service worker doesn't exist
        clearTimeout(timer);
        resolve({ error: err instanceof Error ? err.message : "Service worker unavailable" });
      }
    });

    // If we got data, return immediately
    if (result.data) return result;

    // If this is the last attempt, return the error
    if (attempt === retries) return result;

    // Otherwise, retry if it's a connection error
    if (!result.error?.includes("Could not establish connection")) {
      return result; // Non-recoverable error, don't retry
    }
  }

  return { error: "Service worker unavailable after retries" };
}

/** Direct executeScript fallback — used when service worker is unavailable. */
async function directExecuteScript(tabId: number): Promise<PageSEOData> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const getMetaContent = (name: string): string => {
        const el =
          document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`) ||
          document.querySelector<HTMLMetaElement>(`meta[property="${name}"]`);
        return el?.content ?? "";
      };
      const getHeadings = (tag: string): string[] =>
        Array.from(document.querySelectorAll(tag)).map(
          (el) => el.textContent?.trim() ?? "",
        );
      const images = Array.from(document.querySelectorAll<HTMLImageElement>("img")).map((img) => ({
        src: img.src, alt: img.alt ?? "", width: img.naturalWidth || null, height: img.naturalHeight || null,
      }));
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));
      const host = window.location.hostname;
      let internal = 0, external = 0;
      for (const link of links) {
        try { new URL(link.href).hostname === host ? internal++ : external++; }
        catch { internal++; }
      }
      const bodyText = document.body?.innerText ?? "";
      const ogTags: Record<string, string> = {};
      document.querySelectorAll<HTMLMetaElement>('meta[property^="og:"]').forEach((el) => {
        ogTags[el.getAttribute("property")!] = el.content;
      });
      const twitterTags: Record<string, string> = {};
      document.querySelectorAll<HTMLMetaElement>('meta[name^="twitter:"]').forEach((el) => {
        twitterTags[el.getAttribute("name")!] = el.content;
      });
      const paragraphs = Array.from(document.querySelectorAll("p"))
        .map((el) => el.textContent?.trim() ?? "").filter(Boolean);
      const jsRes = Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"))
        .map((el) => el.src).filter(Boolean);
      const cssRes = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
        .map((el) => el.href).filter(Boolean);
      const schemas = Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'));
      const schemaTypes: string[] = [];
      for (const s of schemas) { try { const d = JSON.parse(s.textContent ?? ""); if (d["@type"]) schemaTypes.push(d["@type"]); } catch { /* ignore */ } }
      return {
        url: window.location.href, title: document.title ?? "",
        metaDescription: getMetaContent("description"), metaKeywords: getMetaContent("keywords"),
        canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? "",
        h1: getHeadings("h1"), h2: getHeadings("h2"), h3: getHeadings("h3"),
        h4: getHeadings("h4"), h5: getHeadings("h5"), h6: getHeadings("h6"),
        images, ogTags, twitterTags, wordCount: bodyText.split(/\s+/).filter(Boolean).length,
        internalLinks: internal, externalLinks: external,
        lang: document.documentElement.lang ?? "", paragraphs,
        resources: { js: jsRes, css: cssRes },
        schemaMarkup: { types: schemaTypes, count: schemas.length },
        ogImage: getMetaContent("og:image"), imageFileSizes: [],
      };
    },
  });
  const data = results?.[0]?.result;
  if (!data) throw new Error("Failed to extract page data via executeScript");
  return data as PageSEOData;
}

/** Extract SEO data from the active tab.
 *  Uses service worker's executeScript (most reliable in dev mode). */
async function extractPageData(tabId: number): Promise<PageSEOData> {
  // Go directly to service worker — it uses executeScript which is most reliable
  // (Content script check causes uncaught promise rejections in Chrome MV3)
  const swResponse = await sendToServiceWorker<PageSEOData>(
    { type: "EXTRACT_PAGE_DATA", tabId },
    15000,
  );

  if (swResponse.data) return swResponse.data;

  // Fallback: direct executeScript from side panel (may hang in CRXJS dev mode)
  console.warn("[AI SEO Copilot] Service worker failed, trying direct executeScript:", swResponse.error);
  try {
    return await directExecuteScript(tabId);
  } catch (directErr) {
    // All methods failed — throw the most informative error
    throw new Error(
      `Page extraction failed. Service worker: ${swResponse.error}. Direct: ${directErr instanceof Error ? directErr.message : String(directErr)}`,
    );
  }
}

export default function App() {
  const { view, setView, setAnalysis, setError, settings, setSettings, loadApiKey, hideToast, toast, reset } =
    useStore();

  useEffect(() => {
    loadApiKey();
  }, [loadApiKey]);

  // Register this tab with the service worker for per-tab panel scoping
  useEffect(() => {
    if (isDevMode) return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.runtime.sendMessage({ type: "PANEL_OPENED", tabId: tabs[0].id });
      }
    });
  }, []);

  // Load saved keyword/settings for a given URL
  const loadSettingsForUrl = useCallback(
    async (url: string) => {
      try {
        const savedKeyword = await getKeywordForUrl(url);
        const host = new URL(url).hostname;
        const savedOptions = await getAdvancedOptions(host);
        if (savedKeyword) setSettings({ keyword: savedKeyword });
        if (savedOptions) {
          setSettings({
            pageType: savedOptions.pageType,
            secondaryKeywords: savedOptions.secondaryKeywords,
            language: savedOptions.language,
            advancedMode: true,
          });
        }
      } catch {
        // Invalid URL
      }
    },
    [setSettings],
  );

  // Auto-detect URL and load saved keyword/settings on mount
  useEffect(() => {
    async function loadSavedSettings() {
      if (!isDevMode) {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab?.url) {
            await loadSettingsForUrl(tab.url);
          }
        } catch {
          // Not in extension context
        }
      } else {
        const { settings } = useStore.getState();
        if (settings.targetUrl.trim()) {
          await loadSettingsForUrl(settings.targetUrl);
        }
      }
    }
    loadSavedSettings();
  }, [setSettings, loadSettingsForUrl]);

  // Listen for same-tab navigation — reset to setup page when URL changes
  useEffect(() => {
    if (isDevMode) return;

    let currentUrl = "";

    // Get the initial URL
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url) currentUrl = tabs[0].url;
    });

    // When the active tab navigates to a new URL
    const handleTabUpdated = (
      tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
    ) => {
      // Only care about completed navigations with a URL change
      if (changeInfo.status !== "complete") return;

      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (tabs[0]?.id === tabId && tabs[0].url && tabs[0].url !== currentUrl) {
          currentUrl = tabs[0].url;
          // Clear saved analysis since URL changed
          await clearTabAnalysis(tabId);
          reset();
          await loadSettingsForUrl(currentUrl);
        }
      });
    };

    // When the user switches to a different tab
    const handleTabActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
      chrome.tabs.get(activeInfo.tabId, async (tab) => {
        if (chrome.runtime.lastError) return;
        if (tab.url && tab.url !== currentUrl) {
          currentUrl = tab.url;

          // Try to restore saved analysis for this tab
          const savedState = await getTabAnalysis(activeInfo.tabId);
          if (savedState && savedState.url === tab.url) {
            // Restore the analysis
            setAnalysis(savedState.analysis);
            if (savedState.settings) {
              setSettings(savedState.settings);
            }
            setView("score");
          } else {
            // No saved analysis for this tab/URL, reset to setup
            reset();
            await loadSettingsForUrl(currentUrl);
          }
        }
      });
    };

    chrome.tabs.onUpdated.addListener(handleTabUpdated);
    chrome.tabs.onActivated.addListener(handleTabActivated);

    return () => {
      chrome.tabs.onUpdated.removeListener(handleTabUpdated);
      chrome.tabs.onActivated.removeListener(handleTabActivated);
    };
  }, [reset, loadSettingsForUrl, setView, setAnalysis, setSettings]);

  const handleAnalyze = useCallback(async () => {
    setView("loading");
    setError(null);

    try {
      let pageData: PageSEOData;

      if (!isDevMode) {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!tab?.id) throw new Error("No active tab found");

        pageData = await extractPageData(tab.id);
      } else {
        if (!settings.targetUrl.trim()) {
          throw new Error("Please enter a URL to analyze");
        }
        pageData = await fetchAndAnalyzePage(settings.targetUrl);
      }

      // Auto-detect language on first visit
      if (!settings.advancedMode && pageData.lang) {
        const detected = detectLanguage(pageData.lang);
        if (detected !== "en") {
          setSettings({ language: detected });
        }
      }

      const checks = runSEOChecks(pageData, {
        keyword: settings.keyword,
        secondaryKeywords: settings.secondaryKeywords,
        pageType: settings.pageType,
      });
      const analysis = calculateAnalysis(checks, pageData, settings.keyword);

      setAnalysis(analysis);

      // Auto-generate AI recommendations in background (non-blocking)
      const { apiKey } = useStore.getState();
      if (apiKey) {
        const advancedOptions = settings.advancedMode
          ? {
              pageType: settings.pageType,
              secondaryKeywords: settings.secondaryKeywords,
              languageCode: settings.language,
            }
          : undefined;

        generateAIRecommendations(
          analysis,
          apiKey,
          settings.keyword,
          advancedOptions,
        ).then((aiError) => {
          const store = useStore.getState();
          // Re-set analysis to trigger re-render with populated recommendations
          store.setAnalysis({ ...analysis });
          if (aiError) store.showToast(aiError);
        }).catch((err) => {
          useStore.getState().showToast(`AI error: ${err?.message ?? err}`);
        });
      }

      // Save keyword and settings for this URL
      try {
        await saveKeywordForUrl(pageData.url, settings.keyword);
        if (settings.advancedMode) {
          const host = new URL(pageData.url).hostname;
          await saveAdvancedOptions(host, {
            pageType: settings.pageType,
            secondaryKeywords: settings.secondaryKeywords,
            language: settings.language,
          });
        }
      } catch {
        // Storage save failure is non-critical
      }

      // Save analysis to session storage for per-tab persistence
      if (!isDevMode) {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab?.id) {
            await saveTabAnalysis(tab.id, {
              analysis,
              settings: {
                keyword: settings.keyword,
                secondaryKeywords: settings.secondaryKeywords,
                pageType: settings.pageType,
                language: settings.language,
                advancedMode: settings.advancedMode,
              },
              url: pageData.url,
              savedAt: Date.now(),
            });
          }
        } catch {
          // Session storage save failure is non-critical
        }
      }

      // Highlight issues on page (extension only, ignore errors if content script unavailable)
      if (!isDevMode) {
        try {
          const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, { type: "HIGHLIGHT_ISSUES" }, () => {
              // Suppress "Could not establish connection" error
              void chrome.runtime.lastError;
            });
          }
        } catch {
          // Content script not available, ignore
        }
      }

      setView("score");
    } catch (error) {
      console.error("[AI SEO Copilot] Analysis failed:", error);
      setError(
        error instanceof Error ? error.message : "Analysis failed",
      );
      setView("setup");
    }
  }, [settings, setView, setAnalysis, setError, setSettings]);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-bg-900">
        <Onboarding />
        {view === "setup" && <SetupPage onAnalyze={handleAnalyze} />}
        {view === "loading" && <LoadingPage />}
        {view === "score" && <ScorePage />}
        {view === "subscores" && <SubscoresPage />}
        <Toast message={toast.message} visible={toast.visible} onClose={hideToast} />
      </div>
    </ErrorBoundary>
  );
}
