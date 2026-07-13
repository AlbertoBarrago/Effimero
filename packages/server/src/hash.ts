import { createHash } from "node:crypto";

/**
 * Computes the daily visitor hash: SHA-256(ip | userAgent | dailySalt | siteId).
 *
 * The raw IP is used only here, in memory, and never stored. Because the salt
 * rotates daily, the same visitor produces unrelated hashes on different days,
 * making long-term tracking impossible by construction.
 */
export function visitorHash(ip: string, userAgent: string, dailySalt: string, siteId: string): string {
  return createHash("sha256")
    .update(`${ip}|${userAgent}|${dailySalt}|${siteId}`)
    .digest("hex");
}
