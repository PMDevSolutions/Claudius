export interface AnalyticsEvent {
  conversationId?: string;
  messageCount: number;
  lastUserMsgLength: number;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  statusCode: number;
  errorCode?: string;
}

const INSERT_SQL = `
  INSERT INTO events (
    ts,
    conversation_id,
    message_count,
    last_user_msg_length,
    model,
    input_tokens,
    output_tokens,
    latency_ms,
    status_code,
    error_code
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export async function recordEvent(
  db: D1Database | undefined,
  event: AnalyticsEvent,
): Promise<void> {
  if (!db) return;

  try {
    await db
      .prepare(INSERT_SQL)
      .bind(
        Date.now(),
        event.conversationId ?? null,
        event.messageCount,
        event.lastUserMsgLength,
        event.model ?? null,
        event.inputTokens ?? null,
        event.outputTokens ?? null,
        event.latencyMs,
        event.statusCode,
        event.errorCode ?? null,
      )
      .run();
  } catch (err) {
    console.error("analytics: failed to record event", err);
  }
}
