import { test, expect } from "@playwright/test";
import { mockChatApi } from "./helpers";

test.describe("desktop chat flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("toggle button opens and closes the chat window", async ({ page }) => {
    const toggle = page.getByRole("button", { name: /open chat/i });
    await expect(toggle).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await toggle.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Header close button (first in DOM order).
    await dialog.getByRole("button", { name: /close chat/i }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(toggle).toBeFocused();
  });

  test("send a message and render the assistant reply", async ({ page }) => {
    const api = await mockChatApi(page);
    api.enqueueReply("Plans start at $1,000/month.");

    await page.getByRole("button", { name: /open chat/i }).click();

    const input = page.getByLabel(/type your message/i);
    await input.fill("What are your prices?");
    await input.press("Enter");

    const log = page.getByRole("log");
    await expect(log.getByText("What are your prices?")).toBeVisible();
    await expect(log.getByText(/Plans start at \$1,000/)).toBeVisible();
    expect(api.callCount()).toBe(1);

    // Typing indicator must clear after the reply lands.
    await expect(
      page.getByRole("status", { name: /assistant is typing/i }),
    ).toHaveCount(0);
  });

  test("Escape closes the chat and returns focus to the toggle", async ({ page }) => {
    const toggle = page.getByRole("button", { name: /open chat/i });
    await toggle.click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(toggle).toBeFocused();
  });

  test("focus traps inside the dialog when tabbing", async ({ page }) => {
    await page.getByRole("button", { name: /open chat/i }).click();

    // After several Tab presses the active element must remain inside the dialog.
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
    }

    const dialogContainsActive = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      return !!dlg && dlg.contains(document.activeElement);
    });
    expect(dialogContainsActive).toBe(true);
  });

  test("Retry button recovers from a network failure", async ({ page }) => {
    const api = await mockChatApi(page);
    api.enqueueError(500, { error: "Server error", code: "SERVICE_ERROR" });

    await page.getByRole("button", { name: /open chat/i }).click();
    await page.getByLabel(/type your message/i).fill("Hello");
    await page.getByLabel(/type your message/i).press("Enter");

    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    const retryBtn = page.getByRole("button", { name: /retry/i });
    await expect(retryBtn).toBeVisible();

    api.enqueueReply("Welcome back!");
    await retryBtn.click();

    const log = page.getByRole("log");
    await expect(log.getByText("Welcome back!")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(api.callCount()).toBe(2);
  });
});
