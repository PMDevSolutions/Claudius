-- Analytics event log. Metadata-only: no message contents are stored.
-- Phase 1 of the admin dashboard work (issue #19).

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,                       -- ms since epoch
  conversation_id TEXT,                      -- opaque client-supplied id, optional
  message_count INTEGER NOT NULL,            -- messages in the request
  last_user_msg_length INTEGER,              -- characters in the most recent user message
  model TEXT,                                -- claude model used
  input_tokens INTEGER,                      -- from Anthropic response.usage
  output_tokens INTEGER,                     -- from Anthropic response.usage
  latency_ms INTEGER NOT NULL,               -- wall-clock duration of the request
  status_code INTEGER NOT NULL,              -- HTTP status returned to client
  error_code TEXT                            -- error code (e.g. RATE_LIMITED, SERVICE_ERROR) if not 2xx
);

CREATE INDEX IF NOT EXISTS idx_events_ts ON events (ts);
CREATE INDEX IF NOT EXISTS idx_events_status_code ON events (status_code);
CREATE INDEX IF NOT EXISTS idx_events_conversation_id ON events (conversation_id);
