import { UAParser } from "ua-parser-js";
import geoip from "geoip-lite";

/**
 * Aggregate-safe dimensions derived from a request. Each value is a coarse
 * bucket (browser family, country code, …) — never the raw UA or IP — so
 * storing counters per value cannot re-identify a visitor.
 */
export interface Dimensions {
  browser: string;
  os: string;
  /** "desktop" | "mobile" | "tablet" | "other" */
  device: string;
  /** Primary language subtag from Accept-Language, e.g. "it". */
  language: string;
  /** ISO 3166-1 alpha-2 country code from GeoIP, or "unknown". */
  country: string;
}

export function deriveDimensions(ip: string, userAgent: string, acceptLanguage: string | undefined): Dimensions {
  const ua = UAParser(userAgent);

  return {
    browser: ua.browser.name ?? "unknown",
    os: ua.os.name ?? "unknown",
    device: deviceBucket(ua.device.type),
    language: primaryLanguage(acceptLanguage),
    country: geoip.lookup(ip)?.country ?? "unknown",
  };
}

function deviceBucket(type: string | undefined): string {
  // ua-parser-js leaves type undefined for desktop browsers.
  if (!type) return "desktop";
  if (type === "mobile" || type === "tablet") return type;
  return "other";
}

function primaryLanguage(header: string | undefined): string {
  const first = header?.split(",")[0]?.split(";")[0]?.trim().toLowerCase();
  if (!first || first === "*") return "unknown";
  return first.split("-")[0] ?? "unknown";
}
