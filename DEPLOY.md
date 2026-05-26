# Deployment Instructions

## Deploy Worker with Rate Limiting

```bash
cd worker

# 1. Create KV namespace for rate limiting
npx wrangler kv namespace create RATE_LIMIT

# 2. Copy the output ID into wrangler.toml, replacing "placeholder":
#    [[kv_namespaces]]
#    binding = "RATE_LIMIT"
#    id = "your-id-here"

# 3. Deploy (includes rate limiting + PMDS system prompt)
npx wrangler deploy

# 4. Set ALLOWED_ORIGIN in Cloudflare dashboard:
#    Workers > pmds-chat-worker > Settings > Variables
#    ALLOWED_ORIGIN = https://pmds.info
```

## Set up Analytics (D1) -- optional

The chat endpoint records metadata-only analytics events (timing, token
counts, error codes -- no message contents) to a D1 database when the
`ANALYTICS_DB` binding is configured. If the binding is absent, the
endpoint still works and just skips the insert.

```bash
cd worker

# 1. Create the D1 database
npx wrangler d1 create claudius-analytics

# 2. Copy the database_id from the output into wrangler.toml:
#    [[d1_databases]]
#    binding = "ANALYTICS_DB"
#    database_name = "claudius-analytics"
#    database_id = "your-id-here"

# 3. Run the migration against production
npx wrangler d1 execute claudius-analytics --remote --file=./migrations/0001_create_events.sql

# 4. For local development, run the same migration against the local D1 store
npx wrangler d1 execute claudius-analytics --local --file=./migrations/0001_create_events.sql
```

## Deploy PMDS System Prompt

The repo's `worker/src/system-prompt.ts` is generic (open source template).
The PMDS-specific prompt is at `docs/examples/pmds/system-prompt.ts`.

```bash
# Copy PMDS prompt for deploy
cp docs/examples/pmds/system-prompt.ts worker/src/system-prompt.ts
npx wrangler deploy

# Restore generic prompt so repo stays clean
git checkout -- worker/src/system-prompt.ts
```

## Build Widget

```bash
cd widget
pnpm install
pnpm build:embed
# Output: dist/claudius.iife.js + dist/claudius.css
```

## Embed via CDN (recommended, auto-updating)

Point the site at the version-pinned jsDelivr channel. `@1` always resolves the
latest `v1.x` release, so patches and minor versions roll out automatically; a
new major (`v2`) never lands without an explicit bump. (jsDelivr caches the
range resolution for ~12h.)

```html
<script>
  window.ClaudiusConfig = {
    /* ...your config... */
  };
</script>
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/gh/PMDevSolutions/Claudius@1/cdn/claudius.css"
/>
<script src="https://cdn.jsdelivr.net/gh/PMDevSolutions/Claudius@1/cdn/claudius.iife.js"></script>
```

Pin to an exact release with `@1.2.0` when you need it. Embedding sites must
allow `cdn.jsdelivr.net` in their CSP `script-src` and `style-src`. Check what a
page is running via `window.ClaudiusWidgetVersion` in the browser console.

## Embed self-hosted (alternative)

Upload `claudius.iife.js` and `claudius.css` to the Replit project, then add before `</body>`:

```html
<script>
  window.ClaudiusConfig = {
    apiUrl: "https://pmds-chat-worker.paul-130.workers.dev",
    title: "PMDS Chat",
    subtitle: "Ask me anything about our services",
    welcomeMessage: "Hi! I'm Paul's assistant. Ask me about web development services, pricing, or anything else. How can I help?",
    placeholder: "Ask me anything about PMDS..."
  };
</script>
<link rel="stylesheet" href="/claudius.css" />
<script src="/claudius.iife.js"></script>
```

## Worker URL

Production: `https://pmds-chat-worker.paul-130.workers.dev`
