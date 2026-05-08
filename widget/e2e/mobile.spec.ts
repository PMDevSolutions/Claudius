import { test, expect } from "@playwright/test";
import { mockChatApi } from "./helpers";

test.describe("mobile responsive layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("opens as a bottom sheet with a scrim and a drag handle", async ({ page }) => {
    await page.getByRole("button", { name: /open chat/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveClass(/claudius-bottom-sheet/);
    await expect(dialog).toHaveAttribute("aria-modal", "true");

    // Drag handle: the small rounded bar inside the aria-hidden wrapper.
    const dragHandle = dialog.locator('[aria-hidden="true"] .rounded-full').first();
    await expect(dragHandle).toBeVisible();

    // Scrim is rendered as a sibling of the dialog with the dedicated class.
    await expect(page.locator(".claudius-scrim")).toBeVisible();
  });

  test("tapping the scrim closes the bottom sheet", async ({ page }) => {
    await page.getByRole("button", { name: /open chat/i }).click();
    const scrim = page.locator(".claudius-scrim");
    await expect(scrim).toBeVisible();

    // The bottom sheet occupies the lower 90vh — click the scrim near the top
    // so the click doesn't land on the dialog underneath.
    await scrim.click({ position: { x: 50, y: 20 } });
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("send a message and receive a reply on mobile", async ({ page }) => {
    const api = await mockChatApi(page);
    api.enqueueReply("Hello from mobile!");

    await page.getByRole("button", { name: /open chat/i }).click();
    const input = page.getByLabel(/type your message/i);
    await input.fill("Hi");
    await input.press("Enter");

    const log = page.getByRole("log");
    await expect(log.getByText("Hi")).toBeVisible();
    await expect(log.getByText("Hello from mobile!")).toBeVisible();
  });
});
