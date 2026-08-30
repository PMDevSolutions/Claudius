import type { ClaudiusTool } from "./types";

/**
 * Reference tools. `getCurrentTime` is fully functional;
 * `searchKnowledgeBase` and `submitLead` are honest stubs meant to be wired
 * to real backends (Vectorize/KV, D1/email) before registering — see the
 * "Tool use" docs page for the tutorial.
 */

/** Returns the current date and time, optionally in a specific IANA timezone. */
export const getCurrentTime: ClaudiusTool<{ timezone?: string }> = {
  name: "get_current_time",
  description:
    "Get the current date and time. Use when the user asks about the " +
    "current time or date, business-hours questions relative to now, or " +
    "anything requiring today's date. Accepts an optional IANA timezone " +
    '(e.g. "America/New_York"); defaults to UTC.',
  inputSchema: {
    type: "object",
    properties: {
      timezone: {
        type: "string",
        description: 'IANA timezone identifier, e.g. "Europe/Berlin".',
      },
    },
    additionalProperties: false,
  },
  handler: ({ timezone }) => {
    const now = new Date();
    const tz = timezone || "UTC";
    try {
      const formatted = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        dateStyle: "full",
        timeStyle: "long",
      }).format(now);
      return { iso: now.toISOString(), timezone: tz, formatted };
    } catch {
      // Unknown timezone: fall back to UTC rather than failing the turn.
      return {
        iso: now.toISOString(),
        timezone: "UTC",
        formatted: now.toUTCString(),
        note: `Unknown timezone "${timezone}"; returned UTC instead.`,
      };
    }
  },
};

/**
 * Knowledge-base search stub. Replace the handler with a real retriever
 * (Cloudflare Vectorize, KV, an external search API) before registering.
 */
export const searchKnowledgeBase: ClaudiusTool<{ query: string }> = {
  name: "search_knowledge_base",
  description:
    "Search the site's knowledge base for documentation, policies, or " +
    "product details relevant to the user's question. Use when the answer " +
    "isn't in the system prompt.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query describing what to look up.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  handler: ({ query }) => ({
    results: [],
    note:
      `No knowledge base is configured, so the search for ${JSON.stringify(
        String(query)
      )} returned nothing. Answer from what you already know, and say so ` +
      "if you can't.",
  }),
};

/**
 * Lead-capture stub: validates and echoes the lead back. Wire the handler to
 * real storage (a D1 table, an email, a CRM webhook) before registering —
 * as shipped it only logs, and tells the model so.
 */
export const submitLead: ClaudiusTool<{
  name: string;
  email: string;
  message?: string;
}> = {
  name: "submit_lead",
  description:
    "Record a sales lead when a user asks to be contacted or wants a quote. " +
    "Only call after the user has explicitly provided their name and email " +
    "for this purpose — never invent or infer contact details.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "The user's name." },
      email: { type: "string", description: "The user's email address." },
      message: {
        type: "string",
        description: "What the user wants to talk about (optional).",
      },
    },
    required: ["name", "email"],
    additionalProperties: false,
  },
  handler: ({ name, email, message }) => {
    if (!name?.trim() || !email?.trim() || !email.includes("@")) {
      throw new Error(
        "A non-empty name and a valid email are required to submit a lead."
      );
    }
    // Stub: log only. Replace with a D1 insert, email, or CRM call.
    console.log("[submitLead]", { name, email, message });
    return {
      status: "received",
      note:
        "Lead recorded in the Worker logs only — persistent storage is not " +
        "configured. Tell the user their details were noted and the team " +
        "will follow up, but do not promise a specific response time.",
    };
  },
};
