import { describe, it, expect, vi } from "vitest";

// Mock the Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "Hello! How can I help?" }],
          usage: { input_tokens: 12, output_tokens: 7 },
        }),
      };
    },
  };
});

import { handleChat, ChatRequest } from "../chat";

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
