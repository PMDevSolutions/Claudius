---
title: Introduction
description: What Claudius is, what ships in the box, and how the pieces fit together.
sidebar:
  order: 1
slug: 1.x/getting-started/introduction
---

Claudius is an open-source, embeddable AI chat widget powered by Claude. You
embed a small React-based widget on any website — via a script tag, a web
component, or the React component — and it talks to your own Cloudflare Worker,
which holds your Anthropic API key and calls Claude.

## How it fits together

```
Visitor's browser                Your Cloudflare account          Anthropic
┌──────────────────┐   POST      ┌──────────────────────┐
│  Claudius widget │ ──────────▶ │  claudius-chat-worker │ ─────▶ Claude API
│  (your website)  │ ◀────────── │  (Hono + KV + D1)     │ ◀─────
└──────────────────┘   JSON      └──────────────────────┘
```

* **Widget** (`widget/`) — React 18 + TypeScript + Tailwind. Ships as a React
  component, an IIFE script embed, and a `<claudius-chat>` web component.
* **Worker** (`worker/`) — Cloudflare Worker built with Hono. Validates input,
  rate-limits by IP via KV, calls Claude with your system prompt, and
  optionally records metadata-only analytics to D1.

Your API key never reaches the browser. The widget only knows the worker's
URL; CORS restricts which sites may call it.

## What's in the box

* Floating chat bubble with an accessible chat window (WCAG 2.1 AA)
* Markdown rendering (bold, italic, links) with XSS sanitization
* Light, dark, and auto themes plus an `accentColor` brand override
* Conversation persistence across page navigations (`sessionStorage`)
* Request timeout, retry button, and rate-limit-aware error messages
* Proactive triggers: time on page, scroll depth, exit intent, URL match
* Bundled English, Spanish, French, and German UI strings with auto-detection
* KV-based rate limiting (10/min, 50/hr per IP by default)
* Optional metadata-only analytics to Cloudflare D1
* Multi-client configuration files with a validation and snippet CLI

## Where to go next

* [Quick start](/1.x/getting-started/quick-start/) — embed the widget in 5 minutes
* [Local development](/1.x/getting-started/local-development/) — run widget and worker locally
* [Configuration](/1.x/configuration/widget/) — every option, with defaults
* [Deployment](/1.x/deployment/worker/) — ship the worker and the embed
