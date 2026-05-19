import { describe, it, expect, vi } from "vitest";
import { recordEvent } from "../analytics";

function mockDb() {
  const run = vi.fn().mockResolvedValue({ success: true });
  const bind = vi.fn((..._args: unknown[]) => ({ run }));
  const prepare = vi.fn((_sql: string) => ({ bind }));
  return {
    db: { prepare } as unknown as D1Database,
    prepare,
    bind,
    run,
  };
}

describe("recordEvent", () => {
  it("no-ops when no database is provided", async () => {
    await expect(
      recordEvent(undefined, {
        messageCount: 1,
        lastUserMsgLength: 10,
        latencyMs: 100,
        statusCode: 200,
      }),
    ).resolves.toBeUndefined();
  });

  it("inserts an event row with all fields bound in order", async () => {
    const { db, prepare, bind, run } = mockDb();

    await recordEvent(db, {
      conversationId: "conv-1",
      messageCount: 3,
      lastUserMsgLength: 42,
      model: "claude-haiku-4-5",
      inputTokens: 100,
      outputTokens: 50,
      latencyMs: 750,
      statusCode: 200,
    });

    expect(prepare).toHaveBeenCalledOnce();
    const args = bind.mock.calls[0];
    expect(args[1]).toBe("conv-1");
    expect(args[2]).toBe(3);
    expect(args[3]).toBe(42);
    expect(args[4]).toBe("claude-haiku-4-5");
    expect(args[5]).toBe(100);
    expect(args[6]).toBe(50);
    expect(args[7]).toBe(750);
    expect(args[8]).toBe(200);
    expect(args[9]).toBeNull();
    expect(run).toHaveBeenCalledOnce();
  });

  it("binds null for optional fields that are omitted", async () => {
    const { db, bind } = mockDb();

    await recordEvent(db, {
      messageCount: 1,
      lastUserMsgLength: 0,
      latencyMs: 500,
      statusCode: 429,
      errorCode: "RATE_LIMITED",
    });

    const args = bind.mock.calls[0];
    expect(args[1]).toBeNull(); // conversation_id
    expect(args[4]).toBeNull(); // model
    expect(args[5]).toBeNull(); // input_tokens
    expect(args[6]).toBeNull(); // output_tokens
    expect(args[9]).toBe("RATE_LIMITED");
  });

  it("swallows database errors so the request still succeeds", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failingDb = {
      prepare: () => ({
        bind: () => ({
          run: vi.fn().mockRejectedValue(new Error("D1 unavailable")),
        }),
      }),
    } as unknown as D1Database;

    await expect(
      recordEvent(failingDb, {
        messageCount: 1,
        lastUserMsgLength: 5,
        latencyMs: 200,
        statusCode: 200,
      }),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });
});
