---
title: "Host guide: Replit"
description: Embed Claudius on a site hosted on Replit.
sidebar:
  order: 6
slug: 1.x/deployment/replit
---

This is the pattern used by [pmds.info](https://pmds.info), which runs
Claudius in production on Replit.

## CDN embed (recommended)

Add the standard tags before `</body>` in your Replit project's HTML template:

```html
<script>
  window.ClaudiusConfig = {
    apiUrl: "https://your-worker.workers.dev",
    title: "Support",
    subtitle: "Ask me anything",
  };
</script>
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/gh/PMDevSolutions/Claudius@1/cdn/claudius.css"
/>
<script src="https://cdn.jsdelivr.net/gh/PMDevSolutions/Claudius@1/cdn/claudius.iife.js"></script>
```

## Self-hosted files (alternative)

Upload `claudius.iife.js` and `claudius.css` (from `pnpm build:embed`, or
copied from the repo's `cdn/` directory) into the Replit project and reference
them locally:

```html
<link rel="stylesheet" href="/claudius.css" />
<script src="/claudius.iife.js"></script>
```

## Notes

* Set `ALLOWED_ORIGIN` on the worker to your site's public origin — both your
  custom domain and the `*.replit.app` domain if you use both (comma-separated)
* Replit serves static assets as-is; no build-step integration is needed
