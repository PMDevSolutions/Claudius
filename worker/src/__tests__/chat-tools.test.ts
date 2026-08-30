import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Anthropic SDK with a shared spy; each test scripts its responses.
const createSpy = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: createSpy };
  },
}));

import { handleChat, streamChat, ChatRequest } from "../chat";
import type { ClaudiusTool } from "../tools";

const request: ChatRequest = {
  messages: [{ role: "user", content: "What time is it?" }],
};

function makeTool(overrides: Partial<ClaudiusTool> = {}): ClaudiusTool {
  return {
    name: "get_time",
    description: "Get the time",
    inputSchema: { type: "object", properties: {} },
    handler: vi.fn().mockResolvedValue({ time: "12:00" }),
    ...overrides,
  };
}

const toolUseResponse = {
  stop_reason: "tool_use",
  content: [
    { type: "text", text: "Let me check." },
    { type: "tool_use", id: "tu_1", name: "get_time", input: { tz: "UTC" } },
  ],
  usage: { input_tokens: 10, output_tokens: 5 },
};

const finalResponse = {
  stop_reason: "end_turn",
  content: [{ type: "text", text: "It is noon." }],
  usage: { input_tokens: 20, output_tokens: 7 },
};

describe("handleChat tool round trip", () => {
  beforeEach(() => createSpy.mockReset());

  it("advertises the registry as tools in the request", async () => {
    createSpy.mockResolvedValueOnce(finalResponse);

    await handleChat(request, "key", { tools: [makeTool()] });

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [
          {
            name: "get_time",
            description: "Get the time",
            input_schema: { type: "object", properties: {} },
          },
        ],
      })
    );
  });

  it("omits the tools parameter when the registry is empty", async () => {
    createSpy.mockResolvedValueOnce(finalResponse);

    await handleChat(request, "key", { tools: [] });

    expect(createSpy.mock.calls[0][0]).not.toHaveProperty("tools");
  });

  it("runs the tool round trip and returns reply plus tool summaries", async () => {
    createSpy
      .mockResolvedValueOnce(toolUseResponse)
      .mockResolvedValueOnce(finalResponse);
    const tool = makeTool();

    const result = await handleChat(request, "key", {
      tools: [tool],
      toolContext: { conversationId: "c1" },
    });

    // Handler received the model's input and the configured context.
    expect(tool.handler).toHaveBeenCalledWith(
      { tz: "UTC" },
      { conversationId: "c1" }
    );

    // Narration text and the final answer are both kept.
    expect(result.response.reply).toBe("Let me check.\n\nIt is noon.");
    expect(result.response.toolUses).toEqual([
      { name: "get_time", input: { tz: "UTC" }, result: '{"time":"12:00"}' },
    ]);
    // Token usage accumulates across rounds.
    expect(result.telemetry).toMatchObject({
      inputTokens: 30,
      outputTokens: 12,
    });

    // The second request carries the assistant turn and the tool result.
    const secondCall = createSpy.mock.calls[1][0];
    expect(secondCall.messages).toHaveLength(3);
    expect(secondCall.messages[1]).toEqual({
      role: "assistant",
      content: toolUseResponse.content,
    });
    expect(secondCall.messages[2]).toEqual({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tu_1",
          content: '{"time":"12:00"}',
        },
      ],
    });
  });

  it("feeds handler failures back as is_error tool results", async () => {
    createSpy
      .mockResolvedValueOnce(toolUseResponse)
      .mockResolvedValueOnce(finalResponse);
    const tool = makeTool({
      handler: () => {
        throw new Error("backend down");
      },
    });

    const result = await handleChat(request, "key", { tools: [tool] });

    const toolResult = createSpy.mock.calls[1][0].messages[2].content[0];
    expect(toolResult.is_error).toBe(true);
    expect(toolResult.content).toContain("backend down");
    expect(result.response.toolUses?.[0].isError).toBe(true);
  });

  it("caps runaway loops by forcing a text answer on the final round", async () => {
    createSpy.mockImplementation(
      (params?: { tool_choice?: { type: string } }) =>
        params?.tool_choice?.type === "none"
          ? Promise.resolve(finalResponse)
          : Promise.resolve(toolUseResponse)
    );

    const result = await handleChat(request, "key", { tools: [makeTool()] });

    // 5 tool rounds + 1 forced-text round.
    expect(createSpy).toHaveBeenCalledTimes(6);
    expect(
      createSpy.mock.calls[5][0].tool_choice
    ).toEqual({ type: "none" });
    expect(result.response.reply).toContain("It is noon.");
    expect(result.response.toolUses).toHaveLength(5);
  });
});

