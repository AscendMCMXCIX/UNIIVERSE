"use client";

import * as React from "react";
import type { TimelinePoint } from "@/domain/performance-score";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { gameClock } from "./match-format";

/*
  The performance score through the game (domain/performance-score timelineScores): one line for the
  player inspected, and a second, dashed, for the player compared with them, on one 0–10 axis (5 is
  the match's average, drawn as a quiet dashed rule). The points before the end are each scored from
  what had happened by then; the last is the final score, read from the whole record, joined by a
  dotted segment because it reads more figures than the points before it. Drawn at the width it is
  given, in real pixels, its labels in HTML around the drawing (so they follow the reader's text
  size). Hover, touch or the arrow keys show a point's scores; the same figures are in a table for
  screen readers.
*/

export interface ChartSeries {
  slot: number;
  /** The player's name as the scoreboard shows it. */
  label: string;
}

const H = 76;
const PAD = 8;

export function ScoreChart({ points, series }: { points: readonly TimelinePoint[]; series: readonly ChartSeries[] }) {
  const box = React.useRef<HTMLDivElement>(null);
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const [width, setWidth] = React.useState(320);
  const [active, setActive] = React.useState<number | null>(null);
  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(120, Math.round(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const last = points.at(-1)?.minute ?? 1;
  const x = (minute: number) => PAD + (minute / last) * (width - 2 * PAD);
  const y = (score: number) => PAD + (1 - score / 10) * (H - 2 * PAD);
  const lines = series.map((s, k) => {
    const pts = points.flatMap((p, i) => (typeof p.scores[s.slot] === "number" ? [{ i, minute: p.minute, score: p.scores[s.slot]!, final: p.final }] : []));
    const timed = pts.filter((p) => !p.final);
    const end = pts.find((p) => p.final);
    const path = timed.map((p, j) => `${j ? "L" : "M"}${x(p.minute).toFixed(1)} ${y(p.score).toFixed(1)}`).join(" ");
    const tail = timed.length && end ? `M${x(timed.at(-1)!.minute).toFixed(1)} ${y(timed.at(-1)!.score).toFixed(1)} L${x(end.minute).toFixed(1)} ${y(end.score).toFixed(1)}` : "";
    return { s, k, pts, path, tail };
  });
  const pick = (clientX: number) => {
    const el = box.current;
    if (!el) return;
    const left = el.getBoundingClientRect().left;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(p.minute) - (clientX - left)) < Math.abs(x(points[best]!.minute) - (clientX - left))) best = i;
    });
    setActive(best);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      setActive((a) => {
        const from = a ?? (e.key === "ArrowRight" ? -1 : points.length);
        return Math.max(0, Math.min(points.length - 1, from + (e.key === "ArrowRight" ? 1 : -1)));
      });
    } else if (e.key === "Escape") setActive(null);
  };
  const shown = active !== null ? points[active] : null;
  const when = (p: TimelinePoint) => (p.final ? `End (${gameClock(p.minute * 60_000)})` : gameClock(p.minute * 60_000));
  const value = (p: TimelinePoint, slot: number) => (typeof p.scores[slot] === "number" ? formatNumber(p.scores[slot]!, 1) : "—");
  return (
    <div className="relative" data-testid="score-chart" data-points={points.length} data-series={series.length}>
      {/* The readout: the point under the pointer (or the arrow keys), else the legend. */}
      {/* Over the drawing's top right, so it takes no height of its own: the point read, else the legend of two players. */}
      <p className="pointer-events-none absolute right-0 top-0 z-10 flex max-w-[85%] flex-wrap items-center justify-end gap-x-3 rounded-sm bg-surface/90 px-1 text-2xs leading-4 text-fg-muted empty:hidden" aria-live="polite" data-testid="score-chart-readout">
        {shown ? (
          <>
            <span className="font-semibold tabular-nums text-fg">{when(shown)}</span>
            {series.map((s, k) => (
              <span key={s.slot} className="inline-flex items-center gap-1">
                <Swatch k={k} />
                {s.label} <span className="font-semibold tabular-nums text-fg">{value(shown, s.slot)}</span>
              </span>
            ))}
          </>
        ) : series.length > 1 ? (
          series.map((s, k) => (
            <span key={s.slot} className="inline-flex items-center gap-1" data-testid="score-chart-legend">
              <Swatch k={k} />
              {s.label}
            </span>
          ))
        ) : null}
      </p>
      <div className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-1">
        <div className="relative text-2xs tabular-nums leading-none text-fg-subtle" style={{ height: H }} aria-hidden>
          <span className="absolute right-0 -translate-y-1/2" style={{ top: y(10) }}>
            10
          </span>
          <span className="absolute right-0 -translate-y-1/2" style={{ top: y(5) }}>
            5
          </span>
          <span className="absolute right-0 -translate-y-1/2" style={{ top: y(0) }}>
            0
          </span>
        </div>
        <div
          ref={box}
          className="relative rounded-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent"
          tabIndex={0}
          role="img"
          aria-label={`Performance score through the game, ${series.map((s) => s.label).join(" and ")}: the table below holds the figures`}
          onPointerMove={(e) => pick(e.clientX)}
          onPointerDown={(e) => pick(e.clientX)}
          onPointerLeave={(e) => (e.pointerType === "mouse" ? setActive(null) : undefined)}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          data-testid="score-chart-plot"
        >
          <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} className="block overflow-visible" aria-hidden>
            <defs>
              <linearGradient id={`${uid}-a`} gradientUnits="userSpaceOnUse" x1={PAD} x2={width - PAD} y1="0" y2="0">
                <stop offset="0" stopColor="var(--color-accent)" />
                <stop offset="1" stopColor="var(--color-accent-2)" />
              </linearGradient>
            </defs>
            <line x1={PAD} x2={width - PAD} y1={y(10)} y2={y(10)} stroke="var(--color-border)" strokeWidth={1} />
            <line x1={PAD} x2={width - PAD} y1={y(0)} y2={y(0)} stroke="var(--color-border)" strokeWidth={1} />
            <line x1={PAD} x2={width - PAD} y1={y(5)} y2={y(5)} stroke="var(--color-border-strong)" strokeWidth={1} strokeDasharray="3 4" />
            {shown ? <line x1={x(shown.minute)} x2={x(shown.minute)} y1={PAD / 2} y2={H - PAD / 2} stroke="var(--color-fg-subtle)" strokeWidth={1} /> : null}
            {[...lines].reverse().map(({ s, k, pts, path, tail }) => {
              const stroke = k === 0 ? `url(#${uid}-a)` : "var(--color-fg-muted)";
              const fill = k === 0 ? "var(--color-accent)" : "var(--color-fg-muted)";
              return (
                <g key={s.slot} data-series={k}>
                  <path d={path} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={k === 0 ? undefined : "5 3"} />
                  {tail ? <path d={tail} fill="none" stroke={stroke} strokeWidth={2} strokeDasharray="1 4" strokeLinecap="round" /> : null}
                  {pts.map((p) => (
                    <circle key={p.i} cx={x(p.minute)} cy={y(p.score)} r={p.final ? 5 : active === p.i ? 4.5 : 3.5} fill={p.final || k === 0 ? fill : "var(--color-surface)"} stroke={p.final || k === 0 ? "var(--color-surface)" : fill} strokeWidth={2} />
                  ))}
                </g>
              );
            })}
          </svg>
        </div>
        <span aria-hidden />
        <div className="relative h-4 text-2xs tabular-nums leading-4 text-fg-subtle" aria-hidden>
          {points.map((p, i) => {
            const left = x(p.minute);
            // The end's label right-aligned to the drawing's edge; the minutes centred under their points (one too close to the end is left out).
            if (!p.final && width - left < 40) return null;
            return (
              <span key={i} className={cn("absolute whitespace-nowrap", p.final ? "right-0" : "-translate-x-1/2")} style={p.final ? undefined : { left }}>
                {p.final ? "End" : Math.round(p.minute)}
              </span>
            );
          })}
        </div>
      </div>
      <table className="sr-only" data-testid="score-chart-table">
        <caption>Performance score through the game: each point from what had happened by then; the end is the final score</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            {series.map((s) => (
              <th key={s.slot} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={i}>
              <th scope="row">{when(p)}</th>
              {series.map((s) => (
                <td key={s.slot}>{value(p, s.slot)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A series' mark in the legend and the readout: the solid line, or the dashed one. */
function Swatch({ k }: { k: number }) {
  return <span className={cn("inline-block h-0.5 w-3 rounded-full", k === 0 ? "bg-accent" : "border-t-2 border-dashed border-fg-muted bg-transparent")} aria-hidden />;
}
