import { describe, it, expect } from "vitest";
import { MockChatApiClient } from "../MockChatApiClient";
import { ChatApiError } from "../../api/errors";

describe("MockChatApiClient", () => {
  it("returns queued replies in FIFO order and records each call", async () => {
    const mock = new MockChatApiClient();
    mock.mockReply({ reply: "first" }).mockReply({ reply: "second" });

    const r1 = await mock.sendMessage([
      { id: "1", role: "user", content: "a" },
    ]);
    const r2 = await mock.sendMessage([
      { id: "2", role: "user", content: "b" },
    ]);

    expect(r1.reply).toBe("first");
    expect(r2.reply).toBe("second");
    expect(mock.calls).toHaveLength(2);
    expect(mock.lastCall![0].content).toBe("b");
  });

  it("throws queued ChatApiError instances", async () => {
    const mock = new MockChatApiClient();
    mock.mockError(new ChatApiError("Bad", 400, "VALIDATION_ERROR"));

    await expect(
      mock.sendMessage([{ id: "1", role: "user", content: "x" }]),
    ).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
  });

  it("mockTimeout / mockNetworkError throw the right ChatApiError shape", async () => {
    const a = new MockChatApiClient();
    a.mockTimeout();
    await expect(
      a.sendMessage([{ id: "1", role: "user", content: "x" }]),
    ).rejects.toMatchObject({ code: "TIMEOUT", status: 0 });

    const b = new MockChatApiClient();
    b.mockNetworkError();
    await expect(
      b.sendMessage([{ id: "1", role: "user", content: "x" }]),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR", status: 0 });
  });

  it("mockPending lets a test resolve the in-flight request later", async () => {
    const mock = new MockChatApiClient();
    const pending = mock.mockPending();

    const inflight = mock.sendMessage([
      { id: "1", role: "user", content: "wait" },
    ]);

    pending.resolve({ reply: "done" });
    await expect(inflight).resolves.toEqual({ reply: "done" });
  });

  it("throws a clear error when the queue is empty", async () => {
    const mock = new MockChatApiClient();
    await expect(
      mock.sendMessage([{ id: "1", role: "user", content: "x" }]),
    ).rejects.toThrow(/no response was queued/);
  });

  it("reset() clears queued responses and call history", async () => {
    const mock = new MockChatApiClient();
    mock.mockReply({ reply: "ignored" });
    await mock.sendMessage([{ id: "1", role: "user", content: "x" }]);
    expect(mock.calls).toHaveLength(1);

    mock.reset();
    expect(mock.calls).toHaveLength(0);
    await expect(
      mock.sendMessage([{ id: "2", role: "user", content: "y" }]),
    ).rejects.toThrow(/no response was queued/);
  });
});
