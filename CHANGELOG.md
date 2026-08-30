# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.13.0](https://github.com/PMDevSolutions/Claudius/compare/v1.12.0...v1.13.0) (2026-08-30)


### Features

* Anthropic tool use with a declarative tool registry ([ed00f58](https://github.com/PMDevSolutions/Claudius/commit/ed00f58a1e0ea8a6af9df56accce223a22b49ed4))
* **widget:** render used-tool chips with details disclosure ([5070272](https://github.com/PMDevSolutions/Claudius/commit/50702727f5f188cbbbcde855d9a91e33070fcca2)), closes [#51](https://github.com/PMDevSolutions/Claudius/issues/51)
* **worker:** declarative tool registry with transparent tool-use round trip ([815b1bf](https://github.com/PMDevSolutions/Claudius/commit/815b1bfc6a4dbe8d8411298042ab462c40a3d9de)), closes [#51](https://github.com/PMDevSolutions/Claudius/issues/51)

## [1.12.0](https://github.com/PMDevSolutions/Claudius/compare/v1.11.0...v1.12.0) (2026-08-30)


### Features

* SSE streaming responses with token-by-token rendering ([6ce4a26](https://github.com/PMDevSolutions/Claudius/commit/6ce4a26d9154dec9beb792f6cc96cb7f93c3b99b))
* **widget:** token-by-token streaming with stop button ([ab0360b](https://github.com/PMDevSolutions/Claudius/commit/ab0360b08994f9b01113c6f25d917dda43aa1648)), closes [#50](https://github.com/PMDevSolutions/Claudius/issues/50)
* **worker:** SSE streaming endpoint /api/chat/stream ([1e72c7b](https://github.com/PMDevSolutions/Claudius/commit/1e72c7becebce1db2053124abddfe8bab53cc5ee)), closes [#50](https://github.com/PMDevSolutions/Claudius/issues/50)

## [1.11.0](https://github.com/PMDevSolutions/Claudius/compare/v1.10.0...v1.11.0) (2026-08-30)


### Features

* **worker:** SYSTEM_PROMPT override + dedicated demo worker for playground/docs ([492140e](https://github.com/PMDevSolutions/Claudius/commit/492140e8b1c252dd70713dc362c50ce25df137cd))

## [1.10.0](https://github.com/PMDevSolutions/Claudius/compare/v1.9.0...v1.10.0) (2026-08-30)


### Features

* **playground:** public demo site with live config editor ([89bbc64](https://github.com/PMDevSolutions/Claudius/commit/89bbc64edde25b4a5b95ed9077c25ae87c8affa2))
* **playground:** public demo site with live config editor ([34282c0](https://github.com/PMDevSolutions/Claudius/commit/34282c0a39b0d005f322e4c76ab9af00306c1029)), closes [#48](https://github.com/PMDevSolutions/Claudius/issues/48)
* **widget:** enforce bundle-size budgets in CI with size-limit ([0616aec](https://github.com/PMDevSolutions/Claudius/commit/0616aec85c3998a0cd11a180f5c5efc4b8c2d8bc))
* **widget:** enforce bundle-size budgets in CI with size-limit ([51c6c6b](https://github.com/PMDevSolutions/Claudius/commit/51c6c6b4b0e9ab47f48757d0be20d12133ab1ca2)), closes [#47](https://github.com/PMDevSolutions/Claudius/issues/47)


### Bug Fixes

* **ci:** run bundle-size job on Node 22 for size-limit v13 ([ab111fb](https://github.com/PMDevSolutions/Claudius/commit/ab111fb636f1ba1ce2db0afb25b63f6e12f437fe))
* **ci:** run local size-limit binary in size-limit-action ([44d1a1c](https://github.com/PMDevSolutions/Claudius/commit/44d1a1c51873bce9dfb8a44bfe9706d9ecc6a54d))
* **ci:** tolerate base branches without size-limit in size job ([57839fa](https://github.com/PMDevSolutions/Claudius/commit/57839faed1b578bcf6e1b50b15c046b590f01a7d))

## [1.9.0](https://github.com/PMDevSolutions/Claudius/compare/v1.8.2...v1.9.0) (2026-06-19)


### Features

* **plugins:** message-middleware plugin SDK for widget and worker ([fc79f61](https://github.com/PMDevSolutions/Claudius/commit/fc79f6154e9d4346f407ca3eaddfaf45e01fbc46))
* **plugins:** message-middleware plugin SDK for widget and worker ([3d0466a](https://github.com/PMDevSolutions/Claudius/commit/3d0466a92ff44faeca6bb94097ab8b887a5b578f)), closes [#45](https://github.com/PMDevSolutions/Claudius/issues/45)

## [1.8.2](https://github.com/PMDevSolutions/Claudius/compare/v1.8.1...v1.8.2) (2026-06-18)


### Bug Fixes

* **ci:** harden npm trusted publishing (OIDC) in release workflows ([494292f](https://github.com/PMDevSolutions/Claudius/commit/494292f0071d9a1efdbf9df8bc623f0bcad65755))
* **ci:** harden npm trusted publishing (OIDC) in release workflows ([f6ec1ae](https://github.com/PMDevSolutions/Claudius/commit/f6ec1ae2e271ce37df1b0781e51657ce203cdff2))

## [1.8.1](https://github.com/PMDevSolutions/Claudius/compare/v1.8.0...v1.8.1) (2026-06-17)


### Bug Fixes

* **widget:** skip declaration bundling under Storybook build ([df0a03e](https://github.com/PMDevSolutions/Claudius/commit/df0a03ef09f5eaa8dd6825a060c0a070f54ea1b3))

## [1.8.0](https://github.com/PMDevSolutions/Claudius/compare/v1.7.0...v1.8.0) (2026-06-16)


### Features

* **widget:** expand Storybook coverage, theme switcher, and Pages deploy ([943e580](https://github.com/PMDevSolutions/Claudius/commit/943e5800bf6bb608c1e716d73620efd16ef919bc))
* **widget:** expand Storybook coverage, theme switcher, and Pages deploy ([7e5de1b](https://github.com/PMDevSolutions/Claudius/commit/7e5de1b500912370b0bfd1566ba70ff9e91059b7)), closes [#43](https://github.com/PMDevSolutions/Claudius/issues/43)

## [1.7.0](https://github.com/PMDevSolutions/Claudius/compare/v1.6.0...v1.7.0) (2026-06-15)


### Features

* add create-claudius project scaffolder ([b72f3ca](https://github.com/PMDevSolutions/Claudius/commit/b72f3cab20b3435339d3ae53c0c49e655a06c9a0))
* add create-claudius project scaffolder ([04f870e](https://github.com/PMDevSolutions/Claudius/commit/04f870e030e0c6a2f3c87467f3f0e7d2335e378b)), closes [#42](https://github.com/PMDevSolutions/Claudius/issues/42)

## [1.6.0](https://github.com/PMDevSolutions/Claudius/compare/v1.5.0...v1.6.0) (2026-06-13)


### Features

* publish widget to npm as claudius-chat-widget ([4146076](https://github.com/PMDevSolutions/Claudius/commit/414607635f359c20038981ddb324db9944a2c842))
* publish widget to npm as claudius-chat-widget ([c686212](https://github.com/PMDevSolutions/Claudius/commit/c686212238062bf83a8ad7b35fc16240b87897a2))

## [1.5.0](https://github.com/PMDevSolutions/Claudius/compare/v1.4.0...v1.5.0) (2026-06-11)


### Features

* theming v2 with design tokens, theme files, and editor ([96dbdc0](https://github.com/PMDevSolutions/Claudius/commit/96dbdc0250f96ad0d290f004d5210ddabddfaefd))
* **widget:** add theme engine with four built-in themes ([b4d8b17](https://github.com/PMDevSolutions/Claudius/commit/b4d8b177f7a44c43bf08a0430948dd02f590e75e))
* **widget:** publish theme.v1 JSON schema with validation tests ([ce43d5b](https://github.com/PMDevSolutions/Claudius/commit/ce43d5bd4c1ff52d7af02fc821cf4aed0138cecc))
* **widget:** theme prop accepts built-in names, theme objects, and URLs ([1ce06d3](https://github.com/PMDevSolutions/Claudius/commit/1ce06d34e48ee2dc000a96a65802e119b133e3c1))


### Refactoring

* **widget:** move all visual styles onto --cl-* design tokens ([1eb6ed9](https://github.com/PMDevSolutions/Claudius/commit/1eb6ed9efc529513cbd793877021ee36ee865de0))

## [1.4.0](https://github.com/PMDevSolutions/Claudius/compare/v1.3.0...v1.4.0) (2026-06-11)


### Features

* Astro Starlight docs site with versioned content and live demo ([9f29abe](https://github.com/PMDevSolutions/Claudius/commit/9f29abe71c32f69809430a96b5c2c44b3bbba44b))
* **docs:** archive 1.x docs with starlight-versions switcher ([b81ea85](https://github.com/PMDevSolutions/Claudius/commit/b81ea85cb3f2da397c6bcd17e1f47bc5fb2907bc))
* **docs:** author all nine doc sections with live demo on home page ([5929cdd](https://github.com/PMDevSolutions/Claudius/commit/5929cddf8ff0bd8e49fd751a922b0de476715c6c))
* **docs:** scaffold Astro Starlight site in docs/ ([cc98cf1](https://github.com/PMDevSolutions/Claudius/commit/cc98cf16fc53e752dfcfa95acfa87196e65393d1))
* **worker:** accept comma-separated ALLOWED_ORIGIN list ([267cec2](https://github.com/PMDevSolutions/Claudius/commit/267cec2f6c87b1936d81a2b4dedef34d7902f07d))

## [1.3.0](https://github.com/PMDevSolutions/Claudius/compare/v1.2.1...v1.3.0) (2026-06-09)


### Features

* **worker:** expose limitType in chat route 429 response ([aef6fb6](https://github.com/PMDevSolutions/Claudius/commit/aef6fb6f8d7c549918327028a1c14637b8ae5d1f))
* **worker:** return 429 with Retry-After and limitType on chat route rate limit ([2863ee2](https://github.com/PMDevSolutions/Claudius/commit/2863ee28a1e40fac9534a74f3d2187c89b6cbbc7))

## [1.2.1](https://github.com/PMDevSolutions/Claudius/compare/v1.2.0...v1.2.1) (2026-05-26)


### Bug Fixes

* **ci:** guard fromJSON against empty release PR output ([5f47613](https://github.com/PMDevSolutions/Claudius/commit/5f47613bfa6309be5d6bf3fc5db2608529d44786))
* **ci:** guard fromJSON against empty release PR output ([0c00839](https://github.com/PMDevSolutions/Claudius/commit/0c008395866eb1e25a87aa7a67f78e7ca45c64a3))

## [1.2.0](https://github.com/PMDevSolutions/Claudius/compare/v1.1.0...v1.2.0) (2026-05-26)


### Features

* serve embed via versioned CDN with auto-update ([1f72de8](https://github.com/PMDevSolutions/Claudius/commit/1f72de87741b3995cf4d4dac50ad3bce1888d5c4))
* versioned CDN auto-update for embedding sites ([ce180f0](https://github.com/PMDevSolutions/Claudius/commit/ce180f04605ffbb0c31812746de914a78bcf60b8))

## [Unreleased]

## [1.1.0] - 2026-05-26

### Added

- Session persistence: conversation history is restored from `sessionStorage`,
  with a configurable `storageKeyPrefix`. (#32)
- Request reliability: a per-request timeout, a retry button after a failed
  send, and a reduced-motion-aware typing indicator. (#33)
- Proactive triggers: configurable time, scroll, exit-intent, and URL triggers
  that either open the chat or show a greeting bubble. (#40)
- Localization: bundled English, Spanish, French, and German translations with
  automatic locale detection from `<html lang>` and `navigator.language`. (#85)
- Worker analytics (phase 1): optional, metadata-only event logging to a D1
  database via the `ANALYTICS_DB` binding. The chat endpoint behaves exactly as
  before when the binding is absent. (#39)

### Changed

- The `triggers`, `locale`, and `translations` options are now configurable
  through the `window.ClaudiusConfig` embed surface, not only the React
  component props.

### Internal

- Embed build now emits `claudius.iife.js` and `claudius.css` (previously
  `claudius-embed.*`), matching the documented embed snippet and the deployed
  site so the existing `<script src>` and `<link>` tags need no changes.
- Continuous integration: build, test, and lint workflows plus a Playwright E2E
  job. (#37)
- Test coverage: unit and integration suite with a mock API client and 80% v8
  thresholds. (#34)
- End-to-end tests: Playwright coverage for the chat flow, mobile layout, and
  the embed bundle. (#35)
- Documentation: README, full configuration table, and contributing guide.
  (#36)
- Community: GitHub Discussions and issue/PR templates. (#38)

## [1.0.0] - 2026-03-29

### Added

- Embeddable AI chat widget with floating bubble toggle
- - React 18 + TypeScript + Tailwind CSS widget
  - - Cloudflare Workers backend with Hono and Anthropic SDK
    - - Dark mode support (light, dark, auto)
      - - Conversation persistence via localStorage
        - - KV-based rate limiting (10/min, 50/hr per IP)
          - - WCAG 2.1 AA accessibility (Lighthouse 98/100)
            - - Responsive design (mobile-first, 320px+)
              - - Configurable title, subtitle, colors, system prompt, and theme
                - - Markdown rendering (bold, italic, links)
                  - - Multi-client configuration system with JSON schema validation
                    - - CLI tooling for client init, validate, and snippet generation
                      - - CORS and allowed origin protection
                        - - Deployment documentation for Cloudflare Workers
                          - - Contributing guide, security policy, and MIT license
