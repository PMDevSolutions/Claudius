# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**Claudius** is an embeddable AI chat widget for PMDS and client sites. It consists of two packages:

- **widget/** - React chat widget component (Vite + TypeScript + Tailwind)
- **worker/** - Cloudflare Workers backend (Hono + Anthropic SDK)

## Project Structure

```
claudius/
├── widget/                 # React chat widget
│   ├── src/
│   │   ├── components/     # React components
│   │   │   ├── ChatWidget.tsx       # Root component
│   │   │   ├── ChatWindow.tsx       # Chat UI container
│   │   │   ├── ChatInput.tsx        # Message input form
│   │   │   ├── ChatToggleButton.tsx # Floating action button
│   │   │   └── MessageBubble.tsx    # Individual message display
│   │   ├── hooks/
│   │   │   └── useChat.ts           # Chat state management
│   │   ├── index.ts                 # Public exports
│   │   ├── main.tsx                 # Dev app entry
│   │   ├── styles.css               # Tailwind styles
│   │   └── test-setup.ts            # Vitest setup
│   ├── index.html                   # Dev app HTML
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── package.json
├── worker/                 # Cloudflare Workers backend
│   ├── src/
│   │   ├── index.ts                 # Hono API routes
│   │   ├── chat.ts                  # Claude API integration
│   │   ├── system-prompt.ts         # Bot personality/knowledge
│   │   └── __tests__/               # Worker tests
│   ├── wrangler.toml                # Cloudflare config
│   ├── .dev.vars.example            # Local secrets template
│   └── package.json
├── clients/                # Per-client configs
│   ├── _schema.json                 # JSON Schema for validation
│   ├── example.json                 # Example client config
│   └── example-system-prompt.md     # Example system prompt
├── scripts/                # CLI and build tooling
│   ├── cli.ts                       # CLI entry point
│   ├── lib/
│   │   ├── config.ts                # Config loader/validator
│   │   └── snippet.ts               # Embed snippet generator
│   └── vitest.config.ts
├── .gitignore
├── package.json            # Root package
├── README.md
├── CONTRIBUTING.md
├── SECURITY.md
└── LICENSE
```

## Development Commands

### Widget (React)

```bash
cd widget
pnpm install          # Install dependencies
pnpm dev              # Start dev server (port 5173)
pnpm build            # Production build
pnpm test             # Run tests
pnpm test:watch       # Run tests in watch mode
```

### Worker (Cloudflare)

```bash
cd worker
pnpm install          # Install dependencies
pnpm dev              # Start local dev server (port 8787)
pnpm deploy           # Deploy to Cloudflare
pnpm test             # Run tests
```

### Local Development Setup

1. Install dependencies in both packages
2. Copy `worker/.dev.vars.example` to `worker/.dev.vars`
3. Add your Anthropic API key to `.dev.vars`
4. Run `pnpm dev` in both widget/ and worker/ directories
5. Open http://localhost:5173

## Architecture

### Widget Components

| Component | Purpose |
|-----------|---------|
| `ChatWidget` | Root component, manages open/close state |
| `ChatWindow` | Chat UI container with message list and input |
| `ChatInput` | Message input form with submit handling |
| `ChatToggleButton` | Floating button to open/close chat |
| `MessageBubble` | Renders individual messages with URL linking |
| `ChatSources` | Slide-out sidebar displaying grouped source links |
| `SourceIcon` | Icon button with badge count to trigger source sidebar |

### useChat Hook

Manages chat state:
- `messages` - Array of chat messages
- `isLoading` - Loading state during API calls
- `error` - Error message if API call fails
- `sendMessage(text)` - Send a message to the API
- `clearMessages()` - Clear chat history

### API Client

`ChatApiClient` in `widget/src/api/client.ts` handles communication with the Worker:
- Typed requests/responses (`ChatRequest`, `ChatResponse`)
- Retry on 429 (respects `Retry-After`) and 503 (exponential backoff: 1s, 3s)
- Max 2 retries (3 total attempts)
- Debounced sends (configurable, default 300ms)
- Typed errors (`ChatApiError` with status/code, `DebounceError`)

### Worker API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Send message, get AI response |
| `/api/health` | GET | Health check |

### Chat Request/Response

```typescript
// Request
{
  messages: [
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi there!" }
  ]
}

// Response
{
  reply: "How can I help you today?",
  sources?: [
    { url: "https://...", title: "...", type: "blog" | "page" | "external" }
  ]
}
```

## Customization

### System Prompt

Edit `worker/src/system-prompt.ts` to customize:

- Bot personality and tone
- Business information (name, contact, hours)
- Pricing structure
- Services offered
- FAQ responses
- Blog post references with URLs

### Behavioral Rules

The system prompt includes rules for:
- Response length and formatting
- Line break usage
- No emojis, no em dashes
- Prompt injection protection
- When to recommend contact form

### Styling

The widget uses Tailwind CSS with custom colors defined in `widget/tailwind.config.ts`:

- `pmds-blue` - Primary brand color
- `pmds-dark` - Text color
- `pmds-gray` - Secondary text
- `pmds-light-green` - Assistant message background

## Multi-Client Configuration

### Client Config Files

Each client gets a JSON config file in `clients/`:

```bash
pnpm claudius init acme        # Scaffold new client
pnpm claudius validate acme    # Validate config
pnpm claudius snippet acme     # Generate embed snippets
```

Config files reference `clients/_schema.json` for IDE autocomplete. See `clients/example.json` for the full schema.

### Client Config Structure

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Human-readable client name |
| `slug` | Yes | URL-safe identifier (must match filename) |
| `apiUrl` | Yes | Worker chat endpoint URL |
| `allowedDomains` | Yes | Domains where widget may be embedded |
| `widget` | No | Widget appearance (title, theme, colors) |
| `worker` | No | Worker settings (model, rate limits, system prompt) |

### Scripts Tests

```bash
pnpm test:scripts  # Run config/snippet/CLI tests
```

## Testing

### Widget Tests (Vitest + React Testing Library)

Located in `widget/src/components/__tests__/` and `widget/src/hooks/__tests__/`:

- Component rendering tests
- User interaction tests
- Hook state management tests

### Worker Tests (Vitest)

Located in `worker/src/__tests__/`:

- API endpoint tests
- System prompt content tests
- Input validation tests

Run all tests:
```bash
cd widget && pnpm test
cd worker && pnpm test
```

## Deployment

### Worker

```bash
cd worker
wrangler secret put ANTHROPIC_API_KEY  # Set production API key
pnpm deploy                             # Deploy to Cloudflare
```

Update `ALLOWED_ORIGIN` in `wrangler.toml` for production CORS.

### Widget

Build and include in your site:
```bash
cd widget
pnpm build
```

## Code Style

- TypeScript strict mode
- Functional React components
- Custom hooks for reusable logic
- Tailwind CSS for styling
- Vitest for testing
- pnpm for package management

## Environment Variables

### Worker (.dev.vars / Cloudflare secrets)

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude |
| `ALLOWED_ORIGIN` | CORS allowed origin (set in wrangler.toml for local dev) |
