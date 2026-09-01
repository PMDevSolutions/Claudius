---
title: REST API
description: The worker's HTTP endpoints — request/response shapes, error codes, and rate limiting.
sidebar:
  order: 1
---

Base URL: your deployed worker, e.g.
`https://claudius-chat-worker.<you>.workers.dev`. CORS restricts callers to
the configured [`ALLOWED_ORIGIN`](/configuration/worker/) list (plus
`http://localhost:*`). Allowed methods: `GET`, `POST`, `OPTIONS`;
allowed header: `Content-Type`.

## POST /api/chat

Send the conversation so far; receive the assistant's reply.

### Request

```json
{
  "messages": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi there!" },
    { "role": "user", "content": "What are your hours?" }
  ],
  "conversationId": "optional-opaque-id"
}
```

| Field | Type | Notes |
|-------|------|-------|
| `messages` | array, required | Full conversation history, oldest first. Max **100** messages; each `content` is truncated to **2,000** characters |
| `messages[].role` | `"user" \| "assistant"` | Other roles are rejected |
| `messages[].content` | string | May be empty only when the message has attachments |
| `messages[].attachments` | array, optional | Files on a **user** message; see below |
| `conversationId` | string, optional | Opaque id used only for [analytics](/deployment/worker/#analytics-with-d1-optional) correlation |

#### Attachments

Each entry in `messages[].attachments` is:

```json
{
  "id": "att-1",
  "name": "receipt.png",
  "mediaType": "image/png",
  "size": 48213,
  "data": "<base64, optional>",
  "key": "att/<tenant>/<uuid>  (optional)"
}
```

| Field | Notes |
|-------|-------|
| `id` | Client-generated, `[A-Za-z0-9_-]{1,64}`, unique per request. Names the multipart file part |
| `name` | Filename; shown to the model as the document title |
| `mediaType` | Must be on the worker's allowlist **and** match the file's leading bytes |
| `size` | Bytes. Recomputed server-side whenever bytes are present |
| `data` | Inline base64 (no `data:` prefix). Omit when sending multipart or referencing a stored file |
| `key` | Storage key returned by a previous response (R2 mode). The worker loads the file itself |

An attachment with neither `data` nor `key` (or whose stored copy expired) is
described to the model as "no longer available" rather than failing the
request. Attachments are forwarded to Claude as `image` blocks (JPEG, PNG,
GIF, WebP) or `document` blocks (PDF), placed before the message text.

#### Multipart requests

To avoid base64 overhead, send `multipart/form-data` instead of JSON:

- a `payload` text field containing the JSON body above, with attachment
  entries **without** `data`;
- one file part per new upload, whose field name is the attachment `id`.

```bash
curl https://<worker>/api/chat \
  -F 'payload={"messages":[{"role":"user","content":"What is the total?","attachments":[{"id":"f1","name":"receipt.png","mediaType":"image/png","size":48213}]}]}' \
  -F 'f1=@receipt.png;type=image/png'
```

Stray file parts that match no attachment are rejected. The widget's client
switches to multipart automatically whenever a message carries inline bytes.

### Response `200`

```json
{
  "reply": "We're available Monday through Friday, 9am to 5pm.",
  "sources": [
    { "url": "https://example.com/contact", "title": "Contact", "type": "page" }
  ],
  "attachments": [
    {
      "id": "att-1",
      "key": "att/example.com/6f1c…",
      "url": "https://<worker>/api/attachments/att/example.com/6f1c…?exp=1750000000&sig=…",
      "expiresAt": "2026-06-16T12:00:00.000Z"
    }
  ]
}
```

`sources` is optional and reserved for retrieval-backed backends — the
bundled worker returns only `reply` today (see [RAG](/rag/)).

`attachments` is present only when the worker's
[R2 storage backend](/configuration/attachments/#r2) stored new uploads
during this request. Reference `key` on later turns instead of re-sending the
bytes; `url` is an HMAC-signed download link valid until `expiresAt`.

### Errors

All errors share one envelope:

```json
{ "error": "Human-readable message", "code": "MACHINE_CODE", "limitType": "minute" }
```

| Status | `code` | When | Extra |
|--------|--------|------|-------|
| `400` | `VALIDATION_ERROR` | Empty/missing `messages`, more than 100 messages, invalid role, message with neither text nor attachments | |
| `400` | `ATTACHMENTS_DISABLED` | Request carried attachments but `ATTACHMENTS_ENABLED=false` | |
| `400` | `ATTACHMENT_INVALID` | Disallowed or mismatched type, too many files, malformed id/key, or Claude could not process the file | |
| `413` | `ATTACHMENT_TOO_LARGE` | File over `ATTACHMENT_MAX_BYTES`, or this message's uploads over `ATTACHMENT_MAX_REQUEST_BYTES` | |
| `413` | `ATTACHMENT_QUOTA_EXCEEDED` | Daily per-IP or per-tenant upload quota reached | `Retry-After` header (seconds to next UTC midnight) |
| `429` | `RATE_LIMITED` | Per-IP limit exceeded (default 10/min, 50/hr) | `Retry-After` header (seconds); `limitType`: `"minute"` or `"hour"` |
| `500` | `CONFIG_ERROR` | Worker misconfiguration (e.g. bad API key, R2 mode without bucket/secret) | |
| `503` | `SERVICE_ERROR` | Claude temporarily unavailable/overloaded | |
| `500` | `UNKNOWN_ERROR` | Anything else | |

## GET /api/attachments/{key}

Serves a stored attachment (R2 mode only). The full URL, including the `exp`
and `sig` query parameters, comes from a chat response's `attachments[].url`;
it cannot be constructed by hand.

| Status | When |
|--------|------|
| `200` | Bytes with the original `Content-Type`, `Content-Disposition: inline`, and `Cache-Control: private` |
| `403` | Signature invalid or link expired |
| `404` | Unknown key, object expired/deleted, or storage is passthrough |

## GET /api/health

```json
{ "ok": true }
```

Use for uptime checks; it does not call Claude.

## Client retry behavior

The widget's built-in API client retries up to 2 times (3 attempts total):
`429` waits for the server's `Retry-After`; `503` backs off exponentially
(1 s, then 3 s). Sends are debounced (300 ms default). If you build your own
client, mirroring this behavior plays well with the worker's limits.
