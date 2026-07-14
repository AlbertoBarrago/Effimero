export interface DayStats {
  day: string;
  uniques: number;
  pageviews: number;
}

export interface Labelled {
  label: string;
  count: number;
}

export interface SiteStats {
  days: DayStats[];
  totals: { uniques: number; pageviews: number; pagesPerVisitor: number };
  topPaths: Array<{ path: string; count: number }>;
  topReferrers: Array<{ referrer: string; count: number }>;
  hours: number[];
  browsers: Labelled[];
  os: Labelled[];
  devices: Labelled[];
  languages: Labelled[];
  countries: Labelled[];
}

/**
 * Access key for the read endpoints, kept in sessionStorage: this is the
 * operator authenticating, not a tracked visitor, and it dies with the tab.
 */
const KEY_STORAGE = "effimero-access-key";

export function getAccessKey(): string {
  return sessionStorage.getItem(KEY_STORAGE) ?? "";
}

export function setAccessKey(key: string): void {
  if (key) sessionStorage.setItem(KEY_STORAGE, key);
  else sessionStorage.removeItem(KEY_STORAGE);
}

export class UnauthorizedError extends Error {
  constructor() {
    super("HTTP 401");
  }
}

function authHeaders(): HeadersInit {
  const key = getAccessKey();
  return key ? { Authorization: `Bearer ${key}` } : {};
}

async function authedJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, headers: authHeaders() });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchStats(siteId: string, range: number, signal?: AbortSignal): Promise<SiteStats> {
  return authedJson(`/stats/${encodeURIComponent(siteId)}?range=${range}`, signal);
}

export async function fetchLive(siteId: string, signal?: AbortSignal): Promise<number> {
  const data = await authedJson<{ live: number }>(`/live/${encodeURIComponent(siteId)}`, signal);
  return data.live;
}

export async function fetchSites(signal?: AbortSignal): Promise<string[]> {
  const data = await authedJson<{ sites: string[] }>("/sites", signal);
  return data.sites;
}

export async function fetchHealth(signal?: AbortSignal): Promise<{ status: string; redis: boolean }> {
  const res = await fetch("/health", { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
