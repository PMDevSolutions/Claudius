import { test, expect } from "@playwright/test";
import { mockChatApi } from "./helpers";

/**
 * Inline citations in a real browser: the chip, the request flag, and the
 * reveal (scroll plus focus), which jsdom cannot exercise. Marker parsing and
 * the footer's states are covered by the unit tests.
 */
test.describe("inline citations", () => {
  test("a chip reveals and focuses its source card", async ({ page }) => {
    // No real request to example.com for the favicon: abort it so the
    // fallback icon renders and the run stays offline.
    await page.route("https://example.com/**", (route) => route.abort());

    const api = await mockChatApi(page);
    api.enqueueReply("Plans start at $10 a month [1].", [
      {
        url: "https://example.com/pricing",
        title: "Pricing",
        type: "page",
        snippet: "Plans start at $10 a month, billed annually.",
      },
    ]);
    const bodies: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().endsWith("/api/chat")) {
        bodies.push(request.postData() ?? "");
      }
    });

    await page.goto("/");
    await page.getByRole("button", { name: /open chat/i }).click();
    const input = page.getByLabel(/type your message/i);
    await input.fill("What are your prices?");
    await input.press("Enter");

    const chip = page.getByRole("button", { name: "Source 1: Pricing" });
    await expect(chip).toBeVisible();
    await expect(chip).toHaveText("1");
    expect(bodies).toHaveLength(1);
    expect(JSON.parse(bodies[0])).toMatchObject({ citations: true });

    const toggle = page.getByRole("button", { name: /^Sources/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await chip.click();

    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const card = page.getByRole("listitem").filter({ hasText: "Pricing" });
    await expect(card).toHaveCount(1);
    await expect(card).toBeFocused();
    await expect(card).toBeInViewport();
    await expect(card).toContainText(
      "Plans start at $10 a month, billed annually.",
    );
    const link = card.getByRole("link", { name: /Pricing/ });
    await expect(link).toHaveAttribute("href", "https://example.com/pricing");
    await expect(link).toHaveAttribute("target", "_blank");
  });
});
