---
title: Attachments
description: Let visitors attach images and PDFs, and control where those files go.
sidebar:
  order: 7
---

Visitors can attach images (JPEG, PNG, GIF, WebP) and PDFs to a message by
clicking the paperclip, dragging files onto the composer, or pasting from the
clipboard. The worker forwards them to Claude as native `image` / `document`
content blocks, so the model can read a screenshot of an error, a receipt, or
a multi-page PDF.

Attachments are **off in the widget by default** and **on in the worker by
default** (passthrough mode). Enable the widget side to start using them.

## Enable in the widget

```tsx
<ChatWidget apiUrl="https://your-worker.workers.dev" attachments />
```

```html
<script>
  window.ClaudiusConfig = {
    apiUrl: "https://your-worker.workers.dev",
    attachments: true,
  };
</script>
```

```html
<claudius-chat api-url="https://your-worker.workers.dev" attachments></claudius-chat>
```

Pass an object instead of `true` to tune the client-side limits:

| Option | Default | Description |
|--------|---------|-------------|
| `maxSizeBytes` | `5242880` (5 MB) | Largest file the composer accepts |
| `maxCount` | `5` | Files per message |
| `allowedTypes` | JPEG, PNG, GIF, WebP, PDF | Accepted MIME types |

```tsx
<ChatWidget
  apiUrl="…"
  attachments={{ maxSizeBytes: 2 * 1024 * 1024, maxCount: 2, allowedTypes: ["image/png", "image/jpeg"] }}
/>
```

The widget validates type, size, and count before anything is uploaded and
shows an inline message for rejected files. Keep these limits at or below the
worker's so a file the composer accepts is never refused later.

## Worker settings

| Variable | Default | Description |
|----------|---------|-------------|
| `ATTACHMENTS_ENABLED` | `true` | Set to `false` to reject any request carrying attachments (`400 ATTACHMENTS_DISABLED`) |
| `ATTACHMENT_TYPES` | `image/jpeg,image/png,image/gif,image/webp,application/pdf` | Comma-separated allowlist. Only these five are forwarded natively; others are refused |
| `ATTACHMENT_MAX_BYTES` | `5242880` | Per-file cap (5 MB). Larger files return `413 ATTACHMENT_TOO_LARGE` |
| `ATTACHMENT_MAX_COUNT` | `5` | Files per message |
| `ATTACHMENT_MAX_REQUEST_BYTES` | `20971520` | Raw bytes forwarded to Claude per request (20 MB). Older attachments in the history are dropped first to stay under it |
| `ATTACHMENT_QUOTA_IP_BYTES` | `52428800` | Upload bytes per client IP per UTC day (50 MB). `0` disables |
| `ATTACHMENT_QUOTA_TENANT_BYTES` | `524288000` | Upload bytes per tenant per UTC day (500 MB). `0` disables |
| `TENANT_ID` | Origin host | Quota tenant. Defaults to the embedding site's host, so each site in `ALLOWED_ORIGIN` gets its own budget |
| `ATTACHMENT_STORAGE` | `passthrough` | `passthrough` or `r2` (see below) |
| `ATTACHMENT_RETENTION_HOURS` | `24` | R2 only: how long stored files (and their signed URLs) live |
| `ATTACHMENT_SIGNING_SECRET` | — | R2 only: secret used to sign download URLs. Set with `npx wrangler secret put ATTACHMENT_SIGNING_SECRET` |

The worker independently re-validates every attachment: the declared MIME
type must be on the allowlist **and** match the file's leading bytes, the
decoded size is recomputed, and only user messages may carry files.

Quotas use the same KV namespace as rate limiting and count only the new
uploads on the latest message. When a quota is hit the worker returns
`413 ATTACHMENT_QUOTA_EXCEEDED` with a `Retry-After` pointing at the next UTC
midnight.

## Storage backends

### Passthrough (default)

Bytes are base64-encoded, sent to Anthropic inside the chat request, and
discarded. Nothing is written to Cloudflare storage. Because the API is
stateless, the widget keeps the bytes in memory and re-sends them with the
history on every later turn of that session. That costs upload bandwidth and
input tokens for image-heavy conversations, and a page reload loses the bytes
(the model then sees a short "no longer available" note in place of the file).

Good for low-volume support chat where you'd rather not hold visitor files at
all.

### R2

Set `ATTACHMENT_STORAGE=r2`, bind an R2 bucket as `ATTACHMENTS`, and set
`ATTACHMENT_SIGNING_SECRET`:

```bash
cd worker
npx wrangler r2 bucket create claudius-attachments
npx wrangler secret put ATTACHMENT_SIGNING_SECRET
```

```toml
# wrangler.toml
[vars]
ATTACHMENT_STORAGE = "r2"
ATTACHMENT_RETENTION_HOURS = "24"

[[r2_buckets]]
binding = "ATTACHMENTS"
bucket_name = "claudius-attachments"
```

In R2 mode a new upload is written under `att/<tenant>/<uuid>`, forwarded to
Claude, and returned to the widget as a storage `key` plus an HMAC-signed
download URL. Later turns reference the key, so the file is uploaded once per
conversation and previews survive a reload. The worker refuses to serve or
forward an object past its `expiresAt` and deletes it lazily on the next read;
add a bucket lifecycle rule as the hard backstop:

```bash
npx wrangler r2 bucket lifecycle add claudius-attachments --expire-days 2
```

(Pick a value at least as long as `ATTACHMENT_RETENTION_HOURS`.)

## Privacy posture

**Where attachments live**

- *Passthrough:* in the visitor's browser tab for the session, in transit to
  your worker, and in the request to Anthropic. The worker keeps nothing.
- *R2:* additionally in your R2 bucket, under a key that names the tenant
  (embedding site) but not the visitor, for `ATTACHMENT_RETENTION_HOURS`.

**How long**

- Browser: until the tab closes. Persisted history
  (`sessionStorage`) stores filenames, sizes, keys, and signed URLs, never the
  bytes.
- Anthropic: per their [data retention policy](https://privacy.anthropic.com/)
  for API inputs.
- R2: `ATTACHMENT_RETENTION_HOURS` (default 24 h), enforced by the worker and
  by your lifecycle rule.
- KV: quota counters expire after 24 h and hold byte totals only.

**Who can read them**

- Signed URLs grant read access to anyone who holds the link until it expires.
  They appear only in chat responses to the widget that uploaded the file;
  treat them like the conversation itself.
- Storage keys are unguessable UUIDs. A key alone is enough to reference a
  stored file on a later turn from the same worker, which is how follow-up
  questions work.
- Analytics (`ANALYTICS_DB`) never records attachment contents or names.

Cover attachments in your own privacy notice: tell visitors that uploaded
files are sent to Anthropic for processing and, if you use R2, how long you
keep them.

## Limits and errors

| Status | `code` | Meaning |
|--------|--------|---------|
| `400` | `ATTACHMENTS_DISABLED` | `ATTACHMENTS_ENABLED=false` |
| `400` | `ATTACHMENT_INVALID` | Disallowed type, type/bytes mismatch, too many files, malformed reference, or Claude could not process the file |
| `413` | `ATTACHMENT_TOO_LARGE` | A file exceeds `ATTACHMENT_MAX_BYTES`, or the message's uploads exceed `ATTACHMENT_MAX_REQUEST_BYTES` |
| `413` | `ATTACHMENT_QUOTA_EXCEEDED` | Daily per-IP or per-tenant byte quota reached |

The widget shows a localized message for each, removes the rejected message
from the conversation, and does not retry. See the
[REST API reference](/api/rest/) for the wire format.
