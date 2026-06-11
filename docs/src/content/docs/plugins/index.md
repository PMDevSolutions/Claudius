---
title: Plugins & Tools
description: Extension points available today, and the planned plugin SDK and tool registry.
---

## Extension points today

Claudius doesn't have a plugin API yet, but several supported extension points
cover most customization needs:

| Extension point | What it controls |
|-----------------|------------------|
| [System prompt](/configuration/worker/#system-prompt) (`worker/src/system-prompt.ts`) | The bot's personality, knowledge, guardrails, and FAQ answers |
| [Translations](/configuration/localization/) | Every user-facing UI string |
| [Theming options](/configuration/theming/) and `widget/tailwind.config.ts` | Colors, fonts, radii |
| [Proactive triggers](/configuration/triggers/) | When the widget opens or greets proactively |
| Worker env vars (`CLAUDE_MODEL`, `MAX_TOKENS`, rate limits) | Model behavior and abuse protection |
| Fork-level: `widget/src/` and `worker/src/` | Anything else — both packages are small, typed, and well-tested |

For testing integrations, the widget exports a `MockChatApiClient` test
utility (`widget/src/test-utils/`) that fakes the API client without network
calls.

## Planned

These are tracked on the [v1.3.0 and v2.0.0 milestones](https://github.com/PMDevSolutions/Claudius/milestones):

- **Anthropic tool-use / function calling** with a declarative tool registry,
  so the bot can call your APIs mid-conversation —
  [#51](https://github.com/PMDevSolutions/Claudius/issues/51)
- **Plugin/hook SDK** for message middleware: pre-send and post-receive
  transforms — [#45](https://github.com/PMDevSolutions/Claudius/issues/45)
- **Plugin SDK RFC for Claudius v2** — the longer-term plugin architecture —
  [#79](https://github.com/PMDevSolutions/Claudius/issues/79)

Nothing on this list is shipped yet. If you need one of these, comment on the
issue — it helps prioritization.
