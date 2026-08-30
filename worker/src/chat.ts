import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./system-prompt";
import { toAnthropicTools, executeTool } from "./tools";
import type { ClaudiusTool, ToolContext, ToolUseSummary } from "./tools";

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
  /** Tools the model called while producing this reply, in call order. */
  toolUses?: ToolUseSummary[];
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
  /** Tools the model may call; the tool round trip runs transparently. */
  tools?: readonly ClaudiusTool[];
  /** Context passed to every tool handler. */
  toolContext?: ToolContext;
}

/**
 * A single event produced while streaming a chat completion. `text` events
 * carry one incremental text delta; `tool` events announce each executed
 * tool call; the final `done` event carries the full assembled reply,
 * accumulated tool-use summaries, and telemetry.
 */
export type ChatStreamEvent =
  | { type: "text"; text: string }
  | { type: "tool"; toolUse: ToolUseSummary }
  | {
      type: "done";
      reply: string;
      toolUses?: ToolUseSummary[];
      telemetry: ChatTelemetry;
    };

const MAX_MESSAGES = 100;
const MAX_MESSAGE_LENGTH = 2000;
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_TOKENS = 1024;

// Hard cap on model→tool→model iterations per chat turn. On the last
// allowed round the request is sent with tool_choice "none", forcing a
// text answer instead of an unbounded tool loop.
const MAX_TOOL_ROUNDS = 5;

/** Runs each requested tool call, returning result blocks and summaries. */
async function executeToolBlocks(
  tools: readonly ClaudiusTool[],
  blocks: readonly Anthropic.Messages.ToolUseBlockParam[],
  ctx: ToolContext
): Promise<{
  results: Anthropic.Messages.ToolResultBlockParam[];
  summaries: ToolUseSummary[];
}> {
  const results: Anthropic.Messages.ToolResultBlockParam[] = [];
  const summaries: ToolUseSummary[] = [];

  for (const block of blocks) {
    const input = (block.input ?? {}) as Record<string, unknown>;
    const exec = await executeTool(tools, block.name, input, ctx);
    summaries.push({
      name: block.name,
      input,
      result: exec.content,
      ...(exec.isError ? { isError: true } : {}),
    });
    results.push({
      type: "tool_result",
      tool_use_id: block.id,
      content: exec.content,
      ...(exec.isError ? { is_error: true } : {}),
    });
  }

  return { results, summaries };
}

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
  const tools = config.tools ?? [];
  const anthropicTools = tools.length > 0 ? toAnthropicTools(tools) : undefined;
  const toolCtx = config.toolContext ?? {};

  const conversation: Anthropic.Messages.MessageParam[] = [
    ...sanitizedMessages,
  ];
  const toolUses: ToolUseSummary[] = [];
  const replyParts: string[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  for (let round = 0; ; round++) {
    const finalRound = round >= MAX_TOOL_ROUNDS;

    const response = await client.messages.create({
      model,
      max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: config.systemPrompt ?? SYSTEM_PROMPT,
      messages: conversation,
      ...(anthropicTools
        ? {
            tools: anthropicTools,
            ...(finalRound ? { tool_choice: { type: "none" as const } } : {}),
          }
        : {}),
    });

    inputTokens += response.usage?.input_tokens ?? 0;
    outputTokens += response.usage?.output_tokens ?? 0;

    // Keep any text the model produced this round (it may narrate before
    // calling a tool, e.g. "Let me check that for you").
    for (const block of response.content) {
      if (block.type === "text" && block.text) {
        replyParts.push(block.text);
      }
    }

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.Messages.ToolUseBlock =>
        block.type === "tool_use"
    );

    if (
      response.stop_reason === "tool_use" &&
      toolUseBlocks.length > 0 &&
      !finalRound
    ) {
      const { results, summaries } = await executeToolBlocks(
        tools,
        toolUseBlocks,
        toolCtx
      );
      toolUses.push(...summaries);
      conversation.push({ role: "assistant", content: response.content });
      conversation.push({ role: "user", content: results });
      continue;
    }

    const reply = replyParts.join("\n\n");
    if (!reply) {
      throw new Error("No text response from model");
    }

    return {
      response: {
        reply,
        ...(toolUses.length > 0 ? { toolUses } : {}),
      },
      telemetry: { model, inputTokens, outputTokens },
    };
  }
}

/**
 * Streaming variant of {@link handleChat}. Validates the request up front
 * (throwing the same errors, before any bytes are streamed), then yields one
 * `text` event per text delta from the model, a `tool` event per executed
 * tool call (the tool round trip streams transparently across rounds), and
 * a final `done` event with the assembled reply, tool-use summaries, and
 * telemetry.
 */
