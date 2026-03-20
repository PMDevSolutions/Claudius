const MINUTE_LIMIT = 10;
const HOUR_LIMIT = 50;
const MINUTE_TTL = 60;
const HOUR_TTL = 3600;

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

export async function checkRateLimit(
  kv: KVNamespace,
  ip: string
): Promise<RateLimitResult> {
  const minuteKey = `rate:min:${ip}`;
  const hourKey = `rate:hr:${ip}`;

  const [minuteCount, hourCount] = await Promise.all([
    kv.get(minuteKey).then((v) => parseInt(v || "0", 10)),
    kv.get(hourKey).then((v) => parseInt(v || "0", 10)),
  ]);

  if (minuteCount >= MINUTE_LIMIT) {
    return { allowed: false, retryAfter: MINUTE_TTL };
  }

  if (hourCount >= HOUR_LIMIT) {
    return { allowed: false, retryAfter: HOUR_TTL };
  }

  await Promise.all([
    kv.put(minuteKey, String(minuteCount + 1), { expirationTtl: MINUTE_TTL }),
    kv.put(hourKey, String(hourCount + 1), { expirationTtl: HOUR_TTL }),
  ]);

  return { allowed: true };
}
