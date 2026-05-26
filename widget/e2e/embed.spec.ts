import { test, expect } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mockChatApi } from "./helpers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const IIFE_PATH = resolve(__dirname, "..", "dist", "claudius.iife.js");
const CSS_PATH = resolve(__dirname, "..", "dist", "claudius.css");

const FAKE_API = "https://test.example/api";

async function loadEmbed(
  page: import("@playwright/test").Page,
  init: () => void,
): Promise<void> {
  // Use the dev origin so cross-origin fetch + route() works cleanly. The
  // dev app mounts its own widget at #root — strip it so only the embed
  // bundle's widget exists for assertions.
  await page.goto("/");
  await page.evaluate(() => {
    document.getElementById("root")?.remove();
  });
  await page.evaluate(init);
  await page.addStyleTag({ path: CSS_PATH });
  await page.addScriptTag({ path: IIFE_PATH });
}

test.describe("embed script (IIFE bundle)", () => {
  test("auto-initialises from window.ClaudiusConfig", async ({ page }) => {
    const api = await mockChatApi(page);
    api.enqueueReply("Hello from the embed bundle!");

    await loadEmbed(page, () => {
      (window as unknown as { ClaudiusConfig: unknown }).ClaudiusConfig = {
        apiUrl: "https://test.example",
        title: "Embed Test",
      };
    });

    // The auto-init path appends a #claudius-chat-widget container with the toggle.
    await expect(page.locator("#claudius-chat-widget")).toBeAttached();
    await expect(
      page.getByRole("button", { name: /open chat/i }),
    ).toBeVisible();

    // End-to-end: open, send, receive — all driven by the bundled code.
    await page.getByRole("button", { name: /open chat/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("Embed Test")).toBeVisible();

    const input = page.getByLabel(/type your message/i);
    await input.fill("Ping");
    await input.press("Enter");

    await expect(
      page.getByRole("log").getByText("Hello from the embed bundle!"),
    ).toBeVisible();
    expect(api.callCount()).toBe(1);
  });

  test("registers <claudius-chat> as a working web component", async ({ page }) => {
    const api = await mockChatApi(page);
    api.enqueueReply("Web component reply");

    await loadEmbed(page, () => {
      // No ClaudiusConfig — auto-init runs but logs an error and exits.
      // The web-component path should still work.
    });

    // Inject the custom element after the script registers it.
    await page.evaluate((apiUrl) => {
      const el = document.createElement("claudius-chat");
      el.setAttribute("api-url", apiUrl);
      el.setAttribute("title", "WC Test");
      document.body.appendChild(el);
    }, FAKE_API.replace(/\/api$/, ""));

    await expect(
      page.getByRole("button", { name: /open chat/i }),
    ).toBeVisible();

    await page.getByRole("button", { name: /open chat/i }).click();
    await expect(page.getByText("WC Test")).toBeVisible();

    const input = page.getByLabel(/type your message/i);
    await input.fill("Hi WC");
    await input.press("Enter");

    await expect(
      page.getByRole("log").getByText("Web component reply"),
    ).toBeVisible();
    expect(api.callCount()).toBe(1);
  });
});
