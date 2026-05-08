import type { Page, Route } from "@playwright/test";

/**
 * Intercept POST /api/chat with a queue of replies. The dev app points the
 * widget at http://localhost:8787, so we route any URL ending in /api/chat
 * regardless of host. Each call consumes the next response in the queue.
 *
 * Because requests are cross-origin (page on :5173, widget points at :8787)
 * the mock includes CORS headers and answers the OPTIONS preflight.
 */
export interface ApiMockHandle {
  enqueueReply: (reply: string, sources?: unknown) => void;
  enqueueError: (status: number, body: { error: string; code?: string }) => void;
  callCount: () => number;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Retry-After",
  "Access-Control-Expose-Headers": "Retry-After",
};

export async function mockChatApi(page: Page): Promise<ApiMockHandle> {
  const queue: Array<(route: Route) => Promise<void>> = [];
  let calls = 0;

  await page.route("**/api/chat", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }

    calls += 1;
    const handler = queue.shift();
    if (!handler) {
      await route.fulfill({
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "no mock queued", code: "TEST_ERROR" }),
      });
      return;
    }
    await handler(route);
  });

  return {
    enqueueReply(reply, sources) {
      queue.push(async (route) => {
        await route.fulfill({
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          body: JSON.stringify({ reply, sources }),
        });
      });
    },
    enqueueError(status, body) {
      queue.push(async (route) => {
        await route.fulfill({
          status,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      });
    },
    callCount: () => calls,
  };
}
