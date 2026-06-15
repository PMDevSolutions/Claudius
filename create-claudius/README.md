# create-claudius

[![npm](https://img.shields.io/npm/v/create-claudius.svg)](https://www.npmjs.com/package/create-claudius)

Scaffold a [Claudius](https://claudius-docs.pages.dev) AI chat widget project in
one command.

```bash
npm create claudius@latest
# or
pnpm create claudius
# or
yarn create claudius
```

You'll be prompted for:

- **Project name** — the new directory / package name
- **Framework** — `vanilla` (CDN script embed), `react` (Vite), or `next` (Next.js App Router)
- **Theme** — `auto` / `light` / `dark`, or a built-in theme (`default`, `minimal`, `playful`, `corporate`)
- **Accent color** — a hex color for the widget
- **API URL** — your deployed Claudius worker endpoint
- Optionally, a **Cloudflare Worker** scaffold (`wrangler.toml` + KV stub + deploy runbook)

The generated project runs out of the box:

```bash
cd my-app
pnpm install
pnpm dev
```

## Non-interactive

Pass flags to skip the prompts (handy for CI):

```bash
npm create claudius@latest my-app -- \
  --template react \
  --theme auto \
  --accent "#4f46e5" \
  --api-url https://my-worker.workers.dev \
  --worker \
  --yes
```

| Flag | Values | Description |
| --- | --- | --- |
| `--template` | `vanilla` \| `react` \| `next` | Framework template |
| `--theme` | `auto` \| `light` \| `dark` \| `default` \| `minimal` \| `playful` \| `corporate` | Widget theme |
| `--accent` | `#rrggbb` | Accent color |
| `--api-url` | URL | Worker chat endpoint |
| `--worker` | — | Also scaffold a Cloudflare Worker |
| `--pm` | `npm` \| `pnpm` \| `yarn` \| `bun` | Package manager shown in next steps |
| `--yes`, `-y` | — | Accept defaults for any unspecified prompt |

## What you get

- **vanilla** — a static Vite site that loads the widget from the jsDelivr CDN via a
  single `<script>` tag and `window.ClaudiusConfig`.
- **react** — a Vite + React + TypeScript app using the `claudius-chat-widget`
  component and its stylesheet.
- **next** — a Next.js (App Router) + TypeScript app with a client-side widget wrapper.

See the [documentation](https://claudius-docs.pages.dev) for worker setup and
configuration.

MIT © PMDevSolutions
