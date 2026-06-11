# Docs Site Implementation Plan (issue #74)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship an Astro Starlight docs site in `docs/`, deployed to Cloudflare Pages, with all nine sections, Pagefind search, versioned docs, a live demo widget, and a slimmed README.

**Architecture:** `docs/` becomes a standalone Astro Starlight package (matching the widget/worker standalone-package pattern; no pnpm workspace exists). Content lives in `docs/src/content/docs/` grouped into the nine sections from issue #74. A GitHub Actions workflow deploys `docs/dist` to the Cloudflare Pages project `claudius-docs` on pushes to `main`. The worker gains backward-compatible multi-origin CORS so the docs origin can chat against the production worker.

**Tech Stack:** Astro 5 + @astrojs/starlight (Pagefind search built in), starlight-versions for archives, Cloudflare Pages via wrangler-action, Vitest for the worker change.

**Design doc:** `docs/plans/2026-06-11-docs-site-design.md`

---

### Task 1: Worker multi-origin CORS (TDD)

**Files:**
- Test: `worker/src/__tests__/index.test.ts` (extend existing CORS coverage)
- Modify: `worker/src/index.ts:27-41`

**Step 1: Write failing tests** — `ALLOWED_ORIGIN = "https://a.example,https://b.example"`:
- request with `Origin: https://b.example` → `access-control-allow-origin: https://b.example`
- request with `Origin: https://evil.example` → header falls back to first allowed origin (`https://a.example`)
- single-value `ALLOWED_ORIGIN` behaves exactly as before (regression guard)

**Step 2: Run** `cd worker && pnpm test` — expect new tests FAIL.

**Step 3: Implement** in `worker/src/index.ts`:

```ts
origin: (origin, c) => {
  const allowed = (c.env.ALLOWED_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (origin?.startsWith("http://localhost:")) {
    return origin;
  }
  return origin && allowed.includes(origin) ? origin : allowed[0];
},
```

**Step 4: Run** `pnpm test` — all pass.

**Step 5: Commit** `feat(worker): accept comma-separated ALLOWED_ORIGIN list`

### Task 2: Scaffold Starlight in docs/

**Files:** Create `docs/package.json`, `docs/astro.config.mjs`, `docs/tsconfig.json`, `docs/.gitignore`, `docs/src/content.config.ts`, placeholder content. Keep `docs/plans/` and `docs/images/` untouched.

- Scaffold via `pnpm create astro@latest <tmp> -- --template starlight --no-install --no-git --yes` in a temp dir to pin current-good versions, copy project files into `docs/`, then `pnpm install` in `docs/`.
- `astro.config.mjs`: `site: "https://claudius-docs.pages.dev"`, Starlight title "Claudius", GitHub social link, sidebar with the nine groups (autogenerate per directory).
- Verify: `cd docs && pnpm build` succeeds (Pagefind index step runs as part of the Starlight build).
- Commit: `feat(docs): scaffold Astro Starlight site`

### Task 3: Author content (the nine sections)

All facts come from README.md, DEPLOY.md, CLAUDE.md, CHANGELOG.md, `worker/src/index.ts`, `widget/src/components/ChatWidget.tsx`, `widget/src/embed.tsx`, `widget/src/api/*`, `clients/_schema.json`. Roadmap sections must link tracking issues and say "planned", never describe unshipped features as shipped.

