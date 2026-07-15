export const config = {
  port: Number(process.env.PORT ?? 3000),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  /** Comma-separated list of allowed origins for CORS; "*" allows any origin. */
  allowedOrigins: process.env.ALLOWED_ORIGINS ?? "*",
  /** Trust X-Forwarded-For header (enable when running behind a reverse proxy). */
  trustProxy: process.env.TRUST_PROXY === "true",
  /** Retention window (in days) for daily stats keys in Redis. */
  retentionDays: Number(process.env.RETENTION_DAYS ?? 90),
  /** Max distinct path values tracked per site per day; extras fold into "__other__". */
  maxDistinctPaths: Number(process.env.MAX_DISTINCT_PATHS ?? 2000),
  /** Max distinct referrer values tracked per site per day; extras fold into "__other__". */
  maxDistinctReferrers: Number(process.env.MAX_DISTINCT_REFERRERS ?? 2000),
  /** Max /collect hits per client IP per window. 0 disables rate limiting. */
  collectRateLimit: Number(process.env.COLLECT_RATE_LIMIT ?? 120),
  /** Rate-limit window length in seconds. */
  collectRateWindowSeconds: Number(process.env.COLLECT_RATE_WINDOW ?? 60),
};
