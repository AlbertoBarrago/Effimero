import { useEffect, useState } from "react";
import { fetchStats, fetchLive, fetchHealth, type SiteStats } from "./api.js";
import { Gauge, Readout, Annunciator, TimeSeries, HourHistogram, BarList } from "./components.js";

const LIVE_POLL_MS = 5000;
const STATS_POLL_MS = 30000;

export function App() {
  const [siteId, setSiteId] = useState("my-site");
  const [range, setRange] = useState(30);
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [live, setLive] = useState(0);
  const [health, setHealth] = useState<{ api: boolean; redis: boolean }>({ api: false, redis: false });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      fetchStats(siteId, range, controller.signal)
        .then((s) => { setStats(s); setError(null); })
        .catch((e: unknown) => {
          if (!(e instanceof DOMException && e.name === "AbortError")) setError(String(e));
        });
    load();
    const id = setInterval(load, STATS_POLL_MS);
    return () => { controller.abort(); clearInterval(id); };
  }, [siteId, range]);

  useEffect(() => {
    const controller = new AbortController();
    const poll = () => {
      fetchLive(siteId, controller.signal).then(setLive).catch(() => {});
      fetchHealth(controller.signal)
        .then((h) => setHealth({ api: true, redis: h.redis }))
        .catch(() => setHealth({ api: false, redis: false }));
    };
    poll();
    const id = setInterval(poll, LIVE_POLL_MS);
    return () => { controller.abort(); clearInterval(id); };
  }, [siteId]);

  const totals = stats?.totals;

  return (
    <main className="cockpit">
      <header>
        <h1>EFFIMERO <span className="sub">FLIGHT DECK</span></h1>
        <div className="controls">
          <input value={siteId} onChange={(e) => setSiteId(e.target.value)} aria-label="Site ID" spellCheck={false} />
          <select value={range} onChange={(e) => setRange(Number(e.target.value))} aria-label="Range">
            <option value={7}>7 D</option>
            <option value={30}>30 D</option>
            <option value={90}>90 D</option>
          </select>
          <div className="annunciators">
            <Annunciator label="API" ok={health.api} />
            <Annunciator label="REDIS" ok={health.redis} />
            <Annunciator label="DATA" ok={!!stats && !error} />
          </div>
        </div>
      </header>

      {error && <p role="alert" className="alert">SENSOR FAULT — {error}</p>}

      <section className="row primary">
        <Gauge value={live} max={Math.max(live, 10)} label="Live visitors (5 min)" unit="LIVE" />
        <Readout label="Uniques (range)" value={(totals?.uniques ?? 0).toLocaleString()} caption="daily-salted, merged HLL" />
        <Readout label="Pageviews" value={(totals?.pageviews ?? 0).toLocaleString()} />
        <Readout label="Pages / visitor" value={(totals?.pagesPerVisitor ?? 0).toFixed(2)} />
        <Readout label="Today uniques" value={(stats?.days.at(-1)?.uniques ?? 0).toLocaleString()} />
      </section>

      {stats && (
        <>
          <section className="row">
            <TimeSeries days={stats.days} />
            <HourHistogram hours={stats.hours} />
          </section>

          <section className="grid">
            <BarList title="Top pages" rows={stats.topPaths.map((p) => ({ label: p.path, count: p.count }))} />
            <BarList title="Referrers" rows={stats.topReferrers.map((r) => ({ label: r.referrer, count: r.count }))} />
            <BarList title="Browsers" rows={stats.browsers} />
            <BarList title="Operating systems" rows={stats.os} />
            <BarList title="Devices" rows={stats.devices} />
            <BarList title="Languages" rows={stats.languages} />
            <BarList title="Countries" rows={stats.countries} />
          </section>
        </>
      )}

      <footer>
        NO COOKIES · NO STORAGE · NO FINGERPRINTING — visitor identity = SHA-256(IP | UA | daily salt), never stored
      </footer>
    </main>
  );
}
