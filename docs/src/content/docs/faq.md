---
title: FAQ
description: Common questions about embedding, limits, privacy, and troubleshooting.
---

## The bubble appears but messages fail — why?

Almost always CORS: the worker only answers origins in its
[`ALLOWED_ORIGIN`](/configuration/worker/) list. Check the browser console
for a CORS error and add your site's exact origin (scheme + host, no trailing
slash, comma-separated for multiple sites). `http://localhost:*` is always
allowed for development.

## Visitors see "Too many requests"

The worker rate-limits per IP — 10/minute and 50/hour by default. Raise
`RATE_LIMIT_MINUTE` / `RATE_LIMIT_HOUR` if your traffic is legitimate; the
limits exist to cap your Anthropic bill and block abuse.

## Does the widget work with a strict Content-Security-Policy?

Yes. CDN embeds need `cdn.jsdelivr.net` in `script-src` and `style-src`, and
your worker URL in `connect-src`. [Self-hosting](/deployment/self-hosted/)
removes the CDN requirement.

## Can I run several widgets on one page or several sites on one worker?

Both. Per page: give each widget a unique `storageKeyPrefix`. Per worker: list
every site in `ALLOWED_ORIGIN` — but note all sites then share one system
prompt; use [per-client configs](/configuration/clients/) with separate
workers when bots should differ.

## Which model does it use, and can I change it?

`claude-haiku-4-5-20251001` by default — fast and inexpensive, a good fit for
support chat. Set the `CLAUDE_MODEL` worker variable to any Claude model your
API key can access, and `MAX_TOKENS` to control response length (default
1024).

## What data is stored, and where?

- **Conversation content** lives only in the visitor's browser
  (`sessionStorage`, cleared when the tab closes) and in the request to your
  worker → Anthropic. The worker stores no message contents.
- **Analytics** (optional, off unless you bind `ANALYTICS_DB`): metadata only —
  timing, token counts, status and error codes, message counts/lengths.
- **Rate limiting**: short-lived per-IP counters in KV.

## How big is the embed?

About 150 KB gzipped JavaScript plus 3 KB CSS. The bundle includes React, so
React sites should prefer the [component](/deployment/react/) and share their
existing React.

## Is it accessible?

WCAG 2.1 AA: focus trap, full keyboard navigation, ARIA labels, screen-reader
announcements, reduced-motion-aware animations. Lighthouse accessibility
scores 98/100.

## How do I report a security issue?

Privately, per
[SECURITY.md](https://github.com/PMDevSolutions/Claudius/blob/main/SECURITY.md) —
please don't open a public issue for vulnerabilities.
