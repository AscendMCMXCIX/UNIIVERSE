"use client";

import * as React from "react";
import type { TimelinePoint } from "@/domain/performance-score";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { gameClock } from "./match-format";

/*
  The performance score through the game (domain/performance-score timelineScores): one line for the
  player inspected, on a 0–10 axis fitted to the data (5, the match's average, always in view as a
  quiet dashed rule). The points before the end are each scored from what had happened by then; the
  last is the final score, read from the whole record, joined by a dotted segment because it reads
  more figures than the points before it (said in the (i) over the chart). Drawn at the width it is
  given, in real pixels, its labels in HTML around the drawing (so they follow the reader's text
  size). Hover, touch or the arrow keys show a point's score over the drawing's top right; the same
  figures are in a table for screen readers. The second, compared player was removed with the
  comparison (the owner's brief of 24 Nov 2026).
*/

/** The one line drawn: the player inspected. */
interface ChartSeries {
  slot: number;
  label: string;
}

const PAD = 8;
/** The smallest stretch of the 0–10 scale the axis shows (it fits the data, 5 always in view), so a game near the middle is not drawn flat. */
const MIN_SPAN = 3;

/** The axis's ends: the data's lowest and highest scores and 5, half a point beyond, at least MIN_SPAN apart, whole numbers within 0–10. */
export function axisRange(values: readonly number[]): [number, number] {
  let lo = Math.min(5, ...values) - 0.5;
  let hi = Math.max(5, ...values) + 0.5;
  if (hi - lo < MIN_SPAN) {
    const grow = (MIN_SPAN - (hi - lo)) / 2;
    lo -= grow;
    hi += grow;
  }
  lo = Math.max(0, Math.floor(lo));
  hi = Math.min(10, Math.ceil(hi));
  if (hi - lo < MIN_SPAN) {
    if (lo === 0) hi = Math.min(10, lo + MIN_SPAN);
    else lo = Math.max(0, hi - MIN_SPAN);
  }
  return [lo, hi];
}

export function ScoreChart({ points, slot, label, plotClassName = "h-24" }: { points: readonly TimelinePoint[]; slot: number; /** The player's name as the scoreboard shows it. */ label: string; /** The drawing's height, as classes (it may follow the view's width): read back in px to draw at. */ plotClassName?: string }) {
  const series: readonly ChartSeries[] = [{ slot, label }];
  const box = React.useRef<HTMLDivElement>(null);
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const [width, setWidth] = React.useState(320);
  const [H, setH] = React.useState(96);
  const [active, setActive] = React.useState<number | null>(null);
  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      setWidth(Math.max(120, Math.round(el.clientWidth)));
      setH(Math.max(48, Math.round(el.clientHeight)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const last = points.at(-1)?.minute ?? 1;
  const x = (minute: number) => PAD + (minute / last) * (width - 2 * PAD);
  const [lo, hi] = axisRange(points.flatMap((p) => series.map((s) => p.scores[s.slot]).filter((v): v is number => typeof v === "number")));
  const y = (score: number) => PAD + (1 - (score - lo) / (hi - lo)) * (H - 2 * PAD);
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
      {/* Over the drawing's top right, so it takes no height of its own: the point read, and nothing while no point is. */}
      <p className="pointer-events-none absolute right-0 top-0 z-10 flex max-w-[85%] flex-wrap items-center justify-end gap-x-2 rounded-sm bg-surface/90 px-1 text-2xs leading-4 text-fg-muted empty:hidden" aria-live="polite" data-testid="score-chart-readout">
        {shown ? (
          <>
            <span className="font-semibold tabular-nums text-fg">{when(shown)}</span>
            <span className="font-semibold tabular-nums text-fg">{value(shown, slot)}</span>
          </>
        ) : null}
      </p>
      <div className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-1">
        <div className="relative text-2xs tabular-nums leading-none text-fg-subtle" style={{ height: H }} aria-hidden>
          {[...new Set([hi, 5, lo])].map((v) => (
            <span key={v} className="absolute right-0 -translate-y-1/2" style={{ top: y(v) }} data-testid="score-chart-tick">
              {v}
            </span>
          ))}
        </div>
        <div
          ref={box}
          className={cn("relative rounded-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent", plotClassName)}
          tabIndex={0}
          role="img"
          aria-label={`Performance score through the game, ${label}: the table below holds the figures`}
          onPointerMove={(e) => pick(e.clientX)}
          onPointerDown={(e) => pick(e.clientX)}
          onPointerLeave={(e) => (e.pointerType === "mouse" ? setActive(null) : undefined)}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          data-testid="score-chart-plot"
        >
          <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} className="absolute inset-0 block overflow-visible" aria-hidden>
            <defs>
              <linearGradient id={`${uid}-a`} gradientUnits="userSpaceOnUse" x1={PAD} x2={width - PAD} y1="0" y2="0">
                <stop offset="0" stopColor="var(--color-accent)" />
                <stop offset="1" stopColor="var(--color-accent-2)" />
              </linearGradient>
            </defs>
            <line x1={PAD} x2={width - PAD} y1={y(hi)} y2={y(hi)} stroke="var(--color-border)" strokeWidth={1} />
            <line x1={PAD} x2={width - PAD} y1={y(lo)} y2={y(lo)} stroke="var(--color-border)" strokeWidth={1} />
            <line x1={PAD} x2={width - PAD} y1={y(5)} y2={y(5)} stroke="var(--color-border-strong)" strokeWidth={1} strokeDasharray="3 4" />
            {shown ? <line x1={x(shown.minute)} x2={x(shown.minute)} y1={PAD / 2} y2={H - PAD / 2} stroke="var(--color-fg-subtle)" strokeWidth={1} /> : null}
            {[...lines].reverse().map(({ s, k, pts, path, tail }) => {
              const stroke = `url(#${uid}-a)`;
              const fill = "var(--color-accent)";
              return (
                <g key={s.slot} data-series={k}>
                  <path d={path} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {tail ? <path d={tail} fill="none" stroke={stroke} strokeWidth={2} strokeDasharray="1 4" strokeLinecap="round" /> : null}
                  {pts.map((p) => (
                    <circle key={p.i} cx={x(p.minute)} cy={y(p.score)} r={p.final ? 4.5 : active === p.i ? 4 : 3} fill={fill} stroke="var(--color-surface)" strokeWidth={2} />
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
      {/* In a clipped box of its own: a table ignores the 1px width sr-only gives it, and its caption widened the page. */}
      <div className="sr-only">
        <table data-testid="score-chart-table">
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
    </div>
  );
}
