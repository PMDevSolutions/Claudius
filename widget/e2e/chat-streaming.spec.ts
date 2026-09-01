import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";

/**
 * Streaming chat flow, exercised against a real SSE server on :8787 (the
 * port the dev app's widget targets). Playwright's route.fulfill can only
 * answer with a complete body, so progressive delivery, cancellation, and
 * mid-stream failures need an actual streaming HTTP server.
 */

interface SseStep {
  /** Milliseconds to wait before this step. */
  delay?: number;
  /** Emit a chunk event with this text. */
  text?: string;
  /** Emit an in-band error event and end the response. */
  error?: string;
  /** Emit the done event with the full reply and end the response. */
  done?: string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// One shared server on :8787 and a mutable per-test script: everything in
// this file must run in a single worker, in order (fullyParallel would
// otherwise spread the tests across workers and collide on the port).
test.describe.configure({ mode: "serial" });

let server: Server;
// Each test assigns the script the next stream request should play back.
let script: SseStep[] = [];

test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    if (req.method === "POST" && req.url === "/api/chat/stream") {
      res.writeHead(200, {
        ...CORS_HEADERS,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      });

      const steps = script;
      for (const step of steps) {
        if (step.delay) await sleep(step.delay);
        if (res.destroyed) return; // client cancelled
        if (step.text !== undefined) {
          res.write(
            `event: chunk\ndata: ${JSON.stringify({ text: step.text })}\n\n`,
          );
        } else if (step.error !== undefined) {
          res.write(
            `event: error\ndata: ${JSON.stringify({
              error: step.error,
              code: "STREAM_ERROR",
            })}\n\n`,
          );
          res.end();
          return;
        } else if (step.done !== undefined) {
          res.write(
            `event: done\ndata: ${JSON.stringify({ reply: step.done })}\n\n`,
          );
          res.end();
          return;
        }
      }
      res.end();
      return;
    }

    res.writeHead(404, { ...CORS_HEADERS, "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(8787, "127.0.0.1", resolve);
  });
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test.describe("streaming chat flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /open chat/i }).click();
  });

  async function send(page: import("@playwright/test").Page, text: string) {
    const input = page.getByLabel(/type your message/i);
    await input.fill(text);
    await input.press("Enter");
  }

  test("tokens render progressively in the assistant bubble", async ({
    page,
  }) => {
    script = [
      { delay: 50, text: "Streaming " },
      { delay: 400, text: "tokens " },
      { delay: 400, text: "arrive." },
      { delay: 100, done: "Streaming tokens arrive." },
    ];

    await send(page, "Stream please");

    const log = page.getByRole("log");
    // The partial text must be visible while the tail is still pending.
    await expect(log.getByText(/^Streaming\s*$/)).toBeVisible();
    await expect(log.getByText("Streaming tokens arrive.")).toBeVisible();

    // Stream finished: stop button gone, input usable again.
    await expect(
      page.getByRole("button", { name: /stop generating/i }),
    ).toHaveCount(0);
    await expect(page.getByLabel(/type your message/i)).toBeEnabled();
  });

  test("stop button cancels the stream and keeps the partial reply", async ({
    page,
  }) => {
    script = [
      { delay: 50, text: "Partial answer " },
      // A long tail the test cancels before.
      { delay: 8000, text: "never seen" },
      { delay: 10, done: "unused" },
    ];

    await send(page, "Long answer please");

    const log = page.getByRole("log");
    await expect(log.getByText(/Partial answer/)).toBeVisible();

    await page.getByRole("button", { name: /stop generating/i }).click();

    // The partial reply stays, no error is shown, and the UI resets.
    await expect(log.getByText(/Partial answer/)).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /stop generating/i }),
    ).toHaveCount(0);
    await expect(page.getByLabel(/type your message/i)).toBeEnabled();
    await expect(log.getByText("never seen")).toHaveCount(0);
  });

  test("mid-stream error keeps the partial reply and shows an error", async ({
    page,
  }) => {
    script = [
      { delay: 50, text: "Partial before failure" },
      { delay: 200, error: "AI service temporarily unavailable." },
    ];

    await send(page, "Fail mid-stream please");

    const log = page.getByRole("log");
    await expect(log.getByText("Partial before failure")).toBeVisible();

    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    // Partial text survives alongside the error.
    await expect(log.getByText("Partial before failure")).toBeVisible();
    await expect(page.getByLabel(/type your message/i)).toBeEnabled();
  });
});
