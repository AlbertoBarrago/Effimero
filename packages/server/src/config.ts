export const config = {
  port: Number(process.env.PORT ?? 3000),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  /** Comma-separated list of allowed origins for CORS; "*" allows any origin. */
  allowedOrigins: process.env.ALLOWED_ORIGINS ?? "*",
  /** Trust X-Forwarded-For header (enable when running behind a reverse proxy). */
  trustProxy: process.env.TRUST_PROXY === "true",
  /** Retention window (in days) for daily stats keys in Redis. */
  retentionDays: Number(process.env.RETENTION_DAYS ?? 90),
};
