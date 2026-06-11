---
title: Multi-client configs
description: Manage one widget+worker pair per client with JSON configs and the CLI.
sidebar:
  order: 6
---

Agencies deploying Claudius for several clients keep one JSON config per
client in `clients/`, validated against `clients/_schema.json`.

## CLI

```bash
pnpm claudius init acme        # scaffold clients/acme.json
pnpm claudius validate acme    # validate against the schema
pnpm claudius snippet acme     # generate the embed snippet(s)
```

## Config structure

```json
{
  "$schema": "./_schema.json",
  "name": "Acme Corp",
  "slug": "acme",
  "apiUrl": "https://acme-chat.example.workers.dev/api/chat",
  "allowedDomains": ["acme.example"],
  "widget": {
    "title": "Acme Support",
    "theme": "auto",
    "accentColor": "#aa0000",
    "position": "bottom-right"
  },
  "worker": {
    "model": "claude-haiku-4-5-20251001",
    "maxTokens": 1024,
    "rateLimitMinute": 10,
    "rateLimitHour": 50,
    "systemPrompt": "acme-system-prompt.md"
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Human-readable client name |
| `slug` | Yes | URL-safe identifier; must match the filename |
| `apiUrl` | Yes | The client's worker chat endpoint |
| `allowedDomains` | Yes | Domains where the widget may be embedded |
| `widget` | No | Appearance: `title`, `subtitle`, `welcomeMessage`, `placeholder`, `theme`, `position`, `accentColor` |
| `worker` | No | `model`, `maxTokens` (1–8192), `rateLimitMinute`, `rateLimitHour`, `systemPrompt` (path to a markdown file) |

See `clients/example.json` and `clients/example-system-prompt.md` in the repo
for a complete worked example. Referencing `_schema.json` from `$schema` gives
IDE autocomplete and inline validation.
