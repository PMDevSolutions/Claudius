---
title: Scaffold a project
description: Create a ready-to-run Claudius project in one command with create-claudius.
---

`create-claudius` scaffolds a working Claudius project — frontend (and optionally a
Cloudflare Worker) — in under a minute, the same way `npm create vite` works.

```bash
npm create claudius@latest
# or
pnpm create claudius
# or
yarn create claudius
```

## What it asks

| Prompt | Choices |
| --- | --- |
| **Project name** | the new directory / package name |
| **Framework** | `vanilla` (CDN script embed) · `react` (Vite) · `next` (Next.js App Router) |
| **Theme** | `auto` · `light` · `dark` · `default` · `minimal` · `playful` · `corporate` |
| **Accent color** | a hex color, e.g. `#4f46e5` |
| **API URL** | your deployed worker's chat endpoint |
| **Worker?** | optionally scaffold a Cloudflare Worker alongside the app |

## Run it

```bash
cd my-app
pnpm install
pnpm dev
```

The chat needs a running [Claudius worker](/deployment/worker/) to respond. Point the
generated app's `apiUrl` at your worker, or scaffold one by answering **yes** to the
worker prompt (or passing `--worker`).

## Non-interactive

Every prompt has a flag, so the scaffolder works in CI or scripts:

```bash
npm create claudius@latest my-app -- \
  --template react \
  --theme auto \
  --accent "#4f46e5" \
  --api-url https://my-worker.workers.dev \
  --worker \
  --yes
```

| Flag | Values |
| --- | --- |
| `--template` | `vanilla` · `react` · `next` |
| `--theme` | `auto` · `light` · `dark` · `default` · `minimal` · `playful` · `corporate` |
| `--accent` | `#rrggbb` |
| `--api-url` | URL |
| `--worker` | include a Cloudflare Worker |
| `--pm` | `npm` · `pnpm` · `yarn` · `bun` (shown in the next-steps hint) |
| `--yes`, `-y` | accept defaults for anything not provided |

## What you get

- **vanilla** — a static [Vite](https://vite.dev) site that loads the widget from the
  jsDelivr CDN via a single `<script>` tag and `window.ClaudiusConfig`.
- **react** — a Vite + React + TypeScript app using the
  [`claudius-chat-widget`](https://www.npmjs.com/package/claudius-chat-widget)
  component and its stylesheet.
- **next** — a Next.js (App Router) + TypeScript app with a `'use client'` widget
  wrapper.
- **worker** (optional) — a minimal Cloudflare Worker (`wrangler.toml` + KV stub +
  deploy runbook) that proxies chat requests to Claude.
