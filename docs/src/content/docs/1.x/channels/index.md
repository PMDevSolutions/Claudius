---
title: Channels
description: Where Claudius can talk to your users — web today, messaging platforms planned.
slug: 1.x/channels
---

## Today: the web channel

Claudius ships one channel: an embeddable web widget, available three ways
(all backed by the same worker):

| Surface | Best for | Guide |
|---------|----------|-------|
| Script embed (`window.ClaudiusConfig` + IIFE bundle) | Any website, CMSs, static sites | [Embed via CDN](/1.x/deployment/cdn/) |
| `<claudius-chat>` web component | Markup-driven embedding without React | [Static sites guide](/1.x/deployment/static-sites/) |
| `ChatWidget` React component | React and Next.js apps | [React guide](/1.x/deployment/react/) |

Multiple widgets can share one worker, and one page can host multiple widgets
(give each a unique `storageKeyPrefix`).

## Planned channels

The worker core (validation, rate limiting, Claude integration, analytics) is
channel-agnostic by design; messaging adapters are tracked for v2:

* **Slack and Microsoft Teams** adapters sharing the worker core —
  [#62](https://github.com/PMDevSolutions/Claudius/issues/62)
* **SMS and WhatsApp** via Twilio —
  [#63](https://github.com/PMDevSolutions/Claudius/issues/63)

Neither is shipped yet. Watch the issues for design discussion and progress.
