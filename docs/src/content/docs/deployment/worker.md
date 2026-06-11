---
title: Deploy the worker
description: Ship the Cloudflare Worker with rate limiting, secrets, CORS, and optional analytics.
sidebar:
  order: 1
---

## One-time setup

```bash
cd worker
pnpm install
npx wrangler login
```

## Rate-limit KV namespace

```bash
npx wrangler kv namespace create RATE_LIMIT
```

Copy the generated id into `worker/wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "your-id-here"
preview_id = "your-preview-id-here"
```

## Secrets and deploy

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler deploy
```

## CORS

Set `ALLOWED_ORIGIN` to the origin(s) that may call the worker — in
`wrangler.toml` `[vars]` or the dashboard (Workers → Settings → Variables).
Comma-separate multiple origins:

```
ALLOWED_ORIGIN = https://your-site.example,https://docs.your-site.example
```

`http://localhost:*` is always allowed for development.

## Analytics with D1 (optional)

The chat endpoint records metadata-only events (timing, token counts, status,
error codes — never message contents) when the `ANALYTICS_DB` binding exists.
Without the binding the endpoint works normally.

```bash
npx wrangler d1 create claudius-analytics
# paste database_id into wrangler.toml:
#   [[d1_databases]]
#   binding = "ANALYTICS_DB"
#   database_name = "claudius-analytics"
#   database_id = "your-id-here"

# run the migration (production and local)
npx wrangler d1 execute claudius-analytics --remote --file=./migrations/0001_create_events.sql
npx wrangler d1 execute claudius-analytics --local  --file=./migrations/0001_create_events.sql
```

## Tuning

Optional `[vars]` in `wrangler.toml`: `CLAUDE_MODEL`, `MAX_TOKENS`,
`RATE_LIMIT_MINUTE`, `RATE_LIMIT_HOUR` — see
[Worker settings](/configuration/worker/) for defaults.
