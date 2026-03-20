import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./system-prompt";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
}

export interface ChatResponse {
  reply: string;
}

const MAX_MESSAGES = 100;
const MAX_MESSAGE_LENGTH = 2000;

export async function handleChat(
  request: ChatRequest,
  apiKey: string
): Promise<ChatResponse> {
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

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: sanitizedMessages,
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from model");
  }

  return { reply: textBlock.text };
}
