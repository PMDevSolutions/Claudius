---
title: Tool Use
description: Let the chatbot call developer-defined functions — look up data, capture leads, check availability — via Anthropic tool use and a declarative tool registry.
---

Tool use lets the model **do things** instead of only answering: look up an
order, check availability, capture a lead. You declare a tool once — a name, a
JSON Schema for its input, and an async handler — and the Worker takes care of
the entire Anthropic tool-use round trip:

1. The Worker advertises your registry as `tools` on every chat request.
2. When the model decides to call one, the Worker runs your handler.
3. The result is fed back to the model, which continues its answer.
4. The widget shows a compact **"Used tool: X"** chip under the reply, with a
   details disclosure revealing the input and result.

This works identically on the blocking endpoint (`POST /api/chat`) and the
streaming endpoint (`POST /api/chat/stream`) — mid-stream, the widget shows
each tool chip the moment the call finishes, while the model keeps streaming.

## The `ClaudiusTool` type

```ts
// worker/src/tools/types.ts
interface ClaudiusTool<TInput = Record<string, unknown>> {
  /** Unique name: letters, digits, _ or -, max 64 chars. */
  name: string;
  /** What the tool does and when to use it — the model reads this. */
  description: string;
  /** JSON Schema for the input (Anthropic `input_schema`). */
  inputSchema: ToolInputSchema;
  /** Runs the tool. Return value becomes the tool result. */
  handler: (input: TInput, ctx: ToolContext) => Promise<unknown> | unknown;
}
```

Handler return values are serialized for the model: strings pass through,
anything else is `JSON.stringify`-ed, and results are capped at 8 KB. A thrown
error becomes an `is_error` tool result — the model sees the message and can
recover gracefully, so **only throw messages you'd be comfortable showing**.

The `ctx` argument carries the Worker environment (bindings, secrets) and the
`conversationId` when the widget sent one:

```ts
handler: async (input, ctx) => {
  const db = ctx.env?.ANALYTICS_DB as D1Database | undefined;
  // ...
};
```

## Registering tools

Tools are registered at startup in `worker/src/tools/index.ts`:

```ts
import { getCurrentTime, searchKnowledgeBase, submitLead } from "./reference";

export const chatTools: ClaudiusTool[] = [
  getCurrentTime,
  // searchKnowledgeBase,  // wire to a real retriever first
  // submitLead,           // wire to real storage first
];
```

The registry is validated when it is first used — duplicate or malformed
names throw immediately, so a bad registry fails your tests and deploy rather
than a customer chat. An empty registry omits the `tools` parameter entirely
and the Worker behaves exactly as before.

## Reference tools

| Tool | Status | Purpose |
|------|--------|---------|
| `get_current_time` | **Enabled by default** | Current date/time, optional IANA timezone |
| `search_knowledge_base` | Stub — wire before registering | Retrieval hook for docs/policies (Vectorize, KV, external search) |
| `submit_lead` | Stub — wire before registering | Lead capture (name, email, message) |

The stubs are *honest*: `search_knowledge_base` tells the model no knowledge
base is configured, and `submit_lead` says the lead reached the logs only, so
the model never promises users something the backend didn't do. Replace their
handlers before registering them.

## Tutorial: adding a custom tool

Say your site should answer "where's my order?". Create the tool:

```ts
// worker/src/tools/order-status.ts
import type { ClaudiusTool } from "./types";

export const getOrderStatus: ClaudiusTool<{ orderNumber: string }> = {
  name: "get_order_status",
  description:
    "Look up the shipping status of an order by its order number " +
    "(format: ORD-12345). Use when the user asks where their order is.",
  inputSchema: {
    type: "object",
    properties: {
      orderNumber: {
        type: "string",
        description: "The order number, e.g. ORD-12345.",
      },
    },
    required: ["orderNumber"],
    additionalProperties: false,
  },
  handler: async ({ orderNumber }, ctx) => {
    const db = ctx.env?.ORDERS_DB as D1Database | undefined;
    if (!db) throw new Error("Order lookup is not configured.");

    const row = await db
      .prepare("SELECT status, eta FROM orders WHERE number = ?")
      .bind(orderNumber)
      .first();

    if (!row) {
      return `No order found with number ${orderNumber}. Ask the user to double-check it.`;
    }
    return { status: row.status, eta: row.eta };
  },
};
```

Register it:

```ts
// worker/src/tools/index.ts
import { getOrderStatus } from "./order-status";

export const chatTools: ClaudiusTool[] = [getCurrentTime, getOrderStatus];
```

That's it. Deploy the Worker and the model can now resolve "where is
ORD-12345?" by calling your handler. Nothing changes in the widget — the tool
chip renders automatically.

### Testing your tool

Handlers are plain functions, so unit-test them directly; the round trip
itself is covered by mocking the Anthropic SDK (see
`worker/src/__tests__/chat-tools.test.ts` for the pattern):

```ts
import { executeTool } from "../tools";

it("reports unknown orders helpfully", async () => {
  const exec = await executeTool([getOrderStatus], "get_order_status",
    { orderNumber: "ORD-404" }, { env: mockEnv });
  expect(exec.isError).toBe(false);
  expect(exec.content).toContain("No order found");
});
```

## Behavior details

- **Round limit.** At most 5 model→tool→model rounds per chat turn; on the
  final round the Worker forces a text answer (`tool_choice: "none"`), so a
  confused model can't loop forever.
- **Parallel calls.** If the model requests several tools in one turn, each
  runs and all results return together.
- **Streaming.** Tool calls stream as `event: tool` SSE events between text
  chunks; the `done` event carries the full `toolUses` summary. Non-streaming
  responses carry `toolUses` on the JSON body.
- **Errors.** Handler exceptions and unknown tool names become `is_error`
  results the model can react to — they never fail the HTTP request.

## What users see

Everything in a tool-use summary — the tool **name**, the **input** the model
supplied, and the serialized **result** — is shown to the end user behind the
details disclosure (and the model can quote results anyway). Treat tool
results as public: never return secrets, other users' data, or internal
identifiers you wouldn't put on the page. Tools run for **anonymous site
visitors**, so handlers must do their own authorization — assume any input
the schema allows will eventually arrive.
