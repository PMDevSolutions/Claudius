# Docs Site Design (issue #74)

Stand up a dedicated documentation site replacing the README-heavy docs, per
issue #74 acceptance criteria.

## Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Framework | Astro Starlight | Named first in the issue (and in its title); Pagefind search ships by default, so the search criterion costs nothing; lighter build than Docusaurus; aligns with the planned Astro adapter (#81). |
| Location | `docs/` as a standalone package | Repo has no pnpm workspace; widget/ and worker/ are already standalone packages. Existing `docs/plans/` and `docs/images/` stay where they are; Astro only reads `docs/src/`. |
| Hosting | Cloudflare Pages, project `claudius-docs` | Issue allows "docs.claudius.dev (or equivalent)". `claudius-docs.pages.dev` works immediately; attaching `docs.claudius.dev` is a dashboard/DNS step documented for later. |
| Deploy automation | GitHub Actions (`docs.yml`) running `wrangler pages deploy` on pushes to `main` touching `docs/**` | Matches the repo's existing CI-on-GitHub-Actions pattern. Requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repo secrets. |
| Search | Pagefind (Starlight built-in) | Zero config, satisfies the criterion without an Algolia application. |
| Versioning | `starlight-versions` plugin, archiving the current `1.x` docs | Satisfies "each major release archived" with a mechanism that makes the v2 archive a one-line change. Fallback if the plugin is incompatible with current Starlight: per-major Pages deployments documented in a versioning-policy page. |
| Live demo | Real widget via the jsDelivr `@1` CDN bundle, `apiUrl` = production worker | The demo must be interactive. Requires the worker to accept the docs origin (next row). |
| Worker CORS | Extend `ALLOWED_ORIGIN` to accept a comma-separated list (backward compatible) | The worker currently allows exactly one origin plus localhost. Without this, chat calls from the docs site are CORS-blocked. Single-value configs keep working unchanged. |
| README | Slimmed to blurb + 5-minute quick start + links into the docs site | Per acceptance criteria. |

## Section map (issue criteria → real content)

RAG, Channels, and Plugins are partly roadmap items. Their sections document
what exists today and clearly mark planned work with links to the tracking
issues, rather than describing unshipped features as real.

| Section | Content |
|---------|---------|
| Getting Started | What is Claudius; 5-minute embed quick start (CDN snippet); local development setup |
| Configuration | Widget options (React props / `window.ClaudiusConfig` / `<claudius-chat>` attributes); worker env vars; proactive triggers; localization; theming; multi-client configs + CLI |
| Deployment | Worker on Cloudflare (KV, D1 analytics, secrets); embed via CDN; self-hosted embed; per-host guides: static HTML, WordPress, Replit, React/Next.js |
| Plugins & Tools | Extension points that exist today (system prompt, translations, CSS custom properties); roadmap: tool-use registry (#51), plugin/hook SDK (#45), v2 plugin SDK RFC (#79) |
| RAG | Sources feature that exists today (`sources` in `ChatResponse`, `ChatSources` sidebar); roadmap: pluggable retriever + Vectorize (#52), inline citations (#56) |
| Channels | Web channel today (script embed, web component, React); roadmap: Slack/Teams (#62), SMS/WhatsApp (#63) |
| API Reference | REST: `POST /api/chat` (request/response, error codes, 429 + `Retry-After` + `limitType`), `GET /api/health`; client retry behavior; Widget API: full `ChatWidgetProps` |
| Migration Guides | 1.0→1.1 (embed filenames `claudius-embed.*` → `claudius.iife.js`/`claudius.css`, sessionStorage persistence); 1.1→1.2 (CDN channel); 1.2→1.3 (429 `limitType`); versioning policy |
| FAQ | CORS errors, rate limits, CSP for jsDelivr, multiple widgets per page, model configuration, data/privacy (metadata-only analytics) |

## Out of scope

- Purchasing/configuring the `claudius.dev` domain (user decision; documented as a follow-up step).
- npm publication (#41/#76), TypeDoc API generation (#48) — separate issues.
- Docs-site i18n (English only for now).
