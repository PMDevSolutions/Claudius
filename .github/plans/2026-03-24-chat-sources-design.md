# ChatSources Component Design

**Issue:** #4 - Source and search results display component
**Date:** 2026-03-24

## Overview

A slide-out sidebar panel that displays source links associated with assistant messages. Sources are returned by the worker API, grouped by type, and triggered via an icon button on each message.

## Types

```typescript
interface Source {
  url: string;
  title: string;
  type: "blog" | "page" | "external";
}

// ChatResponse expands:
interface ChatResponse {
  reply: string;
  sources?: Source[];
}

// ChatMessage expands:
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}
```

## Components

### SourceIcon (new)

Trigger button displayed on assistant messages that have sources.

- Small link/document icon, bottom-left of assistant message bubble
- Tiny badge circle showing source count, colored `claudius-primary`
- Muted by default, more visible on hover
- Tooltip: "View sources"
- Clicking toggles the ChatSources sidebar for that message

### ChatSources (new)

Slide-out sidebar panel.

- Slides from the left edge of ChatWindow, overlaying the message area
- Width: ~280px
- Background: `claudius-light` (dark mode aware)
- Border-right: 2px `claudius-border`
- Rounded corners on right side
- Smooth slide transition (~200ms ease)

**Header:**
- "Sources" title
- "{n} sources found" subtext
- Close (X) button

**Body:**
- Grouped by type: blogs first, then pages, then external
- Type group headers: small muted labels ("Blog", "Page", "External"), only shown if that type has entries
- Source cards: rounded-[12px], 2px border, subtle fill
- Each card shows title (truncated) and domain extracted from URL
- Click opens link in new tab
- Hover: slight background shift

**No empty state needed** - icon only appears when sources exist.

## Integration

### Files to create

- `widget/src/components/ChatSources.tsx` - Sidebar panel
- `widget/src/components/SourceIcon.tsx` - Trigger button with badge

### Files to modify

- `widget/src/api/types.ts` - Add `Source` type, update `ChatResponse`
- `widget/src/hooks/useChat.ts` - Pass sources through to `ChatMessage`
- `widget/src/components/MessageBubble.tsx` - Render SourceIcon for assistant messages with sources
- `widget/src/components/ChatWindow.tsx` - Manage sidebar state, render ChatSources overlay
- `widget/src/index.ts` - Export new types

### Not in scope (this PR)

- Worker changes to return source data. Widget will be built and testable with mock data in dev mode.

## Filtering

The worker handles domain filtering server-side using the client's `allowedDomains` config. The widget trusts and renders whatever sources the API returns.

## Source grouping order

1. Blog posts (`type: "blog"`)
2. Site pages (`type: "page"`)
3. External links (`type: "external"`)