```
src/content/docs/
  index.mdx                          # splash + live demo (Task 4)
  getting-started/introduction.md    # what Claudius is, feature list, architecture diagram (widget ↔ worker ↔ Claude)
  getting-started/quick-start.mdx    # 5-minute CDN embed + worker deploy pointer
  getting-started/local-development.md  # pnpm dev in widget/ + worker/, .dev.vars
  configuration/widget.md            # full option table (React props = ClaudiusConfig keys = <claudius-chat> attrs; note WC subset: no locale/translations/triggers)
  configuration/worker.md            # env vars table: ANTHROPIC_API_KEY, ALLOWED_ORIGIN (now comma-separated), CLAUDE_MODEL, MAX_TOKENS, RATE_LIMIT_MINUTE/HOUR; KV + optional D1
  configuration/triggers.md          # ported Proactive Triggers section
  configuration/localization.md      # locale codes en/es/fr/de, auto-detection order, translations overrides
  configuration/theming.md           # light/dark/auto, accentColor, Tailwind brand colors
  configuration/clients.md           # clients/*.json schema + pnpm claudius init/validate/snippet
  deployment/worker.md               # wrangler deploy, KV namespace, D1 analytics, secrets, ALLOWED_ORIGIN
  deployment/cdn.md                  # jsDelivr @1 channel, pinning, CSP, ClaudiusWidgetVersion
  deployment/static-sites.md         # plain HTML embed walkthrough
  deployment/wordpress.md            # embed via theme footer / code-snippets plugin
  deployment/replit.md               # self-hosted files on Replit (pmds.info pattern)
  deployment/react.md                # React component + Next.js (client component) usage
  plugins/index.md                   # extension points today (system prompt, translations, CSS vars, MockChatApiClient); planned: #42 tool registry, #46 middleware SDK, #79 v2 RFC
  rag/index.md                       # sources pipeline today (ChatResponse.sources, ChatSources sidebar, Source type); planned: #43 retriever + Vectorize, #47 inline citations
  channels/index.md                  # web channel today (script embed, <claudius-chat>, React); planned: #57 Slack/Teams, #58 SMS/WhatsApp
  api/rest.md                        # POST /api/chat (request/response JSON, error envelope, codes table incl. RATE_LIMITED + Retry-After + limitType), GET /api/health, client retry policy
  api/widget.md                      # ChatWidgetProps reference, ClaudiusConfig global, web component attrs, exports
  migration/index.md                 # semver + versioning policy, docs archive policy
  migration/v1-0-to-v1-1.md          # embed filename rename claudius-embed.* → claudius.iife.js/.css; sessionStorage persistence note
  migration/v1-1-to-v1-2.md          # CDN channel introduction; recommended move from self-hosted
  migration/v1-2-to-v1-3.md          # 429 response gains limitType; no breaking changes
  faq.md                             # CORS, rate limits, CSP, multiple widgets, model config, privacy/analytics
```

Verify `pnpm build` passes (catches broken internal links); commit per coherent chunk (`docs: add <section> section`).

### Task 4: Live demo on home page

`index.mdx` splash hero + feature cards, then load the real widget:

```html
<script is:inline>
  window.ClaudiusConfig = {
    apiUrl: "https://pmds-chat-worker.paul-130.workers.dev",
    title: "Claudius Demo",
    subtitle: "Ask about Claudius",
    theme: "auto",
  };
</script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/PMDevSolutions/Claudius@1/cdn/claudius.css" />
<script is:inline src="https://cdn.jsdelivr.net/gh/PMDevSolutions/Claudius@1/cdn/claudius.iife.js"></script>
```

Note on page: chat works once `ALLOWED_ORIGIN` on the production worker includes the docs origin (Task 1 enables the list). Commit: `feat(docs): embed live demo widget on home page`.

### Task 5: Versioned docs

- `pnpm add -D starlight-versions` in docs/, register `starlightVersions({ versions: [{ slug: "1.3", label: "v1.3" }] })` in `astro.config.mjs`.
- Build; verify version switcher renders and `/1.3/` routes exist.
- **Fallback** if plugin incompatible: keep `migration/index.md` versioning policy + archive-per-major via Pages deployments (`v1.claudius-docs.pages.dev`), and note the mechanism in the docs README.
- Commit: `feat(docs): archive 1.x docs with version switcher`

### Task 6: Slim README

Rewrite `README.md` ≈70 lines: blurb, demo link, quick start (CDN embed + worker deploy), docs-site link table (one row per section), contributing/license. Commit: `docs: slim README to quick-start, link docs site`.

### Task 7: Deploy + CI

- `.github/workflows/docs.yml`: on push to `main` (paths `docs/**`) + `workflow_dispatch`; pnpm install/build in `docs/`; `cloudflare/wrangler-action@v3` → `pages deploy dist --project-name=claudius-docs` (cwd docs). Match pnpm/node versions used in `.github/workflows/ci.yml`.
- One-time local: `npx wrangler pages project create claudius-docs --production-branch main` then `npx wrangler pages deploy dist --project-name claudius-docs` from `docs/`. If wrangler is unauthenticated, record that the first deploy happens via CI once `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` secrets are added.
- Document custom domain `docs.claudius.dev` attachment as a dashboard step in `deployment/` docs… (docs site section "Deploying these docs" inside docs/README.md, not the product docs).
- Commit: `ci: deploy docs site to Cloudflare Pages`

### Task 8: Verify + PR

- `cd docs && pnpm build` ✓; `cd worker && pnpm test` ✓; `cd widget && pnpm test` ✓ (untouched, regression only).
- Push branch, open PR titled `feat: docs site (Astro Starlight) with versioned content and live demo (#74)` per CLAUDE.md auto-PR rule.
