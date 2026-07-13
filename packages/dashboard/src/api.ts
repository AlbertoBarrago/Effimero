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

export async function fetchStats(siteId: string, range: number, signal?: AbortSignal): Promise<SiteStats> {
  const res = await fetch(`/stats/${encodeURIComponent(siteId)}?range=${range}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchLive(siteId: string, signal?: AbortSignal): Promise<number> {
  const res = await fetch(`/live/${encodeURIComponent(siteId)}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).live;
}

export async function fetchHealth(signal?: AbortSignal): Promise<{ status: string; redis: boolean }> {
  const res = await fetch("/health", { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
