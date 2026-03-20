# Claudius

An embeddable AI chat widget for PMDS and client sites. React component + standalone script embed, powered by Cloudflare Workers and Claude.

## Features

- Floating chat button with expandable chat window
- Powered by Claude AI via Anthropic API
- Cloudflare Workers backend for fast, global responses
- React component for easy integration
- Auto-focus input on open
- URL detection and linking in messages
- Line break rendering for formatted responses
- Mobile responsive design
- Tailwind CSS styling

## Project Structure

```
claudius/
├── widget/              # React chat widget
│   ├── src/
│   │   ├── components/  # ChatWidget, ChatWindow, ChatInput, etc.
│   │   ├── hooks/       # useChat hook
│   │   └── styles.css   # Tailwind styles
│   └── package.json
├── worker/              # Cloudflare Workers backend
│   ├── src/
│   │   ├── index.ts     # Hono API routes
│   │   ├── chat.ts      # Claude API integration
│   │   └── system-prompt.ts  # Bot personality and knowledge
│   └── package.json
└── package.json         # Root package
```

## Local Development

### Prerequisites

- Node.js 18+
- pnpm
- Anthropic API key

### Setup

```bash
# Clone the repository
git clone https://github.com/PMDevSolutions/Claudius.git
cd claudius

# Install dependencies
cd widget && pnpm install
cd ../worker && pnpm install

# Configure API key
cp worker/.dev.vars.example worker/.dev.vars
# Edit .dev.vars with your Anthropic API key
```

### Run locally

**Terminal 1 - Worker (backend):**
```bash
cd worker
pnpm dev
# Runs on http://localhost:8787
```

**Terminal 2 - Widget (frontend):**
```bash
cd widget
pnpm dev
# Runs on http://localhost:5173
```

Open http://localhost:5173 and click the chat button.

## Testing

```bash
# Widget tests
cd widget && pnpm test

# Worker tests
cd worker && pnpm test
```

## Deployment

### Worker (Cloudflare)

```bash
cd worker

# Set production API key
wrangler secret put ANTHROPIC_API_KEY

# Deploy
pnpm deploy
```

### Widget

Build the widget and include it in your site:

```bash
cd widget
pnpm build
```

## Usage

### React Component

```tsx
import { ChatWidget } from "pmds-chat-widget";

function App() {
  return <ChatWidget apiUrl="https://your-worker.workers.dev" />;
}
```

### Props

| Prop | Type | Description |
|------|------|-------------|
| `apiUrl` | `string` | URL of your Cloudflare Worker API |

## Configuration

### System Prompt

Edit `worker/src/system-prompt.ts` to customize:

- Bot personality and tone
- Business information
- Pricing details
- FAQ responses
- Blog post references

### CORS

Update `ALLOWED_ORIGIN` in `worker/wrangler.toml` for production:

```toml
[vars]
ALLOWED_ORIGIN = "https://yourdomain.com"
```

## License

MIT
