import { useEffect, useState } from "react";

interface DayStats {
  day: string;
  uniques: number;
  pageviews: number;
}

interface SiteStats {
  days: DayStats[];
  topPaths: Array<{ path: string; count: number }>;
  topReferrers: Array<{ referrer: string; count: number }>;
}

export function App() {
  const [siteId, setSiteId] = useState("my-site");
  const [range, setRange] = useState(30);
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/stats/${encodeURIComponent(siteId)}?range=${range}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<SiteStats>;
      })
      .then((data) => {
        setStats(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError(String(err));
        }
      });
    return () => controller.abort();
  }, [siteId, range]);

  const totalUniques = stats?.days.reduce((sum, d) => sum + d.uniques, 0) ?? 0;
  const totalPageviews = stats?.days.reduce((sum, d) => sum + d.pageviews, 0) ?? 0;

  return (
    <main>
      <h1>Margin</h1>
      <div className="controls">
        <input
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          placeholder="site id"
          aria-label="Site ID"
        />
        <select value={range} onChange={(e) => setRange(Number(e.target.value))} aria-label="Range">
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {error && <p role="alert">Failed to load stats: {error}</p>}

      {stats && (
        <>
          <div className="kpis">
            <div className="kpi">
              <div className="label">Unique visitors (sum of daily)</div>
              <div className="value">{totalUniques.toLocaleString()}</div>
            </div>
            <div className="kpi">
              <div className="label">Pageviews</div>
              <div className="value">{totalPageviews.toLocaleString()}</div>
            </div>
          </div>

          <div className="chart">
            <BarChart days={stats.days} />
          </div>

          <div className="tables">
            <TopTable title="Top pages" rows={stats.topPaths.map((p) => [p.path, p.count])} />
            <TopTable
              title="Top referrers"
              rows={stats.topReferrers.map((r) => [r.referrer, r.count])}
            />
          </div>
        </>
      )}
    </main>
  );
}

function BarChart({ days }: { days: DayStats[] }) {
  const width = Math.max(days.length * 24, 300);
  const height = 160;
  const max = Math.max(...days.map((d) => d.uniques), 1);

  return (
    <svg width={width} height={height + 20} role="img" aria-label="Unique visitors per day">
      {days.map((d, i) => {
        const barHeight = (d.uniques / max) * height;
        return (
          <g key={d.day}>
            <rect
              x={i * 24 + 4}
              y={height - barHeight}
              width={16}
              height={barHeight}
              rx={2}
              fill="#6366f1"
            >
              <title>{`${d.day}: ${d.uniques} uniques, ${d.pageviews} pageviews`}</title>
            </rect>
          </g>
        );
      })}
    </svg>
  );
}

function TopTable({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  return (
    <div>
      <h2>{title}</h2>
      <table>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={2}>No data</td>
            </tr>
          )}
          {rows.map(([label, count]) => (
            <tr key={label}>
              <td>{label}</td>
              <td className="num">{count.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
