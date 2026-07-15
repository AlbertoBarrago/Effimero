/**
 * Per-site Origin enforcement for ingest.
 *
 * The snippet sends hits as a CORS "simple request" (text/plain, no preflight),
 * so CORS response headers cannot stop a hit from being recorded — only reading
 * the response, which the beacon ignores. Origin allow-listing must therefore
 * happen server-side, here, against each site's configured origins.
 */

/** Lowercases and strips a trailing slash so origins compare canonically. */
export function normalizeOrigin(origin: string): string {
  return origin.trim().toLowerCase().replace(/\/+$/, "");
}

/**
 * Decides whether a request Origin may record hits for a site.
 *
 * - An empty allow-list means "any origin" (backwards-compatible default).
 * - A non-empty allow-list requires an Origin header that matches one entry.
 *   A missing Origin is rejected: it cannot be verified.
 */
export function isOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (allowedOrigins.length === 0) return true;
  if (!origin) return false;
  const candidate = normalizeOrigin(origin);
  return allowedOrigins.some((allowed) => normalizeOrigin(allowed) === candidate);
}
