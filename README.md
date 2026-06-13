# Claudius - Embeddable AI Chat Widget

[![npm](https://img.shields.io/npm/v/claudius-chat-widget.svg)](https://www.npmjs.com/package/claudius-chat-widget)
[![license](https://img.shields.io/npm/l/claudius-chat-widget.svg)](LICENSE)

An open-source, embeddable AI chat widget powered by Claude. Drop it into any
website with a single script tag, or install it as a React component.

**Full documentation: [claudius-docs.pages.dev](https://claudius-docs.pages.dev)**

> Try it live at [pmds.info](https://pmds.info) or on the
> [docs home page](https://claudius-docs.pages.dev).

## Quick start

Claudius is two pieces: a Cloudflare Worker (keeps your Anthropic API key
server-side) and a widget embed.

### 1. Deploy the worker

```bash
git clone https://github.com/PMDevSolutions/Claudius.git
cd Claudius/worker
pnpm install
npx wrangler login
npx wrangler kv namespace create RATE_LIMIT   # paste the id into wrangler.toml
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler deploy
```

Then set `ALLOWED_ORIGIN` to your site's origin (Workers → Settings →
Variables). Comma-separate multiple origins.

### 2. Embed the widget

Add before `</body>`:

```html
<script>
  window.ClaudiusConfig = {
    apiUrl: "https://claudius-chat-worker.<you>.workers.dev",
    title: "Support",
    subtitle: "Ask me anything",
    theme: "auto",
  };
</script>
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/gh/PMDevSolutions/Claudius@1/cdn/claudius.css"
/>
<script src="https://cdn.jsdelivr.net/gh/PMDevSolutions/Claudius@1/cdn/claudius.iife.js"></script>
```

The `@1` CDN channel auto-updates within v1.x. That's it.

### 3. Or install as a React component

Building a React app? Install from npm instead of the script embed:

```bash
npm install claudius-chat-widget react react-dom
```

```tsx
import { ChatWidget } from "claudius-chat-widget";
import "claudius-chat-widget/style.css";

<ChatWidget
  apiUrl="https://claudius-chat-worker.<you>.workers.dev"
  title="Support"
/>;
```

The package ships dual ESM/CJS builds with TypeScript types. See the
[documentation](https://claudius-docs.pages.dev) for theming, localization, and
SSR notes.

## Documentation

| Section | What's there |
|---------|--------------|
| [Getting started](https://claudius-docs.pages.dev/getting-started/introduction/) | Architecture, quick start, local development |
| [Configuration](https://claudius-docs.pages.dev/configuration/widget/) | Every widget and worker option, triggers, localization, theming, multi-client configs |
| [Deployment](https://claudius-docs.pages.dev/deployment/worker/) | Worker setup, CDN vs self-hosted embed, per-host guides (static, WordPress, Replit, React/Next.js) |
| [API reference](https://claudius-docs.pages.dev/api/rest/) | REST endpoints, error codes, widget TypeScript API |
| [Migration guides](https://claudius-docs.pages.dev/migration/) | Upgrading between versions |
| [FAQ](https://claudius-docs.pages.dev/faq/) | CORS, rate limits, CSP, privacy |

## Development

```bash
cd worker && pnpm install && pnpm dev    # http://localhost:8787
cd widget && pnpm install && pnpm dev    # http://localhost:5173
```

Tests: `pnpm test` in `widget/` and `worker/`. Details in the
[local development guide](https://claudius-docs.pages.dev/getting-started/local-development/).

## Tech stack

React 18 + TypeScript + Tailwind (widget) · Cloudflare Workers + Hono +
Anthropic SDK (worker) · Claude Haiku 4.5 by default.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md),
[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md), and [SECURITY.md](./SECURITY.md)
for how to report security issues responsibly.

## License

Released under the [MIT License](./LICENSE).
