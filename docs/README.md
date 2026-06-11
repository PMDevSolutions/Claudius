# Claudius documentation site

Astro Starlight site published at
[claudius-docs.pages.dev](https://claudius-docs.pages.dev). Content lives in
`src/content/docs/`; `plans/` holds internal design/implementation notes and
is not part of the site.

## Develop

```bash
pnpm install
pnpm dev        # http://localhost:4321
pnpm build      # static build into dist/ (includes the Pagefind search index)
```

## Deployment

`.github/workflows/docs.yml` builds on every PR touching `docs/**` and
deploys `dist/` to the Cloudflare Pages project `claudius-docs` on pushes to
`main`.

One-time setup (already done if the site is live):

1. Create the Pages project:
   ```bash
   cd docs && pnpm build
   npx wrangler login
   npx wrangler pages project create claudius-docs --production-branch main
   npx wrangler pages deploy dist --project-name=claudius-docs
   ```
2. Add the `CLOUDFLARE_API_TOKEN` (Pages:Edit permission) and
   `CLOUDFLARE_ACCOUNT_ID` secrets to the GitHub repo so CI can deploy.
3. Optional custom domain (e.g. `docs.claudius.dev`): Cloudflare dashboard →
   Pages → claudius-docs → Custom domains. Then update `site` in
   `astro.config.mjs` and the docs links in the root README.
4. Add the docs origin to the production worker's `ALLOWED_ORIGIN`
   (comma-separated) so the live demo widget on the home page can chat:
   `ALLOWED_ORIGIN = https://pmds.info,https://claudius-docs.pages.dev`

## Versioned docs

[starlight-versions](https://github.com/HiDeoo/starlight-versions) archives a
copy of the docs per major release line (currently `1.x`, browsable via the
version switcher in the header). When a new major ships, add an entry to
`versions` in `astro.config.mjs`; the next build snapshots the then-current
docs under that slug.

Two authoring constraints the archiver imposes (it converts pages to MDX):

- No autolinks (`<https://example.com>`) — use `[text](url)` links
- Raw `<`/`>` outside code spans must be valid JSX
