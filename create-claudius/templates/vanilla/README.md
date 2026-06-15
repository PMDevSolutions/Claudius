# {{PROJECT_NAME}}

A static site with the [Claudius](https://claudius-docs.pages.dev) chat widget
embedded via the CDN — no build step required for the widget itself.

```bash
pnpm install
pnpm dev
```

The widget is configured in `index.html` via `window.ClaudiusConfig`:

- `apiUrl` — your deployed Claudius worker (currently `{{API_URL}}`)
- `theme` — `{{THEME}}`
- `accentColor` — `{{ACCENT_COLOR}}`

You need a running Claudius worker for the chat to respond. See the
[worker setup guide](https://claudius-docs.pages.dev/deployment/worker/), or
re-run the scaffolder with `--worker` to generate one.
