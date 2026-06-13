# claudius-chat-widget

[![npm](https://img.shields.io/npm/v/claudius-chat-widget.svg)](https://www.npmjs.com/package/claudius-chat-widget)
[![license](https://img.shields.io/npm/l/claudius-chat-widget.svg)](https://github.com/PMDevSolutions/Claudius/blob/main/LICENSE)

Embeddable AI chat widget powered by Claude. Drop it into any React app as a
component, or use the standalone script embed on any website.

**Full documentation: [claudius-docs.pages.dev](https://claudius-docs.pages.dev)**

> Claudius is two pieces: a **Cloudflare Worker** that keeps your Anthropic API
> key server-side, and this **widget**. You point the widget at your deployed
> worker via `apiUrl`. See the
> [worker setup guide](https://claudius-docs.pages.dev/deployment/worker/) to
> stand up the backend first.

## Install

```bash
npm install claudius-chat-widget react react-dom
```

`react` and `react-dom` (v18 or v19) are peer dependencies — install them
alongside the widget.

## Usage

```tsx
import { ChatWidget } from "claudius-chat-widget";
import "claudius-chat-widget/style.css";

export function App() {
  return (
    <ChatWidget
      apiUrl="https://claudius-chat-worker.<you>.workers.dev"
      title="Support"
      subtitle="Ask me anything"
      theme="auto"
    />
  );
}
```

Import the stylesheet **once** anywhere in your app (it ships separately so
bundlers can tree-shake the component when unused).

### Common props

| Prop       | Type                 | Required | Description                                  |
| ---------- | -------------------- | -------- | -------------------------------------------- |
| `apiUrl`   | `string`             | Yes      | URL of your deployed Claudius worker.        |
| `title`    | `string`             | No       | Header title shown in the chat window.       |
| `subtitle` | `string`             | No       | Header subtitle / tagline.                   |
| `theme`    | `ClaudiusThemeInput` | No       | `"auto"`, a built-in theme name, or a custom token object. |
| `position` | `WidgetPosition`     | No       | Corner the launcher docks to.                |

The full prop set is exported as the `ChatWidgetProps` type. See the
[configuration docs](https://claudius-docs.pages.dev/configuration/widget/) for
triggers, localization, and theming.

## Exports

- `claudius-chat-widget` — the `ChatWidget` component plus theming, i18n, and the
  typed `ChatApiClient`. Ships dual **ESM** (`import`) and **CommonJS**
  (`require`) builds with TypeScript declarations.
- `claudius-chat-widget/style.css` — the widget stylesheet.
- `claudius-chat-widget/embed` — the prebuilt IIFE bundle for `<script>` usage.

## Standalone script embed (no build step)

Prefer a single `<script>` tag? Use the CDN channel instead of npm:

```html
<script>
  window.ClaudiusConfig = {
    apiUrl: "https://claudius-chat-worker.<you>.workers.dev",
    title: "Support",
  };
</script>
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/gh/PMDevSolutions/Claudius@1/cdn/claudius.css"
/>
<script src="https://cdn.jsdelivr.net/gh/PMDevSolutions/Claudius@1/cdn/claudius.iife.js"></script>
```

## License

MIT © PMDevSolutions. See [LICENSE](./LICENSE).
