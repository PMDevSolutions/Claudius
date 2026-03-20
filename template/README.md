# Claudius - Embeddable AI Chat Widget

An open-source, embeddable AI chat widget powered by Claude. Drop it into any website with a single script tag.

## Features

- Floating chat bubble with toggle
- Markdown rendering (bold, italic, links)
- Accessible (WCAG 2.1 AA, Lighthouse 98/100)
- Responsive (mobile-first, works at 320px+)
- Configurable (title, colors, system prompt)
- Lightweight (~150KB gzipped JS + 3KB CSS)

## Quick Start

### 1. Set up the worker (backend)

```bash
cd worker
pnpm install
cp .dev.vars.example .dev.vars   # Add your Anthropic API key
pnpm dev                          # Starts on http://localhost:8787
```

### 2. Set up the widget (frontend)

```bash
cd widget
pnpm install
pnpm dev                          # Starts on http://localhost:5173
```

### 3. Open http://localhost:5173 and test the chat

## Customization

### System Prompt

Edit `worker/src/system-prompt.ts` to customize the AI's personality, knowledge base, services, pricing, and FAQ. This is where you make the chatbot yours.

### Widget Configuration

Configure the widget via `window.ClaudiusConfig`:

| Option | Default | Description |
|--------|---------|-------------|
| `apiUrl` | (required) | URL of your Cloudflare Worker |
| `title` | "Chat" | Header title |
| `subtitle` | "Ask me anything" | Header subtitle |
| `welcomeMessage` | "Hi! How can I help you today?" | First message shown |
| `placeholder` | "Type your message..." | Input placeholder |

### Brand Colors

Edit `widget/tailwind.config.ts` to change brand colors, fonts, and border radii. Colors use CSS custom properties so you can also override them at runtime.

## Deployment

### Deploy the Worker

```bash
cd worker
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler deploy
```

### Build the Widget

```bash
cd widget
pnpm build:embed
```

Output: `dist/claudius.iife.js` and `dist/claudius.css`

### Embed on Your Site

```html
<script>
  window.ClaudiusConfig = {
    apiUrl: "https://your-worker.workers.dev",
    title: "Support",
    subtitle: "Ask me anything",
    welcomeMessage: "Hi! How can I help?",
  };
</script>
<link rel="stylesheet" href="/path/to/claudius.css" />
<script src="/path/to/claudius.iife.js"></script>
```

## Tech Stack

- **Widget:** React 18, TypeScript, Tailwind CSS, Vite
- **Worker:** Cloudflare Workers, Hono, Anthropic SDK
- **AI Model:** Claude Haiku 4.5

## License

MIT
