---
title: REST API
description: The worker's HTTP endpoints — request/response shapes, error codes,
  and rate limiting.
sidebar:
  order: 1
slug: 1.x/api/rest
---

Base URL: your deployed worker, e.g.
`https://claudius-chat-worker.<you>.workers.dev`. CORS restricts callers to
the configured [`ALLOWED_ORIGIN`](/1.x/configuration/worker/) list (plus
`http://localhost:*`). Allowed methods: `POST`, `OPTIONS`;
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
| `conversationId` | string, optional | Opaque id used only for [analytics](/1.x/deployment/worker/#analytics-with-d1-optional) correlation |

### Response `200`

```json
{
  "reply": "We're available Monday through Friday, 9am to 5pm.",
  "sources": [
    { "url": "https://example.com/contact", "title": "Contact", "type": "page" }
  ]
}
```

`sources` is optional and reserved for retrieval-backed backends — the
bundled worker returns only `reply` today (see [RAG](/1.x/rag/)).

### Errors

All errors share one envelope:

```json
{ "error": "Human-readable message", "code": "MACHINE_CODE", "limitType": "minute" }
```

| Status | `code` | When | Extra |
|--------|--------|------|-------|
| `400` | `VALIDATION_ERROR` | Empty/missing `messages`, more than 100 messages, invalid role | |
| `429` | `RATE_LIMITED` | Per-IP limit exceeded (default 10/min, 50/hr) | `Retry-After` header (seconds); `limitType`: `"minute"` or `"hour"` |
| `500` | `CONFIG_ERROR` | Worker misconfiguration (e.g. bad API key) | |
| `503` | `SERVICE_ERROR` | Claude temporarily unavailable/overloaded | |
| `500` | `UNKNOWN_ERROR` | Anything else | |

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
