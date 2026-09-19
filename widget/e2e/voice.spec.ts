import { test, expect, type Page } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mockChatApi } from "./helpers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const IIFE_PATH = resolve(__dirname, "..", "dist", "claudius.iife.js");
const CSS_PATH = resolve(__dirname, "..", "dist", "claudius.css");

/**
 * Voice features against fake speech engines, injected before the app loads.
 * Real engines cannot run here: CI has no microphone, and Chromium builds ship
 * without the key for Google's recognition service. The fakes let these specs
 * prove the wiring in a real browser; engine behaviour is covered by the unit
 * tests in src/hooks/__tests__.
 */
async function installFakeSpeech(page: Page) {
  await page.addInitScript(() => {
    type Handler = ((event: unknown) => void) | null;

    class FakeRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onstart: Handler = null;
      onend: Handler = null;
      onerror: Handler = null;
      onresult: Handler = null;
      onspeechstart: Handler = null;
      onspeechend: Handler = null;
      start() {
        (window as unknown as { __recognition: FakeRecognition }).__recognition =
          this;
        this.onstart?.({});
      }
      stop() {
        this.onend?.({});
      }
      abort() {}
      /** The engine ends the session by itself, as it does at a pause. */
      end() {
        this.onend?.({});
      }
      hear(transcript: string, isFinal: boolean) {
        this.onresult?.({
          results: [{ isFinal, length: 1, 0: { transcript } }],
        });
      }
    }

    const spoken: string[] = [];
    let current: SpeechSynthesisUtterance | null = null;
    const synth = {
      speaking: false,
      pending: false,
      paused: false,
      spoken,
      speak(utterance: SpeechSynthesisUtterance) {
        spoken.push(`${utterance.lang}|${utterance.text}`);
        current = utterance;
        this.speaking = true;
      },
      // Per the spec, cancel() does not clear the paused state.
      cancel() {
        this.speaking = false;
        current = null;
      },
      // Like Chrome and Safari: `paused` flips only when the engine confirms,
      // which is also when the utterance gets its `pause` event.
      pause() {
        setTimeout(() => {
          this.paused = true;
          current?.onpause?.call(current, new Event("pause") as never);
        }, 0);
      },
      resume() {
        this.paused = false;
        current?.onresume?.call(current, new Event("resume") as never);
      },
      getVoices: () => [],
    };

    const w = window as unknown as Record<string, unknown>;
    // Chrome 139+ exposes the unprefixed constructor too, and the widget
    // prefers it, so replace both or the real engine would be started.
    w.SpeechRecognition = FakeRecognition;
    w.webkitSpeechRecognition = FakeRecognition;
    Object.defineProperty(window, "speechSynthesis", {
      value: synth,
      configurable: true,
    });
  });
}

function hear(page: Page, transcript: string, isFinal: boolean) {
  return page.evaluate(
    ([text, final]) =>
      (
        window as unknown as {
          __recognition: { hear(t: string, f: boolean): void };
        }
      ).__recognition.hear(text as string, final as boolean),
    [transcript, isFinal] as const,
  );
}

