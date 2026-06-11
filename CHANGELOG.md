# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
