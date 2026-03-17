/**
 * Playwright test fixtures for Chrome Extension E2E testing.
 *
 * Provides:
 * - extensionContext: A persistent browser context with the extension loaded
 * - extensionId: The dynamically-resolved extension ID
 * - extensionPopup: A page opened to the extension's popup.html
 * - extensionServiceWorker: The extension's background service worker
 *
 * Usage in tests:
 *   import { test, expect } from "./fixtures";
 *
 *   test("popup renders", async ({ extensionPopup }) => {
 *     await expect(extensionPopup.locator("h1")).toHaveText("My Extension");
 *   });
 */

import { test as base, chromium, type BrowserContext, type Page, type Worker } from "@playwright/test";
import { resolve } from "path";

// Path to built extension — override via EXTENSION_PATH env var
const EXTENSION_DIR = resolve(process.env.EXTENSION_PATH || "./dist");

interface ExtensionFixtures {
  extensionContext: BrowserContext;
  extensionId: string;
  extensionPopup: Page;
  extensionServiceWorker: Worker;
}

export const test = base.extend<ExtensionFixtures>({
  // Persistent context with extension loaded
  extensionContext: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_DIR}`,
        `--load-extension=${EXTENSION_DIR}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-default-apps",
      ],
    });
    await use(context);
    await context.close();
  },

  // Resolve the extension's ID from chrome://extensions
  extensionId: async ({ extensionContext }, use) => {
    // Wait for the service worker to register — this gives us the extension ID
    let serviceWorker: Worker;

    // Check if a service worker already exists
    const existingWorkers = extensionContext.serviceWorkers();
    if (existingWorkers.length > 0) {
      serviceWorker = existingWorkers[0];
    } else {
      // Wait for one to appear
      serviceWorker = await extensionContext.waitForEvent("serviceworker", {
        timeout: 10_000,
      });
    }

    // Extract extension ID from service worker URL
    // Format: chrome-extension://<extension-id>/service-worker.js
    const url = serviceWorker.url();
    const match = url.match(/chrome-extension:\/\/([^/]+)/);
    if (!match) {
      throw new Error(`Could not extract extension ID from service worker URL: ${url}`);
    }

    const extensionId = match[1];
    await use(extensionId);
  },

  // Open the extension popup as a full page
  extensionPopup: async ({ extensionContext, extensionId }, use) => {
    // Open popup.html directly as a page (extensions can't be "clicked" in automated tests)
    const popupPage = await extensionContext.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: "domcontentloaded",
    });
    await use(popupPage);
    await popupPage.close();
  },

  // Access the background service worker
  extensionServiceWorker: async ({ extensionContext }, use) => {
    const existingWorkers = extensionContext.serviceWorkers();
    const worker =
      existingWorkers.length > 0
        ? existingWorkers[0]
        : await extensionContext.waitForEvent("serviceworker", { timeout: 10_000 });
    await use(worker);
  },
});

export { expect } from "@playwright/test";
