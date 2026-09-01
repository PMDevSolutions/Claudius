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
| `ATTACHMENTS_ENABLED` | No | `true` | Accept image/PDF attachments on user messages |
| `ATTACHMENT_TYPES` | No | JPEG, PNG, GIF, WebP, PDF | Comma-separated MIME allowlist |
| `ATTACHMENT_MAX_BYTES` | No | `5242880` | Per-file size cap (5 MB) |
| `ATTACHMENT_MAX_COUNT` | No | `5` | Files per message |
| `ATTACHMENT_MAX_REQUEST_BYTES` | No | `20971520` | Attachment bytes forwarded to Claude per request (20 MB) |
| `ATTACHMENT_QUOTA_IP_BYTES` | No | `52428800` | Upload bytes per IP per UTC day (50 MB); `0` disables |
| `ATTACHMENT_QUOTA_TENANT_BYTES` | No | `524288000` | Upload bytes per tenant per UTC day (500 MB); `0` disables |
| `TENANT_ID` | No | Origin host | Quota tenant identifier |
| `ATTACHMENT_STORAGE` | No | `passthrough` | `passthrough` (forward and discard) or `r2` (store with retention) |
| `ATTACHMENT_RETENTION_HOURS` | No | `24` | R2 mode: lifetime of stored files and signed URLs |
| `ATTACHMENT_SIGNING_SECRET` | R2 only | — | Secret for signing download URLs. Set as a secret |

See [Attachments](/configuration/attachments/) for how these fit together,
the storage backends, and the privacy posture.

## Bindings

| Binding | Required | Purpose |
|---------|----------|---------|
| `RATE_LIMIT` (KV) | Yes | Per-IP rate-limit counters and daily attachment quotas. Create with `npx wrangler kv namespace create RATE_LIMIT` |
| `ANALYTICS_DB` (D1) | No | Metadata-only analytics events. When absent, the chat endpoint works normally and skips recording |
| `ATTACHMENTS` (R2) | R2 only | Stores uploaded files when `ATTACHMENT_STORAGE=r2`. Create with `npx wrangler r2 bucket create claudius-attachments` |

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
- A message must have text, attachments, or both
- Attachments: allowlisted type matching the file's bytes, at most
  `ATTACHMENT_MAX_COUNT` per user message, each under `ATTACHMENT_MAX_BYTES`

Violations return `400` with code `VALIDATION_ERROR` (or an
`ATTACHMENT_*` code) — see the [REST API reference](/api/rest/).
