# {{PROJECT_NAME}}-worker

A minimal [Cloudflare Worker](https://workers.cloudflare.com) that keeps your
Anthropic API key server-side and powers the Claudius widget. It exposes
`POST /api/chat` and `GET /api/health`, with CORS and a small KV-backed rate limit.

> This is a trimmed starter. For the full-featured worker (analytics, configurable
> rate limits, richer error handling), see the
> [Claudius worker](https://github.com/PMDevSolutions/Claudius/tree/main/worker).

## Local development

```bash
pnpm install
cp .dev.vars.example .dev.vars   # then add your ANTHROPIC_API_KEY
pnpm dev                          # http://localhost:8787
```

## Deploy

```bash
# 1. Create the KV namespace and paste the id(s) into wrangler.toml
npx wrangler kv namespace create RATE_LIMIT

# 2. Store your API key as a secret
npx wrangler secret put ANTHROPIC_API_KEY

# 3. Deploy
npx wrangler deploy
```

After deploying, set `ALLOWED_ORIGIN` (in `wrangler.toml` or the Cloudflare
dashboard) to your site's origin, and point the widget's `apiUrl` at the worker
URL.
