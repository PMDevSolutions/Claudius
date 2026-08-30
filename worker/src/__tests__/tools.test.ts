import { describe, it, expect, vi } from "vitest";
import {
  toAnthropicTools,
  executeTool,
  getCurrentTime,
  searchKnowledgeBase,
  submitLead,
  chatTools,
} from "../tools";
import type { ClaudiusTool } from "../tools";

function makeTool(overrides: Partial<ClaudiusTool> = {}): ClaudiusTool {
  return {
    name: "test_tool",
    description: "A test tool",
    inputSchema: { type: "object", properties: {} },
    handler: vi.fn().mockResolvedValue("done"),
    ...overrides,
  };
}

describe("toAnthropicTools", () => {
  it("maps tools to the Anthropic tools parameter", () => {
    const tools = toAnthropicTools([makeTool()]);
    expect(tools).toEqual([
      {
        name: "test_tool",
        description: "A test tool",
        input_schema: { type: "object", properties: {} },
      },
    ]);
  });

  it("rejects invalid tool names", () => {
    expect(() =>
      toAnthropicTools([makeTool({ name: "bad name!" })])
    ).toThrow(/Invalid tool name/);
    expect(() => toAnthropicTools([makeTool({ name: "" })])).toThrow(
      /Invalid tool name/
    );
    expect(() =>
      toAnthropicTools([makeTool({ name: "x".repeat(65) })])
    ).toThrow(/Invalid tool name/);
  });

  it("rejects duplicate tool names", () => {
    expect(() => toAnthropicTools([makeTool(), makeTool()])).toThrow(
      /Duplicate tool name/
    );
  });
});

describe("executeTool", () => {
  it("passes input and context to the handler and returns string results as-is", async () => {
    const handler = vi.fn().mockResolvedValue("plain result");
    const ctx = { conversationId: "c1" };

    const exec = await executeTool(
      [makeTool({ handler })],
      "test_tool",
      { a: 1 },
      ctx
    );

    expect(handler).toHaveBeenCalledWith({ a: 1 }, ctx);
    expect(exec).toEqual({ content: "plain result", isError: false });
  });

  it("JSON-stringifies object results and maps nullish to 'ok'", async () => {
    const objTool = makeTool({ handler: () => ({ time: "12:00" }) });
    expect(await executeTool([objTool], "test_tool", {}, {})).toEqual({
      content: '{"time":"12:00"}',
      isError: false,
    });

    const voidTool = makeTool({ handler: () => undefined });
    expect(await executeTool([voidTool], "test_tool", {}, {})).toEqual({
      content: "ok",
      isError: false,
    });
  });

  it("returns an error result for unknown tools", async () => {
    const exec = await executeTool([makeTool()], "nope", {}, {});
    expect(exec).toEqual({ content: "Unknown tool: nope", isError: true });
  });

  it("converts handler exceptions into error results without throwing", async () => {
    const tool = makeTool({
      handler: () => {
        throw new Error("backend unreachable");
      },
    });
    const exec = await executeTool([tool], "test_tool", {}, {});
    expect(exec.isError).toBe(true);
    expect(exec.content).toBe('Tool "test_tool" failed: backend unreachable');
  });

  it("truncates oversized results", async () => {
    const tool = makeTool({ handler: () => "x".repeat(10_000) });
    const exec = await executeTool([tool], "test_tool", {}, {});
    expect(exec.content.length).toBeLessThan(9_000);
    expect(exec.content).toContain("[truncated]");
  });
});

describe("reference tools", () => {
  it("getCurrentTime returns ISO time in the requested timezone", async () => {
    const result = (await getCurrentTime.handler(
      { timezone: "Europe/Berlin" },
      {}
    )) as { iso: string; timezone: string; formatted: string };

    expect(result.timezone).toBe("Europe/Berlin");
    expect(new Date(result.iso).getTime()).toBeCloseTo(Date.now(), -4);
    expect(result.formatted).toBeTruthy();
  });

  it("getCurrentTime falls back to UTC for unknown timezones", async () => {
    const result = (await getCurrentTime.handler(
      { timezone: "Not/AZone" },
      {}
    )) as { timezone: string; note?: string };

    expect(result.timezone).toBe("UTC");
    expect(result.note).toContain("Not/AZone");
  });

  it("searchKnowledgeBase stub is honest about having no backend", async () => {
    const result = (await searchKnowledgeBase.handler(
      { query: "pricing" },
      {}
    )) as { results: unknown[]; note: string };

    expect(result.results).toEqual([]);
    expect(result.note).toContain("No knowledge base is configured");
    expect(result.note).toContain("pricing");
  });

  it("submitLead validates name and email", async () => {
    await expect(async () =>
      submitLead.handler({ name: " ", email: "nope" }, {})
    ).rejects.toThrow(/name and a valid email/);

    const ok = (await submitLead.handler(
      { name: "Ada", email: "ada@example.com", message: "quote please" },
      {}
    )) as { status: string; note: string };
    expect(ok.status).toBe("received");
    expect(ok.note).toContain("logs only");
  });

  it("default registry is valid and ships getCurrentTime", () => {
    expect(() => toAnthropicTools(chatTools)).not.toThrow();
    expect(chatTools.map((t) => t.name)).toContain("get_current_time");
  });
});
