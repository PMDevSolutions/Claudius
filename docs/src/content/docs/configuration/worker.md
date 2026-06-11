---
title: Worker settings
description: Environment variables, bindings, and the system prompt.
sidebar:
  order: 2
---

## Environment variables

Set local values in `worker/.dev.vars` (copy from `.dev.vars.example`);
production values live in `wrangler.toml` `[vars]` or as encrypted secrets.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes | — | Anthropic API key. Always set as a secret: `npx wrangler secret put ANTHROPIC_API_KEY` |
| `ALLOWED_ORIGIN` | Yes | `http://localhost:5173` | Origin(s) allowed by CORS. Accepts a comma-separated list, e.g. `https://a.example,https://b.example`. Any `http://localhost:*` origin is always allowed for development |
| `CLAUDE_MODEL` | No | `claude-haiku-4-5-20251001` | Claude model used for replies |
| `MAX_TOKENS` | No | `1024` | Max response tokens |
| `RATE_LIMIT_MINUTE` | No | `10` | Requests per minute per IP |
| `RATE_LIMIT_HOUR` | No | `50` | Requests per hour per IP |

## Bindings

| Binding | Required | Purpose |
|---------|----------|---------|
| `RATE_LIMIT` (KV) | Yes | Per-IP rate-limit counters. Create with `npx wrangler kv namespace create RATE_LIMIT` |
| `ANALYTICS_DB` (D1) | No | Metadata-only analytics events. When absent, the chat endpoint works normally and skips recording |

See [Deploy the worker](/deployment/worker/) for the exact wrangler commands.

## System prompt

The bot's personality, knowledge, and guardrails live in
`worker/src/system-prompt.ts`. The repo ships a generic template; edit it to
describe your business, services, pricing, and FAQ. The prompt also includes
behavioral rules (response length, formatting, prompt-injection protection,
when to recommend a contact form).

Redeploy the worker after editing:

```bash
cd worker
npx wrangler deploy
```

## Input limits

The worker validates every request before calling Claude:

- `messages` is required and non-empty
- At most **100 messages** per request
- Each message's content is truncated to **2,000 characters**
- Roles must be `user` or `assistant`

Violations return `400` with code `VALIDATION_ERROR` — see the
[REST API reference](/api/rest/).
