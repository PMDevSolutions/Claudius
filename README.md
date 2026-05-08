# Claudius - Embeddable AI Chat Widget

An open-source, embeddable AI chat widget powered by Claude. Drop it into any website with a single script tag.

## Demo

![Claudius chat widget in light and dark mode](docs/images/demo.png)

> Try it live at [pmds.info](https://pmds.info)

## Features

- Floating chat bubble with toggle
- Markdown rendering (bold, italic, links)
- Dark mode (light, dark, auto)
- Conversation persistence (localStorage)
- Rate limiting (KV-based, per IP)
- Accessible (WCAG 2.1 AA, Lighthouse 98/100)
- Responsive (mobile-first, works at 320px+)
- Configurable (title, colors, system prompt, theme)
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

## Configuration

Configure the widget via `window.ClaudiusConfig`:

| Option | Default | Description |
|--------|---------|-------------|
| `apiUrl` | (required) | URL of your Cloudflare Worker |
| `title` | `"Chat"` | Header title |
| `subtitle` | `"Ask me anything"` | Header subtitle |
| `welcomeMessage` | `"Hi! How can I help you today?"` | First message shown |
| `placeholder` | `"Type your message..."` | Input placeholder |
| `persistMessages` | `true` | Save chat history to `sessionStorage` (survives page navigation, clears on tab close) |
| `storageKeyPrefix` | `"claudius:messages"` | Storage key prefix; set to a unique value per widget when embedding multiple widgets on one page |
| `theme` | `"light"` | Color scheme: `"light"`, `"dark"`, or `"auto"` |
| `accentColor` | `"#2563eb"` | Primary brand color override |

### Example

```html
<script>
  window.ClaudiusConfig = {
    apiUrl: "https://your-worker.workers.dev",
    title: "Support",
    subtitle: "Ask me anything",
    welcomeMessage: "Hi! How can I help?",
    theme: "auto",
    accentColor: "#0057a3",
  };
</script>
<link rel="stylesheet" href="/path/to/claudius.css" />
<script src="/path/to/claudius.iife.js"></script>
```

## Customization

### System Prompt

Edit `worker/src/system-prompt.ts` to customize the AI's personality, knowledge base, services, pricing, and FAQ. This is where you make the chatbot yours.

### Brand Colors

Edit `widget/tailwind.config.ts` to change brand colors, fonts, and border radii. Colors use CSS custom properties so you can also override them at runtime via `accentColor`.

### Theming

The widget supports three theme modes:

- **`"light"`** (default) -- Light background, dark text
- **`"dark"`** -- Dark background, light text
- **`"auto"`** -- Follows the user's OS preference via `prefers-color-scheme`

## Rate Limiting

The worker includes KV-based rate limiting to protect against API abuse:

- **10 requests/minute** per IP
- **50 requests/hour** per IP

### Setup

Create a KV namespace for rate limiting:

```bash
cd worker
npx wrangler kv namespace create RATE_LIMIT
```

Copy the output ID into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "your-namespace-id"
preview_id = "your-preview-namespace-id"
```

For local development, wrangler automatically creates a local KV store.

## Deployment

### Deploy the Worker

```bash
cd worker
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler deploy
```

Set `ALLOWED_ORIGIN` in the Cloudflare dashboard (Workers > Settings > Variables) to your production domain.

### Build the Widget

```bash
cd widget
pnpm build:embed
```

Output: `dist/claudius.iife.js` and `dist/claudius.css`

Host these files on your site or a CDN, then add the embed snippet to your HTML.

## Tech Stack

- **Widget:** React 18, TypeScript, Tailwind CSS, Vite
- **Worker:** Cloudflare Workers, Hono, Anthropic SDK, KV
- **AI Model:** Claude Haiku 4.5

## License

MIT
