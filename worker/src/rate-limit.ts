const DEFAULT_MINUTE_LIMIT = 10;
const DEFAULT_HOUR_LIMIT = 50;
const MINUTE_TTL = 60;
const HOUR_TTL = 3600;

export interface RateLimitConfig {
  minuteLimit?: number;
  hourLimit?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
  limitType?: "minute" | "hour";
}

export async function checkRateLimit(
  kv: KVNamespace,
  ip: string,
  config: RateLimitConfig = {}
): Promise<RateLimitResult> {
  const minuteLimit = config.minuteLimit ?? DEFAULT_MINUTE_LIMIT;
  const hourLimit = config.hourLimit ?? DEFAULT_HOUR_LIMIT;

  const minuteKey = `rate:min:${ip}`;
  const hourKey = `rate:hr:${ip}`;

  const [minuteCount, hourCount] = await Promise.all([
    kv.get(minuteKey).then((v) => parseInt(v || "0", 10)),
    kv.get(hourKey).then((v) => parseInt(v || "0", 10)),
  ]);

  if (minuteCount >= minuteLimit) {
    return { allowed: false, retryAfter: MINUTE_TTL, limitType: "minute" };
  }

  if (hourCount >= hourLimit) {
    return { allowed: false, retryAfter: HOUR_TTL, limitType: "hour" };
  }

  await Promise.all([
    kv.put(minuteKey, String(minuteCount + 1), { expirationTtl: MINUTE_TTL }),
    kv.put(hourKey, String(hourCount + 1), { expirationTtl: HOUR_TTL }),
  ]);

  return { allowed: true };
}
