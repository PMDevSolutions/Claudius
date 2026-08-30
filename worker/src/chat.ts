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
  /** Overrides the compiled-in system prompt (e.g. via the SYSTEM_PROMPT var). */
  systemPrompt?: string;
}

/**
 * A single event produced while streaming a chat completion. `text` events
 * carry one incremental text delta; the final `done` event carries the full
 * assembled reply plus telemetry.
 */
export type ChatStreamEvent =
  | { type: "text"; text: string }
  | { type: "done"; reply: string; telemetry: ChatTelemetry };

const MAX_MESSAGES = 100;
const MAX_MESSAGE_LENGTH = 2000;
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_TOKENS = 1024;

/** Validates the request shape and returns role-checked, length-capped messages. */
function validateMessages(request: ChatRequest): ChatMessage[] {
  if (!request.messages || request.messages.length === 0) {
    throw new Error("Messages array is required");
  }

  if (request.messages.length > MAX_MESSAGES) {
    throw new Error("Too many messages");
  }

  const validRoles = new Set(["user", "assistant"]);
  return request.messages.map((msg) => {
    if (!validRoles.has(msg.role)) {
      throw new Error("Invalid message role");
    }
    return {
      role: msg.role,
      content: msg.content.slice(0, MAX_MESSAGE_LENGTH).trim(),
    };
  });
}

export async function handleChat(
  request: ChatRequest,
  apiKey: string,
  config: ChatConfig = {}
): Promise<ChatResult> {
  const sanitizedMessages = validateMessages(request);

  const client = new Anthropic({ apiKey });
  const model = config.model ?? DEFAULT_MODEL;

  const response = await client.messages.create({
    model,
    max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: config.systemPrompt ?? SYSTEM_PROMPT,
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

/**
 * Streaming variant of {@link handleChat}. Validates the request up front
 * (throwing the same errors, before any bytes are streamed), then yields one
 * `text` event per text delta from the model and a final `done` event with
 * the assembled reply and telemetry.
 */
export async function* streamChat(
  request: ChatRequest,
  apiKey: string,
  config: ChatConfig = {}
): AsyncGenerator<ChatStreamEvent> {
  const sanitizedMessages = validateMessages(request);

  const client = new Anthropic({ apiKey });
  const model = config.model ?? DEFAULT_MODEL;

  const stream = await client.messages.create({
    model,
    max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: config.systemPrompt ?? SYSTEM_PROMPT,
    messages: sanitizedMessages,
    stream: true,
  });

  let reply = "";
  let inputTokens = 0;
  let outputTokens = 0;

  for await (const event of stream) {
    switch (event.type) {
      case "message_start":
        inputTokens = event.message.usage?.input_tokens ?? 0;
        break;
      case "content_block_delta":
        if (event.delta.type === "text_delta" && event.delta.text) {
          reply += event.delta.text;
          yield { type: "text", text: event.delta.text };
        }
        break;
      case "message_delta":
        outputTokens = event.usage?.output_tokens ?? outputTokens;
        break;
    }
  }

  yield {
    type: "done",
    reply,
    telemetry: { model, inputTokens, outputTokens },
  };
}
