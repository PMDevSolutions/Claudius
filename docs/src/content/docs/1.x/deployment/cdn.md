---
title: Embed via CDN
description: The recommended auto-updating embed, with version pinning and CSP notes.
sidebar:
  order: 2
slug: 1.x/deployment/cdn
---

The repo publishes the built embed bundle to `cdn/` on every release, served
through jsDelivr. The `@1` channel resolves to the latest `v1.x` release, so
patches and minors roll out automatically; a new major (`v2`) never lands
without an explicit bump on your side. jsDelivr caches the range resolution
for about 12 hours.

```html
<script>
  window.ClaudiusConfig = {
    apiUrl: "https://your-worker.workers.dev",
    /* ...options... */
  };
</script>
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/gh/PMDevSolutions/Claudius@1/cdn/claudius.css"
/>
<script src="https://cdn.jsdelivr.net/gh/PMDevSolutions/Claudius@1/cdn/claudius.iife.js"></script>
```

## Pinning

Pin an exact release when you need reproducibility:

```
https://cdn.jsdelivr.net/gh/PMDevSolutions/Claudius@1.3.0/cdn/claudius.iife.js
```

Check what a page is running via `window.ClaudiusWidgetVersion` in the
browser console.

## Content-Security-Policy

Embedding sites must allow jsDelivr:

```
script-src ... cdn.jsdelivr.net;
style-src  ... cdn.jsdelivr.net;
connect-src ... https://your-worker.workers.dev;
```

Prefer not to allow a third-party CDN? [Self-host the bundle](/1.x/deployment/self-hosted/).
