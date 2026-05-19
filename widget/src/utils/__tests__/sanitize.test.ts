import { describe, it, expect } from "vitest";
import {
  sanitizeUrl,
  isUrlSafe,
  isValidMessageLength,
  sanitizeMessageContent,
  MAX_MESSAGE_LENGTH,
} from "../sanitize";

describe("sanitizeUrl", () => {
  describe("valid URLs", () => {
    it("allows https URLs", () => {
      expect(sanitizeUrl("https://example.com")).toBe("https://example.com");
    });

    it("allows http URLs", () => {
      expect(sanitizeUrl("http://example.com")).toBe("http://example.com");
    });

    it("allows URLs with paths", () => {
      expect(sanitizeUrl("https://example.com/path/to/page")).toBe(
        "https://example.com/path/to/page",
      );
    });

    it("allows URLs with query strings", () => {
      expect(sanitizeUrl("https://example.com?foo=bar&baz=qux")).toBe(
        "https://example.com?foo=bar&baz=qux",
      );
    });

    it("allows URLs with fragments", () => {
      expect(sanitizeUrl("https://example.com#section")).toBe(
        "https://example.com#section",
      );
    });

    it("trims whitespace", () => {
      expect(sanitizeUrl("  https://example.com  ")).toBe(
        "https://example.com",
      );
    });
  });

  describe("XSS attack vectors", () => {
    it("blocks javascript: URLs", () => {
      expect(sanitizeUrl("javascript:alert('xss')")).toBeNull();
    });

    it("blocks javascript: URLs with encoding", () => {
      expect(sanitizeUrl("javascript:alert(1)")).toBeNull();
    });

    it("blocks data: URLs", () => {
      expect(
        sanitizeUrl("data:text/html,<script>alert(1)</script>"),
      ).toBeNull();
    });

    it("blocks data: URLs with base64", () => {
      expect(
        sanitizeUrl(
          "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
        ),
      ).toBeNull();
    });

    it("blocks vbscript: URLs", () => {
      expect(sanitizeUrl("vbscript:msgbox('xss')")).toBeNull();
    });

    it("blocks file: URLs", () => {
      expect(sanitizeUrl("file:///etc/passwd")).toBeNull();
    });

    it("blocks ftp: URLs", () => {
      expect(sanitizeUrl("ftp://ftp.example.com")).toBeNull();
    });

    it("blocks javascript: URLs with mixed case", () => {
      expect(sanitizeUrl("JaVaScRiPt:alert(1)")).toBeNull();
    });

    it("blocks javascript: URLs with whitespace", () => {
      expect(sanitizeUrl("  javascript:alert(1)  ")).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("returns null for empty string", () => {
      expect(sanitizeUrl("")).toBeNull();
    });

    it("returns null for whitespace only", () => {
      expect(sanitizeUrl("   ")).toBeNull();
    });

    it("returns null for null input", () => {
      expect(sanitizeUrl(null as unknown as string)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(sanitizeUrl(undefined as unknown as string)).toBeNull();
    });

    it("returns null for non-string input", () => {
      expect(sanitizeUrl(123 as unknown as string)).toBeNull();
    });

    it("returns null for relative URLs", () => {
      expect(sanitizeUrl("/path/to/page")).toBeNull();
    });

    it("returns null for invalid URLs", () => {
      expect(sanitizeUrl("not a url")).toBeNull();
    });
  });
});

describe("isUrlSafe", () => {
  it("returns true for https URLs", () => {
    expect(isUrlSafe("https://example.com")).toBe(true);
  });

  it("returns true for http URLs", () => {
    expect(isUrlSafe("http://example.com")).toBe(true);
  });

  it("returns false for javascript: URLs", () => {
    expect(isUrlSafe("javascript:alert(1)")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isUrlSafe("")).toBe(false);
  });
});

describe("isValidMessageLength", () => {
  it("returns true for messages under limit", () => {
    expect(isValidMessageLength("Hello")).toBe(true);
  });

  it("returns true for messages at limit", () => {
    const message = "a".repeat(MAX_MESSAGE_LENGTH);
    expect(isValidMessageLength(message)).toBe(true);
  });

  it("returns false for messages over limit", () => {
    const message = "a".repeat(MAX_MESSAGE_LENGTH + 1);
    expect(isValidMessageLength(message)).toBe(false);
  });

  it("returns true for empty string", () => {
    expect(isValidMessageLength("")).toBe(true);
  });

  it("returns false for non-string input", () => {
    expect(isValidMessageLength(123 as unknown as string)).toBe(false);
  });
});

describe("sanitizeMessageContent", () => {
  it("trims whitespace", () => {
    expect(sanitizeMessageContent("  hello  ")).toBe("hello");
  });

  it("truncates messages over limit", () => {
    const message = "a".repeat(MAX_MESSAGE_LENGTH + 100);
    const result = sanitizeMessageContent(message);
    expect(result.length).toBe(MAX_MESSAGE_LENGTH);
  });

  it("returns empty string for null input", () => {
    expect(sanitizeMessageContent(null as unknown as string)).toBe("");
  });

  it("returns empty string for undefined input", () => {
    expect(sanitizeMessageContent(undefined as unknown as string)).toBe("");
  });

  it("returns empty string for non-string input", () => {
    expect(sanitizeMessageContent(123 as unknown as string)).toBe("");
  });

  it("preserves valid message content", () => {
    expect(sanitizeMessageContent("Hello, world!")).toBe("Hello, world!");
  });
});
