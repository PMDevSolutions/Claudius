import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./system-prompt";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  conversationId?: string;
}

export interface ChatResponse {
  reply: string;
}

export interface ChatTelemetry {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ChatResult {
  response: ChatResponse;
  telemetry: ChatTelemetry;
}

export interface ChatConfig {
  model?: string;
  maxTokens?: number;
}

const MAX_MESSAGES = 100;
const MAX_MESSAGE_LENGTH = 2000;
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_TOKENS = 1024;

export async function handleChat(
  request: ChatRequest,
  apiKey: string,
  config: ChatConfig = {}
): Promise<ChatResult> {
  if (!request.messages || request.messages.length === 0) {
    throw new Error("Messages array is required");
  }

  if (request.messages.length > MAX_MESSAGES) {
    throw new Error("Too many messages");
  }

  // Validate roles and sanitize content
  const validRoles = new Set(["user", "assistant"]);
  const sanitizedMessages = request.messages.map((msg) => {
    if (!validRoles.has(msg.role)) {
      throw new Error("Invalid message role");
    }
    return {
      role: msg.role,
      content: msg.content.slice(0, MAX_MESSAGE_LENGTH).trim(),
    };
  });

  const client = new Anthropic({ apiKey });
  const model = config.model ?? DEFAULT_MODEL;

  const response = await client.messages.create({
    model,
    max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: sanitizedMessages,
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from model");
  }

  return {
    response: { reply: textBlock.text },
    telemetry: {
      model,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    },
  };
}
