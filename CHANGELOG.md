# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
