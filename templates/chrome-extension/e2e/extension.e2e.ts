/**
 * Example Chrome Extension E2E tests.
 *
 * These tests demonstrate the patterns for testing:
 * - Extension loading and manifest validation
 * - Popup rendering and interactions
 * - Background service worker functionality
 * - Chrome storage API
 * - Content script injection (on a test page)
 * - Message passing between popup and background
 *
 * Adapt these templates to your extension's specific functionality.
 */

import { test, expect } from "./fixtures";

test.describe("Extension Loading", () => {
  test("extension loads successfully", async ({ extensionId }) => {
    expect(extensionId).toBeTruthy();
    expect(extensionId).toMatch(/^[a-z]{32}$/);
  });

  test("service worker is active", async ({ extensionServiceWorker }) => {
    expect(extensionServiceWorker).toBeTruthy();
    expect(extensionServiceWorker.url()).toContain("chrome-extension://");
  });
});

test.describe("Popup", () => {
  test("popup page loads", async ({ extensionPopup }) => {
    // Verify the popup loaded without errors
    await expect(extensionPopup).toHaveTitle(/.+/);
  });

  test("popup renders main heading", async ({ extensionPopup }) => {
    // TODO: Replace with your extension's actual heading
    const heading = extensionPopup.locator("h1").first();
    await expect(heading).toBeVisible();
  });

  test("popup has expected dimensions", async ({ extensionPopup }) => {
    // Chrome extension popups have a max width of 800px and max height of 600px
    const viewport = extensionPopup.viewportSize();
    expect(viewport).toBeTruthy();
    if (viewport) {
      expect(viewport.width).toBeLessThanOrEqual(800);
      expect(viewport.height).toBeLessThanOrEqual(600);
    }
  });

  test("popup interactive elements are keyboard accessible", async ({ extensionPopup }) => {
    // Tab through the popup and verify focus moves to interactive elements
    const buttons = extensionPopup.locator("button");
    const buttonCount = await buttons.count();

    if (buttonCount > 0) {
      await extensionPopup.keyboard.press("Tab");
      const focusedElement = extensionPopup.locator(":focus");
      await expect(focusedElement).toBeVisible();
    }
  });
});

test.describe("Chrome Storage", () => {
  test("can read and write to chrome.storage.local", async ({ extensionServiceWorker, extensionId }) => {
    // Evaluate in the service worker context to test storage
    const result = await extensionServiceWorker.evaluate(async () => {
      // Write a test value
      await chrome.storage.local.set({ testKey: "testValue" });
      // Read it back
      const data = await chrome.storage.local.get("testKey");
      // Clean up
      await chrome.storage.local.remove("testKey");
      return data.testKey;
    });

    expect(result).toBe("testValue");
  });
});

test.describe("Content Script", () => {
  test("content script injects on matching pages", async ({ extensionContext, extensionId }) => {
    // Open a page that matches the content script's URL pattern
    // TODO: Replace with a URL that matches your manifest's content_scripts.matches
    const testPage = await extensionContext.newPage();
    await testPage.goto("https://example.com", { waitUntil: "domcontentloaded" });

    // Wait for content script to inject (give it time)
    await testPage.waitForTimeout(1000);

    // TODO: Replace with an assertion that verifies your content script's effect
    // Example: Check if a DOM element was injected
    // const injectedElement = testPage.locator("[data-extension-id]");
    // await expect(injectedElement).toBeVisible();

    await testPage.close();
  });
});

test.describe("Message Passing", () => {
  test("popup can communicate with background", async ({ extensionPopup, extensionId }) => {
    // Test message passing from popup to background
    const response = await extensionPopup.evaluate(async () => {
      return new Promise((resolve, reject) => {
        // TODO: Replace with your extension's actual message type
        chrome.runtime.sendMessage({ type: "PING" }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError.message);
          } else {
            resolve(response);
          }
        });
      });
    });

    // TODO: Replace with expected response from your background script
    // expect(response).toEqual({ type: "PONG" });
    expect(response).toBeDefined();
  });
});

test.describe("Visual Regression", () => {
  test("popup matches expected appearance", async ({ extensionPopup }) => {
    // Take a screenshot for visual comparison
    // This integrates with Playwright's built-in visual comparison
    await expect(extensionPopup).toHaveScreenshot("popup-default.png", {
      maxDiffPixelRatio: 0.02,
    });
  });

  test("popup matches at different states", async ({ extensionPopup }) => {
    // TODO: Trigger different states and capture screenshots
    // Example: After clicking a button
    // const button = extensionPopup.locator("button").first();
    // await button.click();
    // await expect(extensionPopup).toHaveScreenshot("popup-after-click.png");
  });
});
