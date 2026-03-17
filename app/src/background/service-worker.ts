console.log("[AI SEO Copilot] Service worker initializing...");

// Disable automatic panel opening - we'll handle it manually for per-tab scoping
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

// Handle action click to open panel only on the specific tab
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;

  // Open the panel on this specific tab (must be synchronous for user gesture)
  chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: "src/sidepanel/index.html",
    enabled: true,
  });
  chrome.sidePanel.open({ tabId: tab.id });
});

// Track which tabs have the panel open for per-tab scoping
// Persisted to session storage to survive MV3 service worker restarts
const panelTabs = new Set<number>();
const PANEL_TABS_KEY = "panel_tabs";

// Load persisted panel tabs on startup
chrome.storage.session.get(PANEL_TABS_KEY).then((result) => {
  const saved = result[PANEL_TABS_KEY] as number[] | undefined;
  if (saved?.length) {
    saved.forEach((id) => panelTabs.add(id));
    console.log("[AI SEO Copilot] Restored panel tabs:", saved);
  }
}).catch(() => {
  // Ignore errors
});

async function persistPanelTabs(): Promise<void> {
  try {
    await chrome.storage.session.set({ [PANEL_TABS_KEY]: Array.from(panelTabs) });
  } catch {
    // Ignore errors
  }
}

async function addPanelTab(tabId: number): Promise<void> {
  panelTabs.add(tabId);
  await persistPanelTabs();

  // Immediately disable the panel on ALL other tabs
  // This ensures the panel only shows on the tab where it was opened
  try {
    const allTabs = await chrome.tabs.query({});
    for (const tab of allTabs) {
      if (tab.id && tab.id !== tabId) {
        chrome.sidePanel.setOptions({ tabId: tab.id, enabled: false });
      }
    }
  } catch {
    // Ignore errors
  }
}

async function removePanelTab(tabId: number): Promise<void> {
  panelTabs.delete(tabId);
  await persistPanelTabs();
}

console.log("[AI SEO Copilot] Service worker initialized successfully");

// When the user switches tabs, hide the panel unless it was opened on that tab.
// Only start scoping after the panel has been opened at least once — otherwise
// the first click after install/reload would be blocked (chicken-and-egg bug).
chrome.tabs.onActivated.addListener(({ tabId }) => {
  console.log("[AI SEO Copilot] Tab activated:", tabId, "panelTabs:", Array.from(panelTabs));
  if (panelTabs.size === 0) {
    console.log("[AI SEO Copilot] panelTabs empty, skipping");
    return;
  }
  if (panelTabs.has(tabId)) {
    console.log("[AI SEO Copilot] Enabling panel for tab:", tabId);
    chrome.sidePanel.setOptions({
      tabId,
      path: "src/sidepanel/index.html",
      enabled: true,
    });
  } else {
    console.log("[AI SEO Copilot] Disabling panel for tab:", tabId);
    chrome.sidePanel.setOptions({ tabId, enabled: false });
  }
});

// Clean up when tabs close
chrome.tabs.onRemoved.addListener((tabId) => {
  removePanelTab(tabId);
  // Clean up per-tab analysis from session storage
  chrome.storage.session.remove(`tab_analysis_${tabId}`).catch(() => {
    // Ignore errors (e.g., if session storage is unavailable)
  });
});

console.log("[AI SEO Copilot] Registering message listener...");

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log("[AI SEO Copilot] Received message:", message.type);

  // Ping handler for verifying service worker is responsive
  if (message.type === "PING") {
    console.log("[AI SEO Copilot] Responding to PING");
    sendResponse({ pong: true, timestamp: Date.now() });
    return true;
  }

  // Side panel reports which tab it opened on
  if (message.type === "PANEL_OPENED") {
    if (message.tabId) {
      addPanelTab(message.tabId as number).then(() => {
        sendResponse({ ok: true });
      });
      return true;
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "GET_ACTIVE_TAB") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ tab: tabs[0] });
    });
    return true;
  }

  if (message.type === "EXECUTE_CONTENT_SCRIPT") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) {
        sendResponse({ error: "No active tab" });
        return;
      }

      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            return true;
          },
        });
        sendResponse({ results });
      } catch (error) {
        sendResponse({ error: String(error) });
      }
    });
    return true;
  }

  // Extract SEO data by injecting analyzer script directly
  // (Side panel already tried content script and it failed, so skip that step here)
  if (message.type === "EXTRACT_PAGE_DATA") {
    const tabId = message.tabId as number;
    console.log("[AI SEO Copilot] EXTRACT_PAGE_DATA for tab:", tabId);
    (async () => {
      try {
        // Inject the analyzer directly via executeScript
        console.log("[AI SEO Copilot] Executing analyzer script...");
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
            for (const s of schemas) { try { const d = JSON.parse(s.textContent ?? ""); if (d["@type"]) schemaTypes.push(d["@type"]); } catch {} }
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
        console.log("[AI SEO Copilot] executeScript completed, results:", results?.length ?? 0);
        const data = results?.[0]?.result;
        if (data) {
          console.log("[AI SEO Copilot] Sending extracted data back");
          sendResponse({ data });
        } else {
          console.log("[AI SEO Copilot] No data from executeScript");
          sendResponse({ error: "Failed to extract page data" });
        }
      } catch (error) {
        console.error("[AI SEO Copilot] EXTRACT_PAGE_DATA error:", error);
        sendResponse({ error: String(error) });
      }
    })().catch((err) => {
      // Catch any unhandled promise rejections from the async IIFE
      console.error("[AI SEO Copilot] Unhandled error in EXTRACT_PAGE_DATA:", err);
      try {
        sendResponse({ error: String(err) });
      } catch {
        // sendResponse may have already been called
      }
    });
    return true;
  }

  if (message.type === "SEND_TO_CONTENT") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) {
        sendResponse({ error: "No active tab" });
        return;
      }
      chrome.tabs.sendMessage(tabId, message.payload, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
          return;
        }
        sendResponse(response);
      });
    });
    return true;
  }
});
