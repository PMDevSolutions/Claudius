import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { mockChatApi } from "./helpers";

/**
 * Conversation export in a real browser: an actual file download, the real
 * clipboard where the permission can be granted, and Escape. Serialization
 * edge cases are covered by the unit tests in src/utils/__tests__.
 */
async function haveConversation(page: Page) {
  const api = await mockChatApi(page);
  api.enqueueReply("Plans start at $10.");
  await page.goto("/");
  await page.getByRole("button", { name: /open chat/i }).click();
  const input = page.getByLabel(/type your message/i);
  await input.fill("What are your prices?");
  await input.press("Enter");
  await expect(
    page.getByRole("log").getByText("Plans start at $10."),
  ).toBeVisible();
}

test.describe("conversation export", () => {
  test("downloads the conversation as Markdown", async ({ page }) => {
    await haveConversation(page);

    await page.getByRole("button", { name: "More options" }).click();
    const downloading = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "Download as Markdown" }).click();
    const download = await downloading;

    expect(download.suggestedFilename()).toMatch(
      /^chat-transcript-\d{4}-\d{2}-\d{2}\.md$/,
    );
    const text = await readFile(await download.path(), "utf8");
    expect(text).toContain("# Chat transcript");
    expect(text).toMatch(/## User · .+\n\nWhat are your prices\?/);
    expect(text).toMatch(/## Assistant · .+\n\nPlans start at \$10\./);
  });

  test("downloads the conversation as JSON", async ({ page }) => {
    await haveConversation(page);

    await page.getByRole("button", { name: "More options" }).click();
    const downloading = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "Download as JSON" }).click();
    const download = await downloading;

    expect(download.suggestedFilename()).toMatch(/\.json$/);
    const messages = JSON.parse(await readFile(await download.path(), "utf8"));
    expect(messages.map((m: { role: string }) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(messages[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("copies the conversation as Markdown", async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "Only Chromium lets a test grant clipboard permissions",
    );
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await haveConversation(page);

    await page.getByRole("button", { name: "More options" }).click();
    await page.getByRole("menuitem", { name: "Copy as Markdown" }).click();

    await expect(page.getByText("Copied to clipboard")).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain("Plans start at $10.");
  });

  test("Escape closes the menu first, then the chat", async ({ page }) => {
    await haveConversation(page);
    const trigger = page.getByRole("button", { name: "More options" });

    await trigger.click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(trigger).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("the actions are unavailable until there is something to export", async ({
    page,
  }) => {
    await mockChatApi(page);
    await page.goto("/");
    await page.getByRole("button", { name: /open chat/i }).click();

    await page.getByRole("button", { name: "More options" }).click();
    for (const item of await page.getByRole("menuitem").all()) {
      await expect(item).toHaveAttribute("aria-disabled", "true");
    }
  });
});
