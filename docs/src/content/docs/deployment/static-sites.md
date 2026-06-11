---
title: "Host guide: static sites"
description: Embed Claudius on plain HTML sites and static site generators.
sidebar:
  order: 4
---

Works for hand-written HTML and any static site generator (Hugo, Jekyll,
Eleventy, Astro, …): add the embed tags to the layout/template that renders
every page, just before `</body>`.

```html
<script>
  window.ClaudiusConfig = {
    apiUrl: "https://your-worker.workers.dev",
    title: "Support",
    theme: "auto",
  };
</script>
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/gh/PMDevSolutions/Claudius@1/cdn/claudius.css"
/>
<script src="https://cdn.jsdelivr.net/gh/PMDevSolutions/Claudius@1/cdn/claudius.iife.js"></script>
```

Checklist:

1. `ALLOWED_ORIGIN` on the worker includes your site's origin
   (scheme + host, no trailing slash): `https://example.com`
2. If you set a CSP, allow `cdn.jsdelivr.net` (`script-src`, `style-src`) and
   your worker URL (`connect-src`)
3. The widget injects itself into `<body>` — no placeholder element needed

Alternatively use the web component anywhere in the page body:

```html
<claudius-chat api-url="https://your-worker.workers.dev" theme="auto"></claudius-chat>
```

(The bundle `<script>`/`<link>` tags are still required; the component
registers when the script loads.)
