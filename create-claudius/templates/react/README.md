# {{PROJECT_NAME}}

A [Vite](https://vite.dev) + React + TypeScript app using the
[`claudius-chat-widget`](https://www.npmjs.com/package/claudius-chat-widget)
component.

```bash
pnpm install
pnpm dev
```

The widget lives in `src/App.tsx`:

```tsx
import { ChatWidget } from "claudius-chat-widget";
import "claudius-chat-widget/style.css";

<ChatWidget apiUrl="{{API_URL}}" theme="{{THEME}}" accentColor="{{ACCENT_COLOR}}" />;
```

You need a running Claudius worker for the chat to respond. See the
[worker setup guide](https://claudius-docs.pages.dev/deployment/worker/), or
re-run the scaffolder with `--worker` to generate one.