// Raw streaming events for a round that calls a tool (input JSON split
// across two deltas), then a round that answers in text.
async function* toolUseStream() {
  yield { type: "message_start", message: { usage: { input_tokens: 10 } } };
  yield {
    type: "content_block_start",
    index: 0,
    content_block: { type: "text", text: "" },
  };
  yield {
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text: "Checking." },
  };
  yield { type: "content_block_stop", index: 0 };
  yield {
    type: "content_block_start",
    index: 1,
    content_block: { type: "tool_use", id: "tu_1", name: "get_time" },
  };
  yield {
    type: "content_block_delta",
    index: 1,
    delta: { type: "input_json_delta", partial_json: '{"tz":' },
  };
  yield {
    type: "content_block_delta",
    index: 1,
    delta: { type: "input_json_delta", partial_json: '"UTC"}' },
  };
  yield { type: "content_block_stop", index: 1 };
  yield {
    type: "message_delta",
    delta: { stop_reason: "tool_use" },
    usage: { output_tokens: 5 },
  };
  yield { type: "message_stop" };
}

async function* finalStream() {
  yield { type: "message_start", message: { usage: { input_tokens: 20 } } };
  yield {
    type: "content_block_start",
    index: 0,
    content_block: { type: "text", text: "" },
  };
  yield {
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text: "It is " },
  };
  yield {
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text: "noon." },
  };
  yield { type: "content_block_stop", index: 0 };
  yield {
    type: "message_delta",
    delta: { stop_reason: "end_turn" },
    usage: { output_tokens: 7 },
  };
  yield { type: "message_stop" };
}

describe("streamChat tool round trip", () => {
  beforeEach(() => createSpy.mockReset());

  it("streams text, emits a tool event, and continues into the next round", async () => {
    createSpy
      .mockImplementationOnce(() => toolUseStream())
      .mockImplementationOnce(() => finalStream());
    const tool = makeTool();

    const events = [];
    for await (const event of streamChat(request, "key", { tools: [tool] })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "text", text: "Checking." },
      {
        type: "tool",
        toolUse: {
          name: "get_time",
          input: { tz: "UTC" },
          result: '{"time":"12:00"}',
        },
      },
      { type: "text", text: "\n\n" },
      { type: "text", text: "It is " },
      { type: "text", text: "noon." },
      {
        type: "done",
        reply: "Checking.\n\nIt is noon.",
        toolUses: [
          {
            name: "get_time",
            input: { tz: "UTC" },
            result: '{"time":"12:00"}',
          },
        ],
        telemetry: {
          model: expect.stringMatching(/^claude-/),
          inputTokens: 30,
          outputTokens: 12,
        },
      },
    ]);

    // Round 2 request continues the conversation with the tool result.
    const secondCall = createSpy.mock.calls[1][0];
    expect(secondCall.messages[1]).toEqual({
      role: "assistant",
      content: [
        { type: "text", text: "Checking." },
        { type: "tool_use", id: "tu_1", name: "get_time", input: { tz: "UTC" } },
      ],
    });
    expect(secondCall.messages[2].content[0]).toMatchObject({
      type: "tool_result",
      tool_use_id: "tu_1",
    });
  });

  it("streams without tool events when the model answers directly", async () => {
    createSpy.mockImplementationOnce(() => finalStream());

    const events = [];
    for await (const event of streamChat(request, "key", {
      tools: [makeTool()],
    })) {
      events.push(event);
    }

    expect(events.map((e) => e.type)).toEqual(["text", "text", "done"]);
    const done = events.at(-1) as { reply: string; toolUses?: unknown };
    expect(done.reply).toBe("It is noon.");
    expect(done.toolUses).toBeUndefined();
  });
});