export async function* streamChat(
  request: ChatRequest,
  apiKey: string,
  config: ChatConfig = {}
): AsyncGenerator<ChatStreamEvent> {
  const sanitizedMessages = validateMessages(request);

  const client = new Anthropic({ apiKey });
  const model = config.model ?? DEFAULT_MODEL;
  const tools = config.tools ?? [];
  const anthropicTools = tools.length > 0 ? toAnthropicTools(tools) : undefined;
  const toolCtx = config.toolContext ?? {};

  const conversation: Anthropic.Messages.MessageParam[] = [
    ...sanitizedMessages,
  ];
  const toolUses: ToolUseSummary[] = [];
  let reply = "";
  let inputTokens = 0;
  let outputTokens = 0;

  for (let round = 0; ; round++) {
    const finalRound = round >= MAX_TOOL_ROUNDS;

    const stream = await client.messages.create({
      model,
      max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: config.systemPrompt ?? SYSTEM_PROMPT,
      messages: conversation,
      stream: true,
      ...(anthropicTools
        ? {
            tools: anthropicTools,
            ...(finalRound ? { tool_choice: { type: "none" as const } } : {}),
          }
        : {}),
    });

    // Reconstructed content blocks for this round, in order — needed to
    // append the assistant turn verbatim when continuing after tool calls.
    const contentBlocks: Array<
      Anthropic.Messages.TextBlockParam | Anthropic.Messages.ToolUseBlockParam
    > = [];
    // Tool inputs stream as partial JSON per block index.
    const pendingToolJson = new Map<number, string>();
    let stopReason: string | null = null;
    let roundOutputTokens = 0;
    // Separate this round's text from the previous round's with a blank
    // line, mirroring the non-streaming reply assembly.
    let firstTextOfRound = true;

    for await (const event of stream) {
      switch (event.type) {
        case "message_start":
          inputTokens += event.message.usage?.input_tokens ?? 0;
          break;
        case "content_block_start": {
          const block = event.content_block;
          if (block.type === "text") {
            contentBlocks[event.index] = { type: "text", text: "" };
          } else if (block.type === "tool_use") {
            contentBlocks[event.index] = {
              type: "tool_use",
              id: block.id,
              name: block.name,
              input: {},
            };
            pendingToolJson.set(event.index, "");
          }
          break;
        }
        case "content_block_delta":
          if (event.delta.type === "text_delta" && event.delta.text) {
            if (firstTextOfRound && reply.length > 0) {
              reply += "\n\n";
              yield { type: "text", text: "\n\n" };
            }
            firstTextOfRound = false;
            reply += event.delta.text;
            const blk = contentBlocks[event.index];
            if (blk?.type === "text") {
              blk.text += event.delta.text;
            }
            yield { type: "text", text: event.delta.text };
          } else if (event.delta.type === "input_json_delta") {
            pendingToolJson.set(
              event.index,
              (pendingToolJson.get(event.index) ?? "") +
                event.delta.partial_json
            );
          }
          break;
        case "content_block_stop": {
          const json = pendingToolJson.get(event.index);
          if (json !== undefined) {
            pendingToolJson.delete(event.index);
            const blk = contentBlocks[event.index];
            if (blk?.type === "tool_use") {
              try {
                blk.input = json.trim() ? JSON.parse(json) : {};
              } catch {
                blk.input = {};
              }
            }
          }
          break;
        }
        case "message_delta":
          roundOutputTokens = event.usage?.output_tokens ?? roundOutputTokens;
          stopReason = event.delta?.stop_reason ?? stopReason;
          break;
      }
    }

    outputTokens += roundOutputTokens;

    const toolUseBlocks = contentBlocks.filter(
      (block): block is Anthropic.Messages.ToolUseBlockParam =>
        block?.type === "tool_use"
    );

    if (stopReason === "tool_use" && toolUseBlocks.length > 0 && !finalRound) {
      const { results, summaries } = await executeToolBlocks(
        tools,
        toolUseBlocks,
        toolCtx
      );
      for (const summary of summaries) {
        toolUses.push(summary);
        yield { type: "tool", toolUse: summary };
      }
      conversation.push({
        role: "assistant",
        content: contentBlocks.filter(Boolean),
      });
      conversation.push({ role: "user", content: results });
      continue;
    }

    yield {
      type: "done",
      reply,
      ...(toolUses.length > 0 ? { toolUses } : {}),
      telemetry: { model, inputTokens, outputTokens },
    };
    return;
  }
}
