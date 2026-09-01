import { describe, it, expect, vi } from "vitest";

// Mock the Anthropic SDK with a shared spy so tests can assert call arguments
const createSpy = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    content: [{ type: "text", text: "Hello! How can I help?" }],
    usage: { input_tokens: 12, output_tokens: 7 },
  }),
);
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: createSpy };
    },
  };
});

import { handleChat, ChatRequest } from "../chat";
import { SYSTEM_PROMPT } from "../system-prompt";

describe("handleChat", () => {
  it("returns assistant response and telemetry for valid request", async () => {
    const request: ChatRequest = {
      messages: [{ role: "user", content: "What are your prices?" }],
    };

    const result = await handleChat(request, "test-api-key");

    expect(result.response.reply).toBe("Hello! How can I help?");
    expect(result.telemetry).toMatchObject({
      inputTokens: 12,
      outputTokens: 7,
    });
    expect(result.telemetry.model).toMatch(/^claude-/);
  });

  it("rejects empty messages array", async () => {
    const request: ChatRequest = { messages: [] };

    await expect(handleChat(request, "test-api-key")).rejects.toThrow(
      "Messages array is required",
    );
  });

  it("uses the compiled-in system prompt by default", async () => {
    const request: ChatRequest = {
      messages: [{ role: "user", content: "Hi" }],
    };

    await handleChat(request, "test-api-key");

    expect(createSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ system: SYSTEM_PROMPT }),
    );
  });

  it("prefers config.systemPrompt over the compiled-in prompt", async () => {
    const request: ChatRequest = {
      messages: [{ role: "user", content: "Hi" }],
    };

    await handleChat(request, "test-api-key", {
      systemPrompt: "You are a demo bot.",
    });

    expect(createSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ system: "You are a demo bot." }),
    );
  });

  it("rejects messages that are too long", async () => {
    const messages = Array.from({ length: 101 }, (_, i) => ({
      role: "user" as const,
      content: `message ${i}`,
    }));
    const request: ChatRequest = { messages };

    await expect(handleChat(request, "test-api-key")).rejects.toThrow(
      "Too many messages",
    );
  });
});
