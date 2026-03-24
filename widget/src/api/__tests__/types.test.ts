import { describe, it, expect } from "vitest";
import type { Source, ChatMessage, ChatResponse } from "../types";

describe("Source type", () => {
  it("accepts valid source objects", () => {
    const source: Source = {
      url: "https://pmds.info/blog/seo-tips",
      title: "SEO Tips for Small Businesses",
      type: "blog",
    };
    expect(source.type).toBe("blog");
  });

  it("accepts all source types", () => {
    const types: Source["type"][] = ["blog", "page", "external"];
    expect(types).toHaveLength(3);
  });
});

describe("ChatMessage with sources", () => {
  it("supports optional sources field", () => {
    const msg: ChatMessage = {
      id: "msg-1",
      role: "assistant",
      content: "Here are some resources.",
      sources: [
        { url: "https://pmds.info/blog/test", title: "Test", type: "blog" },
      ],
    };
    expect(msg.sources).toHaveLength(1);
  });

  it("works without sources", () => {
    const msg: ChatMessage = {
      id: "msg-2",
      role: "user",
      content: "Hello",
    };
    expect(msg.sources).toBeUndefined();
  });
});

describe("ChatResponse with sources", () => {
  it("supports optional sources field", () => {
    const res: ChatResponse = {
      reply: "Here you go.",
      sources: [
        { url: "https://pmds.info/services", title: "Services", type: "page" },
      ],
    };
    expect(res.sources).toHaveLength(1);
  });

  it("works without sources", () => {
    const res: ChatResponse = { reply: "Hello!" };
    expect(res.sources).toBeUndefined();
  });
});
