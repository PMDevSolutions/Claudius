import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./system-prompt";
import { attachmentToBlock, type AttachmentRef } from "./attachments";
import type { StoredAttachment } from "./attachment-storage";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Files attached to a user message. See `attachments.ts`. */
  attachments?: AttachmentRef[];
}

export interface ChatRequest {
  messages: ChatMessage[];
  conversationId?: string;
}

export interface ChatResponse {
  reply: string;
  /** Storage metadata for attachments persisted by this request (R2 mode). */
  attachments?: StoredAttachment[];
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

/**
 * Convert a sanitized message into the SDK's `content` shape. Plain-text
 * messages stay strings (unchanged wire format); messages with attachments
 * become a block array with the files first and the text last, which is the
 * ordering Anthropic recommends for vision and document prompts.
 */
function toContent(
  message: ChatMessage
): string | Anthropic.Messages.ContentBlockParam[] {
  const attachments = message.attachments ?? [];
  if (message.role !== "user" || attachments.length === 0) {
    return message.content;
  }
  const blocks: Anthropic.Messages.ContentBlockParam[] = attachments.map(
    (att) => attachmentToBlock(att) as Anthropic.Messages.ContentBlockParam
  );
  if (message.content) {
    blocks.push({ type: "text", text: message.content });
  }
  return blocks;
}

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
  const sanitizedMessages: ChatMessage[] = request.messages.map((msg) => {
    if (!validRoles.has(msg.role)) {
      throw new Error("Invalid message role");
    }
    const content =
      typeof msg.content === "string"
        ? msg.content.slice(0, MAX_MESSAGE_LENGTH).trim()
        : "";
    const attachments =
      msg.role === "user" && msg.attachments && msg.attachments.length > 0
        ? msg.attachments
        : undefined;
    if (!content && !attachments) {
      throw new Error("Message content is required");
    }
    return attachments
      ? { role: msg.role, content, attachments }
      : { role: msg.role, content };
  });

  const client = new Anthropic({ apiKey });
  const model = config.model ?? DEFAULT_MODEL;

  const response = await client.messages.create({
    model,
    max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: sanitizedMessages.map((msg) => ({
      role: msg.role,
      content: toContent(msg),
    })),
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
