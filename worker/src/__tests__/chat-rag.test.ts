import { describe, it, expect, vi, beforeEach } from "vitest";

const createSpy = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: createSpy };
  },
}));

import { handleChat, streamChat, ChatRequest } from "../chat";
import { SYSTEM_PROMPT } from "../system-prompt";
import type { RagConfig, RagDocument } from "../rag";

const request: ChatRequest = {
  messages: [
    { role: "assistant", content: "Hi! How can I help?" },
    { role: "user", content: "What are your prices?" },
  ],
};

const pricingDoc: RagDocument = {
  id: "pricing.md#0",
  content: "Plans start at $1,000/month.",
  metadata: {
    url: "https://example.com/pricing",
    title: "Pricing",
    type: "page",
  },
  score: 0.9,
};

function ragWith(docs: RagDocument[]): RagConfig {
  return { retriever: { retrieve: vi.fn().mockResolvedValue(docs) } };
}

const textResponse = {
  stop_reason: "end_turn",
  content: [{ type: "text", text: "Plans start at $1,000/month." }],
  usage: { input_tokens: 10, output_tokens: 5 },
};

async function* textStream() {
  yield { type: "message_start", message: { usage: { input_tokens: 10 } } };
  yield {
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text: "Plans start at $1,000/month." },
  };
  yield {
    type: "message_delta",
    delta: { stop_reason: "end_turn" },
    usage: { output_tokens: 5 },
  };
  yield { type: "message_stop" };
}

describe("handleChat with RAG", () => {
  beforeEach(() => {
    createSpy.mockReset();
    createSpy.mockResolvedValue(textResponse);
  });

  it("retrieves with the latest user message and injects context into the system prompt", async () => {
    const rag = ragWith([pricingDoc]);

    await handleChat(request, "key", { rag });

    expect(rag.retriever.retrieve).toHaveBeenCalledWith(
      "What are your prices?",
      { topK: 4 }
    );
    const system = createSpy.mock.calls[0][0].system as string;
    expect(system.startsWith(SYSTEM_PROMPT)).toBe(true);
    expect(system).toContain("Retrieved context");
    expect(system).toContain("Plans start at $1,000/month.");
    expect(system).toContain("[Pricing](https://example.com/pricing)");
  });

  it("returns retrieved documents as widget sources", async () => {
    const result = await handleChat(request, "key", {
      rag: ragWith([pricingDoc]),
    });

    expect(result.response.sources).toEqual([
      {
        url: "https://example.com/pricing",
        title: "Pricing",
        type: "page",
        snippet: "Plans start at $1,000/month.",
      },
    ]);
  });

  it("omits sources and leaves the prompt untouched when retrieval finds nothing", async () => {
    const result = await handleChat(request, "key", { rag: ragWith([]) });

    expect(createSpy.mock.calls[0][0].system).toBe(SYSTEM_PROMPT);
    expect(result.response.sources).toBeUndefined();
  });

  it("proceeds ungrounded when the retriever throws", async () => {
    const rag: RagConfig = {
      retriever: { retrieve: vi.fn().mockRejectedValue(new Error("down")) },
    };

    const result = await handleChat(request, "key", { rag });

    expect(result.response.reply).toBe("Plans start at $1,000/month.");
    expect(result.response.sources).toBeUndefined();
    expect(createSpy.mock.calls[0][0].system).toBe(SYSTEM_PROMPT);
  });

  it("numbers the excerpts and asks for citations when the config opts in", async () => {
    // The route copies the body's `citations: true` into the config.
    await handleChat(request, "key", {
      rag: ragWith([pricingDoc]),
      citations: true,
    });
    const system = createSpy.mock.calls[0][0].system as string;
    expect(system).toContain("### [1] [Pricing](https://example.com/pricing)");
    expect(system).toContain("end it with the excerpt's number");
  });

  it("leaves the prompt unnumbered when the config does not opt in", async () => {
    await handleChat(request, "key", { rag: ragWith([pricingDoc]) });
    const system = createSpy.mock.calls[0][0].system as string;
    expect(system).toContain("### [Pricing](https://example.com/pricing)");
    expect(system).not.toContain("[1]");
    expect(system).not.toContain("end it with the excerpt's number");
  });

  it("returns sources only for the excerpts that fit the context budget", async () => {
    const faqDoc: RagDocument = {
      id: "faq.md#0",
      content: "We are open 9 to 5.",
      metadata: { url: "https://example.com/faq", title: "FAQ", type: "page" },
      score: 0.8,
    };
    const result = await handleChat(request, "key", {
      rag: { ...ragWith([pricingDoc, faqDoc]), maxContextChars: 60 },
    });
    expect(result.response.sources?.map((s) => s.url)).toEqual([
      "https://example.com/pricing",
    ]);
  });

  it("behaves exactly as before when RAG is not configured", async () => {
    const result = await handleChat(request, "key", {});
    expect(createSpy.mock.calls[0][0].system).toBe(SYSTEM_PROMPT);
    expect(result.response).toEqual({
      reply: "Plans start at $1,000/month.",
    });
  });
});

describe("streamChat with RAG", () => {
  beforeEach(() => {
    createSpy.mockReset();
    createSpy.mockImplementation(() => textStream());
  });

  it("injects context and carries sources on the done event", async () => {
    const events = [];
    for await (const event of streamChat(request, "key", {
      rag: ragWith([pricingDoc]),
    })) {
      events.push(event);
    }

    const system = createSpy.mock.calls[0][0].system as string;
    expect(system).toContain("Retrieved context");

    const done = events.at(-1) as { type: string; sources?: unknown };
    expect(done.type).toBe("done");
    expect(done.sources).toEqual([
      {
        url: "https://example.com/pricing",
        title: "Pricing",
        type: "page",
        snippet: "Plans start at $1,000/month.",
      },
    ]);
  });

  it("announces the sources once the model call is made, before the first text", async () => {
    const events: Array<{ type: string }> = [];
    let createCallsAtSources = -1;
    for await (const event of streamChat(request, "key", {
      rag: ragWith([pricingDoc]),
    })) {
      if (event.type === "sources") {
        createCallsAtSources = createSpy.mock.calls.length;
      }
      events.push(event);
    }
    expect(events.map((e) => e.type)).toEqual(["sources", "text", "done"]);
    // Yielded after the connection opened, so a bad key still fails as JSON.
    expect(createCallsAtSources).toBe(1);
    expect(events[0]).toEqual({
      type: "sources",
      sources: [
        {
          url: "https://example.com/pricing",
          title: "Pricing",
          type: "page",
          snippet: "Plans start at $1,000/month.",
        },
      ],
    });
  });

  it("announces nothing when retrieval found no sources", async () => {
    const events: Array<{ type: string }> = [];
    for await (const event of streamChat(request, "key", {
      rag: ragWith([]),
    })) {
      events.push(event);
    }
    expect(events.map((e) => e.type)).toEqual(["text", "done"]);
  });

  it("omits sources on the done event without RAG", async () => {
    const events = [];
    for await (const event of streamChat(request, "key", {})) {
      events.push(event);
    }
    expect(events.at(-1)).not.toHaveProperty("sources");
  });
});
