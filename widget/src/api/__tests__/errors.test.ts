import { describe, it, expect } from "vitest";
import { ChatApiError, DebounceError } from "../errors";

describe("ChatApiError", () => {
  it("stores status, code, and retryAfter", () => {
    const err = new ChatApiError("Rate limited", 429, "RATE_LIMITED", 30);
    expect(err.message).toBe("Rate limited");
    expect(err.status).toBe(429);
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.retryAfter).toBe(30);
    expect(err).toBeInstanceOf(Error);
  });

  it("works without optional fields", () => {
    const err = new ChatApiError("Server error", 500);
    expect(err.code).toBeUndefined();
    expect(err.retryAfter).toBeUndefined();
  });

  it("has name set to ChatApiError", () => {
    const err = new ChatApiError("test", 500);
    expect(err.name).toBe("ChatApiError");
  });
});

describe("DebounceError", () => {
  it("is an instance of Error", () => {
    const err = new DebounceError();
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("Request debounced");
  });

  it("has name set to DebounceError", () => {
    const err = new DebounceError();
    expect(err.name).toBe("DebounceError");
  });
});
