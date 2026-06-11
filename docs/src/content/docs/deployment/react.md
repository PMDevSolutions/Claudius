---
title: "Host guide: React & Next.js"
description: Use the ChatWidget React component directly in React apps.
sidebar:
  order: 7
---

React apps should use the component instead of the script embed — same
features, no global config object, fully typed props.

:::note
npm publication is planned ([#41](https://github.com/PMDevSolutions/Claudius/issues/41)).
Until then, consume the package from the repo (git submodule, pnpm `file:`/
`link:` dependency, or a private registry) — it builds to `dist/` with type
declarations via `pnpm build`.
:::

## React

```tsx
import { ChatWidget } from "claudius-chat-widget";
import "claudius-chat-widget/style.css";

export function App() {
  return (
    <ChatWidget
      apiUrl="https://your-worker.workers.dev"
      title="Support"
      subtitle="Ask me anything"
      theme="auto"
      accentColor="#0057a3"
      position="bottom-right"
    />
  );
}
```

All options from the [widget reference](/configuration/widget/) are props,
including `locale`, `translations`, and `triggers` (with real `RegExp`
support in `matchUrl`/`pattern`).

## Next.js

The widget touches `window`, `sessionStorage`, and `matchMedia`, so render it
as a client component:

```tsx
// app/components/Chat.tsx
"use client";

import { ChatWidget } from "claudius-chat-widget";
import "claudius-chat-widget/style.css";

export function Chat() {
  return <ChatWidget apiUrl="https://your-worker.workers.dev" theme="auto" />;
}
```

Mount it once in your root layout. On the Pages Router, load it with
`next/dynamic` and `ssr: false` instead.

:::note[Planned]
First-class Next.js and Astro adapters are planned —
[#60](https://github.com/PMDevSolutions/Claudius/issues/60),
[#80](https://github.com/PMDevSolutions/Claudius/issues/80),
[#81](https://github.com/PMDevSolutions/Claudius/issues/81).
:::
