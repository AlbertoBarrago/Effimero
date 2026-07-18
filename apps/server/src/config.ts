function readInteger(name: string, fallback: number, minimum: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}`);
  }
  return value;
}

export const config = {
  port: readInteger("PORT", 3000, 1),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  /** Comma-separated list of allowed origins for CORS; "*" allows any origin. */
  allowedOrigins: process.env.ALLOWED_ORIGINS ?? "*",
  /** Trust X-Forwarded-For header (enable when running behind a reverse proxy). */
  trustProxy: process.env.TRUST_PROXY === "true",
  /** Retention window (in days) for daily stats keys in Redis. */
  retentionDays: readInteger("RETENTION_DAYS", 90, 1),
  /** Max distinct path values tracked per site per day; extras fold into "__other__". */
  maxDistinctPaths: readInteger("MAX_DISTINCT_PATHS", 2000, 0),
  /** Max distinct referrer values tracked per site per day; extras fold into "__other__". */
  maxDistinctReferrers: readInteger("MAX_DISTINCT_REFERRERS", 2000, 0),
  /** Max /collect hits per client IP per window. 0 disables rate limiting. */
  collectRateLimit: readInteger("COLLECT_RATE_LIMIT", 120, 0),
  /** Rate-limit window length in seconds. */
  collectRateWindowSeconds: readInteger("COLLECT_RATE_WINDOW", 60, 1),
};
