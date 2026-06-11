---
title: "Host guide: WordPress"
description: Embed Claudius on a WordPress site without touching PHP.
sidebar:
  order: 5
slug: 1.x/deployment/wordpress
---

Three options, pick one:

## Option 1: Code-snippets plugin (easiest)

With a plugin like WPCode, add a new "footer" snippet containing the standard
embed tags:

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

## Option 2: Theme footer

In a child theme, hook the same markup into `wp_footer`:

```php
add_action( 'wp_footer', function () {
  ?>
  <!-- paste the embed tags from option 1 here -->
  <?php
} );
```

## Option 3: Block editor

On a single page, a Custom HTML block with the embed tags works too — but the
widget then only appears on that page.

## Notes

* Add your WordPress site's origin to the worker's `ALLOWED_ORIGIN`
* Some optimization plugins (autoptimize, rocket) defer or combine scripts; if
  the bubble doesn't appear, exclude `claudius.iife.js` from optimization
* Caching plugins are fine — the embed is static and config lives inline
