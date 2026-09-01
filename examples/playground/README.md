# Claudius Playground

Interactive demo site for the Claudius chat widget: controls for every public
prop, a live preview pane with desktop/mobile viewports, and a generated embed
snippet with copy-to-clipboard and StackBlitz/CodeSandbox export.

Live at [claudius-playground.pages.dev](https://claudius-playground.pages.dev).

## How it works

- The preview pane is an iframe on [public/preview.html](public/preview.html),
  a stand-in landing page that loads the widget from the auto-updating
  jsDelivr `@1` CDN channel (the same bundle the README tells adopters to
  embed) and reads its `window.ClaudiusConfig` from a base64url-encoded JSON
  URL hash. Editing a control re-encodes the config and remounts the iframe
  (debounced).
- The preview talks to the dedicated public demo worker
  (`worker/wrangler.demo.toml`), which allows this site's origin and answers
  with a demo persona under tight rate limits.
- The snippet panel renders the same config against a placeholder worker URL,
  formatted like the `pnpm claudius snippet` CLI output.

## Development

```bash
pnpm install
pnpm dev        # http://localhost:5174
pnpm test       # snippet/encoding unit tests
pnpm typecheck
pnpm build
```

## Deployment

Pushes to `main` that touch this directory deploy to the
`claudius-playground` Cloudflare Pages project via
[.github/workflows/playground.yml](../../.github/workflows/playground.yml)
(one-time setup: `wrangler pages project create claudius-playground`).
