---
title: Local development
description: Run the widget and worker on your machine.
sidebar:
  order: 3
---

## Prerequisites

- Node.js 20+ and [pnpm](https://pnpm.io)
- An Anthropic API key

## Setup

```bash
git clone https://github.com/PMDevSolutions/Claudius.git
cd Claudius

# Worker (terminal 1)
cd worker
pnpm install
cp .dev.vars.example .dev.vars    # add your ANTHROPIC_API_KEY
pnpm dev                          # http://localhost:8787

# Widget (terminal 2)
cd widget
pnpm install
pnpm dev                          # http://localhost:5173
```

Open <http://localhost:5173> — the dev app renders the widget pointed at the
local worker. The worker's CORS allows any `http://localhost:*` origin during
development, and wrangler provides a local KV store automatically.

## Running tests

```bash
cd widget
pnpm test                # Unit + integration (Vitest)
pnpm test:coverage       # Coverage report (80% thresholds)
pnpm e2e:install         # One-time: download Chromium
pnpm e2e                 # Playwright end-to-end

cd ../worker
pnpm test                # API, validation, rate-limit, analytics tests
```

The E2E suite mocks `**/api/chat`, so the worker doesn't need to run during
Playwright tests.

## Repository layout

| Path | What it is |
|------|------------|
| `widget/` | React widget: components, hooks, locales, embed entry |
| `worker/` | Cloudflare Worker: Hono routes, chat, rate limiting, analytics |
| `clients/` | Per-client JSON configs + schema |
| `scripts/` | `pnpm claudius` CLI (init, validate, snippet) |
| `docs/` | This documentation site |
| `cdn/` | Built embed bundle served via jsDelivr |
