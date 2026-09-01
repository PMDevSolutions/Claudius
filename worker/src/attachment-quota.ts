/**
 * Daily upload-byte quotas backed by Workers KV, enforced per client IP and
 * per tenant. Counters are keyed by UTC date and expire on their own, mirroring
 * the fixed-window approach in `rate-limit.ts`.
 */

export const DEFAULT_IP_BYTES_PER_DAY = 50 * 1024 * 1024;
export const DEFAULT_TENANT_BYTES_PER_DAY = 500 * 1024 * 1024;
const DAY_SECONDS = 86400;

export interface AttachmentQuotaConfig {
  /** Bytes per IP per UTC day; 0 disables the check. */
  ipBytesPerDay: number;
  /** Bytes per tenant per UTC day; 0 disables the check. */
  tenantBytesPerDay: number;
}

export interface AttachmentQuotaResult {
  allowed: boolean;
  scope?: "ip" | "tenant";
  /** Seconds until the UTC day rolls over. */
  retryAfter?: number;
}

interface QuotaEnv {
  ATTACHMENT_QUOTA_IP_BYTES?: string;
  ATTACHMENT_QUOTA_TENANT_BYTES?: string;
}

function intFromEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function quotaConfigFromEnv(env: QuotaEnv): AttachmentQuotaConfig {
  return {
    ipBytesPerDay: intFromEnv(
      env.ATTACHMENT_QUOTA_IP_BYTES,
      DEFAULT_IP_BYTES_PER_DAY
    ),
    tenantBytesPerDay: intFromEnv(
      env.ATTACHMENT_QUOTA_TENANT_BYTES,
      DEFAULT_TENANT_BYTES_PER_DAY
    ),
  };
}

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function secondsUntilUtcMidnight(now: number): number {
  const d = new Date(now);
  const next = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + 1
  );
  return Math.max(1, Math.ceil((next - now) / 1000));
}

/**
 * Check whether `bytes` of new uploads fit under both daily quotas, and if so
 * record them. Rejects when either counter would exceed its cap.
 */
export async function checkAttachmentQuota(
  kv: KVNamespace,
  usage: { ip: string; tenant: string; bytes: number },
  config: AttachmentQuotaConfig,
  now: number = Date.now()
): Promise<AttachmentQuotaResult> {
  if (usage.bytes <= 0) return { allowed: true };

  const day = utcDay(now);
  const ipKey = `attq:ip:${usage.ip}:${day}`;
  const tenantKey = `attq:tenant:${usage.tenant}:${day}`;
  const checkIp = config.ipBytesPerDay > 0;
  const checkTenant = config.tenantBytesPerDay > 0;

  const [ipUsed, tenantUsed] = await Promise.all([
    checkIp ? kv.get(ipKey).then((v) => parseInt(v || "0", 10)) : 0,
    checkTenant ? kv.get(tenantKey).then((v) => parseInt(v || "0", 10)) : 0,
  ]);

  const retryAfter = secondsUntilUtcMidnight(now);
  if (checkIp && ipUsed + usage.bytes > config.ipBytesPerDay) {
    return { allowed: false, scope: "ip", retryAfter };
  }
  if (checkTenant && tenantUsed + usage.bytes > config.tenantBytesPerDay) {
    return { allowed: false, scope: "tenant", retryAfter };
  }

  const writes: Promise<void>[] = [];
  if (checkIp) {
    writes.push(
      kv.put(ipKey, String(ipUsed + usage.bytes), {
        expirationTtl: DAY_SECONDS,
      })
    );
  }
  if (checkTenant) {
    writes.push(
      kv.put(tenantKey, String(tenantUsed + usage.bytes), {
        expirationTtl: DAY_SECONDS,
      })
    );
  }
  await Promise.all(writes);

  return { allowed: true };
}
