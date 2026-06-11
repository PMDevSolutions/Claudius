---
title: Self-hosted embed
description: Build the bundle yourself and serve it from your own infrastructure.
sidebar:
  order: 3
slug: 1.x/deployment/self-hosted
---

Self-hosting gives you full control (no third-party CDN in your CSP, custom
Tailwind theme builds) at the cost of manual updates.

## Build

```bash
cd widget
pnpm install
pnpm build:embed
# Output: dist/claudius.iife.js and dist/claudius.css
```

## Serve and embed

Upload both files anywhere your site can reach them, then add before
`</body>`:

```html
<script>
  window.ClaudiusConfig = {
    apiUrl: "https://your-worker.workers.dev",
    title: "Support",
  };
</script>
<link rel="stylesheet" href="/claudius.css" />
<script src="/claudius.iife.js"></script>
```

## Updating

Rebuild and re-upload on each release you want to adopt. The
[migration guides](/1.x/migration/) call out anything you need to change between
versions — most releases are drop-in.