test.describe("voice input and read-aloud", () => {
  test("dictates into the message field, then sends like a typed message", async ({
    page,
  }) => {
    await installFakeSpeech(page);
    const api = await mockChatApi(page);
    api.enqueueReply("Plans start at $10.");
    await page.goto("/");
    await page.getByRole("button", { name: /open chat/i }).click();

    const mic = page.getByRole("button", { name: "Voice input" });
    const input = page.getByLabel(/type your message/i);
    await mic.click();
    await expect(mic).toHaveAttribute("aria-pressed", "true");
    await expect(input).toHaveAttribute("placeholder", "Listening...");

    await hear(page, "what are your pri", false);
    await expect(input).toHaveValue("what are your pri");
    await hear(page, "what are your prices", true);

    // Clicking again stops; the text stays for review rather than auto-sending.
    await mic.click();
    await expect(mic).toHaveAttribute("aria-pressed", "false");
    await expect(input).toHaveValue("what are your prices");
    expect(api.callCount()).toBe(0);

    await input.press("Enter");
    const log = page.getByRole("log");
    await expect(log.getByText("what are your prices")).toBeVisible();
    await expect(log.getByText("Plans start at $10.")).toBeVisible();
  });

  test("keeps the newest words in view during a long dictation", async ({
    page,
  }) => {
    await installFakeSpeech(page);
    await page.goto("/");
    await page.getByRole("button", { name: /open chat/i }).click();
    await page.getByRole("button", { name: "Voice input" }).click();

    await hear(page, "and then some more words ".repeat(10), false);

    // The field is not focused while dictating, so the browser will not
    // scroll it by itself; without help it would show only the first words.
    const input = page.getByLabel(/type your message/i);
    await expect
      .poll(() => input.evaluate((el: HTMLInputElement) => el.scrollLeft))
      .toBeGreaterThan(0);
  });

  test("hold-to-talk through the embed bundle: a real press and release", async ({
    page,
  }) => {
    await installFakeSpeech(page);
    const api = await mockChatApi(page);
    api.enqueueReply("Yes, 20 percent.");
    // Same approach as embed.spec.ts: the dev origin, minus the dev widget.
    await page.goto("/");
    await page.evaluate(() => {
      document.getElementById("root")?.remove();
      (window as unknown as { ClaudiusConfig: unknown }).ClaudiusConfig = {
        apiUrl: "https://test.example",
        voice: { mode: "hold", autoSubmit: true },
      };
    });
    await page.addStyleTag({ path: CSS_PATH });
    await page.addScriptTag({ path: IIFE_PATH });
    await page.getByRole("button", { name: /open chat/i }).click();

    const mic = page.getByRole("button", { name: "Hold to talk" });
    const box = (await mic.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(mic).toHaveAttribute("aria-pressed", "true");
    await hear(page, "do you offer", true);

    // The engine ends the session at a pause, with the button still down.
    // A new session takes over, and nothing is sent yet.
    await page.evaluate(() =>
      (
        window as unknown as { __recognition: { end(): void } }
      ).__recognition.end(),
    );
    await expect(mic).toHaveAttribute("aria-pressed", "true");
    expect(api.callCount()).toBe(0);
    await hear(page, "a discount", true);

    await page.mouse.up();

    const log = page.getByRole("log");
    await expect(log.getByText("do you offer a discount")).toBeVisible();
    await expect(log.getByText("Yes, 20 percent.")).toBeVisible();
    // Exactly one message: the click Chromium fires after the release carries
    // a click count, so it must not have started another dictation.
    expect(api.callCount()).toBe(1);
    await expect(mic).toHaveAttribute("aria-pressed", "false");
  });

  test("reads a reply aloud with pause and stop controls", async ({ page }) => {
    await installFakeSpeech(page);
    const api = await mockChatApi(page);
    api.enqueueReply("Plans start at **$10** a month.");
    await page.goto("/");
    await page.getByRole("button", { name: /open chat/i }).click();

    const input = page.getByLabel(/type your message/i);
    await input.fill("Prices?");
    await input.press("Enter");

    const log = page.getByRole("log");
    await log.getByRole("button", { name: "Read aloud" }).click();

    // Markdown markers are stripped before the text reaches the engine.
    const spoken = await page.evaluate(
      () =>
        (window as unknown as { speechSynthesis: { spoken: string[] } })
          .speechSynthesis.spoken,
    );
    expect(spoken).toEqual(["en-US|Plans start at $10 a month."]);

    await log.getByRole("button", { name: "Pause reading" }).click();
    await expect(
      log.getByRole("button", { name: "Resume reading" }),
    ).toBeVisible();

    await log.getByRole("button", { name: "Stop reading" }).click();
    await expect(log.getByRole("button", { name: "Read aloud" })).toBeVisible();
  });

  test("shows no voice controls in a browser without the Web Speech API", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      delete w.webkitSpeechRecognition;
      delete w.SpeechRecognition;
      Object.defineProperty(window, "speechSynthesis", {
        value: undefined,
        configurable: true,
      });
    });
    const api = await mockChatApi(page);
    api.enqueueReply("Plans start at $10.");
    await page.goto("/");
    await page.getByRole("button", { name: /open chat/i }).click();

    const input = page.getByLabel(/type your message/i);
    await input.fill("Prices?");
    await input.press("Enter");
    await expect(page.getByRole("log").getByText("Plans start at $10.")).toBeVisible();

    await expect(page.getByRole("button", { name: "Voice input" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Read aloud" })).toHaveCount(0);
  });
});
