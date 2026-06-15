# {{PROJECT_NAME}}

A [Next.js](https://nextjs.org) (App Router) + TypeScript app using the
[`claudius-chat-widget`](https://www.npmjs.com/package/claudius-chat-widget)
component.

```bash
pnpm install
pnpm dev
```

The widget is rendered by a client component (`app/ClaudiusWidget.tsx`) because it
relies on browser APIs:

```tsx
"use client";
import { ChatWidget } from "claudius-chat-widget";
import "claudius-chat-widget/style.css";
```

You need a running Claudius worker for the chat to respond. See the
[worker setup guide](https://claudius-docs.pages.dev/deployment/worker/), or
re-run the scaffolder with `--worker` to generate one.
