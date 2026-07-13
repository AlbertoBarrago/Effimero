import { useState } from "react";
import type { DayStats, Labelled } from "./api.js";

/** Circular gauge in the style of an avionics instrument (270° sweep). */
export function Gauge({ value, max, label, unit }: { value: number; max: number; label: string; unit?: string }) {
  const size = 180;
  const r = 70;
  const cx = size / 2;
  const cy = size / 2;
  const startAngle = 135; // degrees, sweep 270° clockwise
  const sweep = 270;
  const frac = Math.min(value / Math.max(max, 1), 1);

  const arc = (from: number, to: number) => {
    const p = (a: number) => {
      const rad = ((a - 90) * Math.PI) / 180;
      return `${cx + r * Math.cos(rad)},${cy + r * Math.sin(rad)}`;
    };
    const large = to - from > 180 ? 1 : 0;
    return `M ${p(from)} A ${r} ${r} 0 ${large} 1 ${p(to)}`;
  };

  const ticks = Array.from({ length: 11 }, (_, i) => {
    const a = ((startAngle + (sweep * i) / 10 - 90) * Math.PI) / 180;
    const r1 = r + 6;
    const r2 = r + (i % 5 === 0 ? 14 : 10);
    return (
      <line
        key={i}
        x1={cx + r1 * Math.cos(a)}
        y1={cy + r1 * Math.sin(a)}
        x2={cx + r2 * Math.cos(a)}
        y2={cy + r2 * Math.sin(a)}
        stroke="var(--ink-muted)"
        strokeWidth={i % 5 === 0 ? 2 : 1}
      />
    );
  });

  return (
    <div className="instrument gauge">
      <svg width={size} height={size} role="img" aria-label={`${label}: ${value}`}>
        <path d={arc(startAngle, startAngle + sweep)} fill="none" stroke="var(--track)" strokeWidth={8} strokeLinecap="round" />
        {frac > 0 && (
          <path
            d={arc(startAngle, startAngle + sweep * frac)}
            fill="none"
            stroke="var(--series-1)"
            strokeWidth={8}
            strokeLinecap="round"
          />
        )}
        {ticks}
        <text x={cx} y={cy - 4} textAnchor="middle" className="gauge-value">
          {value.toLocaleString()}
        </text>
        <text x={cx} y={cy + 18} textAnchor="middle" className="gauge-unit">
          {unit ?? ""}
        </text>
      </svg>
      <div className="instrument-label">{label}</div>
    </div>
  );
}

/** Digital readout tile, tabular figures like an FMS display. */
export function Readout({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <div className="instrument readout">
      <div className="instrument-label">{label}</div>
      <div className="readout-value">{value}</div>
      {caption && <div className="readout-caption">{caption}</div>}
    </div>
  );
}

/** Annunciator light: green when ok, red when failed. */
export function Annunciator({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className={`annunciator ${ok ? "ok" : "fail"}`} role="status" aria-label={`${label}: ${ok ? "ok" : "fail"}`}>
      <span className="lamp" />
      {label}
    </div>
  );
}

/** Daily uniques + pageviews, two series on one shared count axis. */
export function TimeSeries({ days }: { days: DayStats[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 640;
  const h = 200;
  const pad = { top: 12, right: 8, bottom: 24, left: 40 };
  const iw = w - pad.left - pad.right;
  const ih = h - pad.top - pad.bottom;
  const max = Math.max(...days.map((d) => Math.max(d.uniques, d.pageviews)), 1);
  const bw = iw / days.length;

  const y = (v: number) => pad.top + ih - (v / max) * ih;
  const lineD = days
    .map((d, i) => `${i === 0 ? "M" : "L"}${pad.left + bw * i + bw / 2},${y(d.pageviews)}`)
    .join(" ");

  return (
    <div className="instrument wide">
      <div className="panel-head">
        <div className="instrument-label">Traffic — last {days.length} days</div>
        <div className="legend">
          <span><i className="swatch s1" /> uniques</span>
          <span><i className="swatch s2" /> pageviews</span>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label="Daily unique visitors and pageviews"
        onMouseLeave={() => setHover(null)}
      >
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={pad.left} x2={w - pad.right} y1={y(max * f)} y2={y(max * f)} className="grid" />
            <text x={pad.left - 6} y={y(max * f) + 3} textAnchor="end" className="tick">
              {Math.round(max * f)}
            </text>
          </g>
        ))}
        {days.map((d, i) => (
          <g key={d.day} onMouseEnter={() => setHover(i)}>
            {/* invisible hit target wider than the bar */}
            <rect x={pad.left + bw * i} y={pad.top} width={bw} height={ih} fill="transparent" />
            <rect
              x={pad.left + bw * i + bw * 0.2}
              y={y(d.uniques)}
              width={bw * 0.6}
              height={pad.top + ih - y(d.uniques)}
              rx={2}
              fill="var(--series-1)"
              opacity={hover === null || hover === i ? 1 : 0.45}
            />
          </g>
        ))}
        <path d={lineD} fill="none" stroke="var(--series-2)" strokeWidth={2} />
        {hover !== null && days[hover] && (
          <g className="tooltip" transform={`translate(${Math.min(pad.left + bw * hover, w - 150)},${pad.top})`}>
            <rect width={140} height={52} rx={4} />
            <text x={8} y={16}>{days[hover].day}</text>
            <text x={8} y={31}>uniques   {days[hover].uniques.toLocaleString()}</text>
            <text x={8} y={46}>pageviews {days[hover].pageviews.toLocaleString()}</text>
          </g>
        )}
        <text x={pad.left} y={h - 6} className="tick">{days[0]?.day}</text>
        <text x={w - pad.right} y={h - 6} textAnchor="end" className="tick">{days[days.length - 1]?.day}</text>
      </svg>
    </div>
  );
}

/** 24h histogram of pageviews (UTC). */
export function HourHistogram({ hours }: { hours: number[] }) {
  const max = Math.max(...hours, 1);
  return (
    <div className="instrument wide">
      <div className="instrument-label">Pageviews by hour (UTC)</div>
      <div className="hour-bars">
        {hours.map((v, h) => (
          <div key={h} className="hour-col" title={`${String(h).padStart(2, "0")}:00 — ${v} pageviews`}>
            <div className="hour-bar" style={{ height: `${(v / max) * 100}%` }} />
            {h % 6 === 0 && <span className="tick">{String(h).padStart(2, "0")}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Horizontal bar list for a dimension (browser, OS, country, …). */
export function BarList({ title, rows }: { title: string; rows: Labelled[] }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="instrument">
      <div className="instrument-label">{title}</div>
      {rows.length === 0 && <div className="empty">no data</div>}
      {rows.map((r) => (
        <div key={r.label} className="bar-row" title={`${r.label}: ${r.count.toLocaleString()}`}>
          <span className="bar-label">{r.label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(r.count / max) * 100}%` }} />
          </span>
          <span className="bar-count">{r.count.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
