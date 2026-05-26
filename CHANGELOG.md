# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
