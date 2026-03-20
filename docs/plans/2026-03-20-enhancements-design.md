# Claudius Enhancements Design

## Priority Order
1. Rate limiting (worker-side, KV-based)
2. Conversation persistence (localStorage)
3. Theming system (light/dark/auto, accentColor)
4. Streaming responses (future)

---

## Feature 1: Rate Limiting

**Approach:** KV-based counters per client IP with TTL expiry.

**Limits:** 10 requests/minute, 50 requests/hour per IP.

**KV key structure:**
- `rate:min:{ip}` -- incremented per request, 60s TTL
- `rate:hr:{ip}` -- incremented per request, 3600s TTL

**Response when limited:**
```json
{ "error": "Too many requests. Please try again in a moment." }
```
Status 429 with `Retry-After` header.

**Changes:**
- Worker: Add KV namespace binding in wrangler.toml
- Worker: Add rate limit middleware before `/api/chat`
- Widget: No changes (existing error handling displays the message)

---

## Feature 2: Conversation Persistence

**Approach:** Save/restore messages via localStorage in the useChat hook.

**Storage key:** `claudius:messages:{apiUrl-hash}` -- hashed to isolate per-worker instances.

**Behavior:**
- On mount: load messages from localStorage, skip welcome message if messages exist
- On every new message: save to localStorage
- Cap at 200 messages (oldest trimmed)
- `clearMessages()` also clears localStorage

**New config option:** `persistMessages?: boolean` (default `true`)

**Changes:**
- Widget: Update useChat hook with localStorage read/write
- Widget: Update ChatWindow to conditionally show welcome message
- Widget: Add persistMessages prop to ChatWidget and embed.tsx
- Worker: No changes

---

## Feature 3: Theming System

**Approach:** Extend existing CSS custom properties with dark mode and an accentColor shortcut.

**New config options:**
```js
window.ClaudiusConfig = {
  apiUrl: "...",
  theme: "light",         // "light" | "dark" | "auto"
  accentColor: "#2563eb", // override primary color at runtime
};
```

**Dark mode:** `data-claudius-dark` attribute toggled on widget container. "auto" uses `prefers-color-scheme` media query listener. Tailwind dark variant classes handle color swaps.

**accentColor:** Sets `--claudius-primary` on the widget container at runtime.

**Changes:**
- Widget: Add theme/accentColor to config interface and embed.tsx
- Widget: Add dark mode Tailwind classes to all components
- Widget: Add media query listener for "auto" theme
- Worker: No changes
