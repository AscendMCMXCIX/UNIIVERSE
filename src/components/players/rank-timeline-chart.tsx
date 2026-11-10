"use client";

import * as React from "react";
import { ladderGrid, type RankTimeline, type TimelineReading } from "@/domain/rank-timeline";
import { formatDate, formatDateTime, formatDayMonth, formatMonth, localPeriodStarts } from "@/lib/format";
import { cn } from "@/lib/cn";

/*
  The rank over time, compact, as Ranked progress draws it beside the current rank: one queue of
  one account, from its first reading to now (domain/rank-timeline says what may be joined). Drawn
  at the width it is given, in real pixels, so its labels keep their size on a phone and on a wide
  screen; always 120 px tall, so nothing below it moves when it measures its width.

  - The rank: a step line on one ladder (each division 100 points, Master and above one LP
    ladder), continued only across a single game; a shaded band where several games went by
    unseen; a broken line at a reset.
  - Promotions (▲) and demotions (▼): filled when they belong to one game, hollow when they fell
    somewhere in a gap. The highest recorded rank: ◆.
  - A short hatched stretch only when the first reading is under three days old (the chart's
    shortest span): nothing was read there.
  Hover, touch or the arrow keys show a reading; the readings table sits in Ranked progress's
  details.
*/

const MS_DAY = 86_400_000;

/**
 * The drawing's frame in user units, which are CSS pixels (the viewBox is as wide as the box). Its
 * height is the box's (`h-30`, 7.5rem) and its gutters hold rem-sized labels, so all of them follow
 * the root size, which grows above 1536px (globals.css): a frame fixed in px clipped the division
 * names on the left above about 1700px and left the drawing short of its box. The server draws with
 * 16px (120 tall, a 64px gutter), as before; the box's height is CSS, so nothing moves on hydrating.
 */
function chartFrame(rem: number, narrow: boolean) {
  const H = Math.round(7.5 * rem);
  const PAD_T = Math.round(0.625 * rem);
  const AXIS_H = Math.round(1.125 * rem);
  return { H, PAD_T, AXIS_H, PLOT_H: H - PAD_T - AXIS_H, pad: { l: Math.round((narrow ? 3 : 4) * rem), r: Math.round(0.5 * rem) } };
}

interface Hover {
  index: number;
  x: number;
}

export function RankTimelineChart({ t, label }: { t: RankTimeline; label: string }) {
  const box = React.useRef<HTMLDivElement>(null);
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const [width, setWidth] = React.useState(480);
  const [rem, setRem] = React.useState(16);
  const [hover, setHover] = React.useState<Hover | null>(null);
  const [focusIndex, setFocusIndex] = React.useState<number | null>(null);

  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      setWidth(Math.max(240, Math.round(el.getBoundingClientRect().width)));
      setRem(parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Narrow (a phone, a tablet's third): the divisions' short codes ("E2"), in a narrower gutter.
  const narrow = width < 26.25 * rem;
  const { H, PAD_T, PLOT_H, pad } = chartFrame(rem, narrow);
  const span = Math.max(1, t.to - t.from);
  const plotW = width - pad.l - pad.r;
  const x = (at: number) => pad.l + ((Math.min(Math.max(at, t.from), t.to) - t.from) / span) * plotW;
  const range = t.scoreRange;
  const y = (score: number) => (range ? PAD_T + (1 - (score - range[0]) / Math.max(1, range[1] - range[0])) * PLOT_H : PAD_T + PLOT_H / 2);
  const untracked = t.trackingSince !== null && t.trackingSince > t.from ? { from: t.from, to: t.trackingSince } : null;

  // The rank's paths: one per unbroken run (a step across at most one game).
  const reads = t.readings;
  const paths: Array<{ d: string; x0: number; x1: number }> = [];
  let d = "";
  let runFrom = 0;
  let runTo = 0;
  const close = () => {
    if (d) paths.push({ d, x0: runFrom, x1: runTo });
    d = "";
  };
  reads.forEach((r, i) => {
    if (r.score === null) {
      close();
      return;
    }
    const link = t.links[i];
    const next = reads[i + 1];
    const endAt = link?.kind === "step" && next ? next.from : r.to;
    const x0 = x(r.from);
    const x1 = Math.max(x0 + 1.5, x(endAt));
    const yy = y(r.score).toFixed(1);
    if (!d) runFrom = x0;
    runTo = x1;
    d += d ? ` L${x0.toFixed(1)},${yy} L${x1.toFixed(1)},${yy}` : `M${x0.toFixed(1)},${yy} L${x1.toFixed(1)},${yy}`;
    if (link?.kind === "step" && next?.score != null) d += ` L${x1.toFixed(1)},${y(next.score).toFixed(1)}`;
    else close();
  });
  close();

  const gaps = t.links.map((l, i) => (l.kind === "gap" ? { from: reads[i]!.to, to: reads[i + 1]!.from, games: l.games ?? 0, i } : null)).filter((g): g is NonNullable<typeof g> => g !== null);
  const resets = t.links.map((l, i) => (l.kind === "reset" ? { at: reads[i + 1]!.from } : null)).filter((g): g is NonNullable<typeof g> => g !== null);

  // Date labels where they fit, at least 56 px apart: the installation's days over a short stretch,
  // its months over a long one, each tick on the local midnight its label names.
  const ticks: Array<{ at: number; label: string; end?: boolean }> = [];
  {
    const long = span > 75 * MS_DAY;
    for (const at of localPeriodStarts(t.from, t.to, long ? "month" : "day")) {
      const mx = x(at);
      if (ticks.every((tk) => Math.abs(x(tk.at) - mx) >= 56) && mx - pad.l >= 18) ticks.push({ at, label: long ? formatMonth(at) : formatDayMonth(at), end: mx + 40 > width - pad.r });
    }
  }

  const visible = reads.map((r, i) => ({ r, i })).filter(({ r }) => r.score !== null);
  const dots = visible.length <= 120;

  const pick = (px: number): Hover | null => {
    let best: Hover | null = null;
    let bestDist = Infinity;
    for (const { r, i } of visible) {
      const rx = x(r.from);
      const dist = Math.abs(rx - px);
      if (dist < bestDist && dist <= 24) {
        best = { index: i, x: rx };
        bestDist = dist;
      }
    }
    return best;
  };
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect();
    setHover(pick(((e.clientX - rect.left) / rect.width) * width));
  };
  const active: Hover | null = hover ?? (focusIndex !== null && visible[focusIndex] ? { index: visible[focusIndex]!.i, x: x(visible[focusIndex]!.r.from) } : null);
  const onKey = (e: React.KeyboardEvent) => {
    if (visible.length === 0) return;
    const last = visible.length - 1;
    const cur = focusIndex ?? last + 1;
    let next: number | null = null;
    if (e.key === "ArrowLeft") next = Math.max(0, Math.min(cur, last + 1) - 1);
    else if (e.key === "ArrowRight") next = focusIndex === null ? last : Math.min(last, cur + 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else if (e.key === "Escape") {
      setFocusIndex(null);
      return;
    }
    if (next === null) return;
    e.preventDefault();
    setHover(null);
    setFocusIndex(next);
  };

  const grid = range ? ladderGrid(range, { maxDivisions: 4, short: narrow }) : [];
  return (
    <div ref={box} className="relative min-w-0" data-testid="ranked-chart-box">
      <svg
        viewBox={`0 0 ${width} ${H}`}
        width="100%"
        className="block h-30 touch-pan-y select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        role="img"
        aria-label={`${label}. ${describe(t)}`}
        tabIndex={0}
        onKeyDown={onKey}
        onBlur={() => setFocusIndex(null)}
        data-testid="ranked-chart"
      >
        <defs>
          <pattern id={`untracked-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" className="stroke-fg-subtle/35" strokeWidth="1.5" />
          </pattern>
          <linearGradient id={`line-${uid}`} gradientUnits="userSpaceOnUse" x1={pad.l} x2={width - pad.r} y1={0} y2={0}>
            <stop offset="0%" style={{ stopColor: "var(--color-accent)" }} />
            <stop offset="100%" style={{ stopColor: "var(--color-accent-2)" }} />
          </linearGradient>
          <linearGradient id={`fill-${uid}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--color-accent)", stopOpacity: 0.14 }} />
            <stop offset="100%" style={{ stopColor: "var(--color-accent)", stopOpacity: 0 }} />
          </linearGradient>
        </defs>

        {/* Divisions: quiet dashed lines, named on the left. */}
        {grid.map((g) => (
          <g key={g.score}>
            <line x1={pad.l} x2={width - pad.r} y1={y(g.score)} y2={y(g.score)} className="stroke-border" strokeWidth={1} strokeDasharray="3 4" />
            <text x={pad.l - 6} y={y(g.score) + 4} textAnchor="end" className="fill-fg-subtle text-2xs" data-division="">
              {g.label}
            </text>
          </g>
        ))}

        {untracked ? <rect x={x(untracked.from)} y={PAD_T} width={Math.max(0, x(untracked.to) - x(untracked.from))} height={PLOT_H} fill={`url(#untracked-${uid})`} data-testid="ranked-untracked" /> : null}

        {/* Several games unseen between two readings: a shaded band with dashed edges, never a line. */}
        {gaps.map((g) => (
          <g key={`gap-${g.i}`} data-testid="ranked-gap" data-games={g.games}>
            <rect x={x(g.from)} y={PAD_T} width={Math.max(2, x(g.to) - x(g.from))} height={PLOT_H} className="fill-fg-subtle/10" />
            <line x1={x(g.from)} x2={x(g.from)} y1={PAD_T} y2={PAD_T + PLOT_H} className="stroke-fg-subtle/50" strokeWidth={1} strokeDasharray="2 3" />
            <line x1={x(g.to)} x2={x(g.to)} y1={PAD_T} y2={PAD_T + PLOT_H} className="stroke-fg-subtle/50" strokeWidth={1} strokeDasharray="2 3" />
          </g>
        ))}
        {resets.map((r, i) => (
          <line key={`reset-${i}`} x1={x(r.at)} x2={x(r.at)} y1={PAD_T} y2={PAD_T + PLOT_H} className="stroke-fg-subtle" strokeWidth={1} strokeDasharray="2 3" data-testid="ranked-reset" />
        ))}

        {/* The rank, over a faint wash under its line. */}
        {paths.map((p, i) => (
          <path key={`wash-${i}`} d={`${p.d} L${p.x1.toFixed(1)},${PAD_T + PLOT_H} L${p.x0.toFixed(1)},${PAD_T + PLOT_H} Z`} fill={`url(#fill-${uid})`} aria-hidden />
        ))}
        {paths.map((p, i) => (
          <path key={i} d={p.d} fill="none" stroke={`url(#line-${uid})`} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" data-testid="ranked-line" />
        ))}
        {dots ? visible.map(({ r, i }) => <circle key={i} cx={x(r.from)} cy={y(r.score!)} r={2.25} className="fill-accent" data-testid="ranked-reading" />) : null}

        {/* Promotions and demotions; hollow when they fell somewhere in a gap. */}
        {t.markers
          .filter((m) => m.kind === "promotion" || m.kind === "demotion")
          .map((m, i) => {
            const r = reads.find((rr) => rr.from === m.at);
            if (!r || r.score === null) return null;
            const up = m.kind === "promotion";
            const cx = x(m.at);
            const cy = Math.min(Math.max(y(r.score) + (up ? -10 : 10), PAD_T + 4), PAD_T + PLOT_H - 4);
            const tri = up ? `M${cx - 4.5},${cy + 3.5} L${cx + 4.5},${cy + 3.5} L${cx},${cy - 3.5} Z` : `M${cx - 4.5},${cy - 3.5} L${cx + 4.5},${cy - 3.5} L${cx},${cy + 3.5} Z`;
            return <path key={i} d={tri} className={cn(up ? "stroke-good" : "stroke-bad", m.exact ? (up ? "fill-good" : "fill-bad") : "fill-surface")} strokeWidth={1.5} data-testid="ranked-marker" data-kind={m.kind} data-exact={m.exact} />;
          })}

        {/* The highest recorded rank. */}
        {t.peak && range ? <path d={`M${x(t.peak.at)},${y(t.peak.score) - 6} l5,6 l-5,6 l-5,-6 Z`} className="fill-accent-2 stroke-surface" strokeWidth={1.5} data-testid="ranked-peak" /> : null}

        {/* The time axis. */}
        <line x1={pad.l} x2={width - pad.r} y1={PAD_T + PLOT_H} y2={PAD_T + PLOT_H} className="stroke-border" strokeWidth={1} />
        {ticks.map((m) => (
          <g key={m.at}>
            <line x1={x(m.at)} x2={x(m.at)} y1={PAD_T + PLOT_H} y2={PAD_T + PLOT_H + 3} className="stroke-border" strokeWidth={1} />
            <text x={x(m.at)} y={H - 3} textAnchor={m.end ? "end" : "middle"} className="fill-fg-subtle text-2xs">
              {m.label}
            </text>
          </g>
        ))}

        {/* The pointer's reading. */}
        {active ? <line x1={active.x} x2={active.x} y1={PAD_T} y2={PAD_T + PLOT_H} className="stroke-fg-muted" strokeWidth={1} strokeDasharray="2 2" /> : null}
        {active && reads[active.index]?.score != null ? <circle cx={active.x} cy={y(reads[active.index]!.score!)} r={4.5} className="fill-accent stroke-surface" strokeWidth={2} /> : null}

        <rect
          x={pad.l}
          y={0}
          width={plotW}
          height={PAD_T + PLOT_H}
          fill="transparent"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={(e) => {
            // A finger leaves as soon as it lifts: a tapped reading stays shown until the next tap.
            if (e.pointerType !== "touch") setHover(null);
          }}
          data-testid="ranked-chart-hit"
        />
      </svg>
      {active ? <ChartTip t={t} hover={active} width={width} /> : null}
      <p className="sr-only" aria-live="polite">
        {active ? readingText(t, active.index) : ""}
      </p>
    </div>
  );
}

function describe(t: RankTimeline): string {
  const parts: string[] = [];
  if (t.trackingSince === null) return "No rank recorded yet.";
  parts.push(`Rank recorded from ${formatDate(t.trackingSince)}; Riot reports no earlier ranks.`);
  const ranked = t.readings.filter((r) => r.score !== null);
  if (ranked.length) parts.push(`From ${ranked[0]!.label} ${ranked[0]!.lp} LP to ${ranked.at(-1)!.label} ${ranked.at(-1)!.lp} LP.`);
  if (t.peak) parts.push(`Highest recorded: ${t.peak.label} ${t.peak.lp} LP.`);
  const gaps = t.links.filter((l) => l.kind === "gap").length;
  if (gaps) parts.push(`${gaps} stretch${gaps === 1 ? "" : "es"} of several games not observed one by one.`);
  return parts.join(" ");
}

function readingText(t: RankTimeline, i: number): string {
  const r = t.readings[i];
  if (!r) return "";
  const link = t.links[i];
  const next = link ? (link.kind === "step" ? (link.games === 1 ? " The next reading came one game later." : " The next reading came with no game between.") : link.kind === "gap" ? ` The next reading came ${link.games} games later: the games between were not observed one by one.` : " A reset follows.") : "";
  return `${r.label}${r.lp !== null ? ` ${r.lp} LP` : ""}, first read ${formatDateTime(r.from)}${r.to > r.from ? `, last confirmed ${formatDateTime(r.to)}` : ""}.${r.wins !== null && r.losses !== null ? ` ${r.wins} wins, ${r.losses} losses this ranked year (Riot's count).` : ""}${next}`;
}

function ChartTip({ t, hover, width }: { t: RankTimeline; hover: Hover; width: number }) {
  const r: TimelineReading | undefined = t.readings[hover.index];
  if (!r) return null;
  const link = t.links[hover.index];
  // Beside the reading, on whichever side has room, so it never covers the point it describes.
  const right = hover.x < width / 2;
  const style = right ? { left: Math.min(hover.x + 12, width - 216) } : { right: Math.min(width - hover.x + 12, width - 216) };
  return (
    <span className="pointer-events-none absolute top-0 z-10 w-[13rem] rounded-card border border-border bg-bg-elevated px-2.5 py-1.5 shadow-lg" style={style} data-testid="ranked-tip">
      <span className="block text-sm font-semibold text-fg">
        {r.label}
        {r.lp !== null ? ` · ${r.lp} LP` : ""}
      </span>
      <span className="block text-2xs text-fg-subtle">Read {formatDateTime(r.from)}</span>
      {r.to > r.from ? <span className="block text-2xs text-fg-subtle">Still so at {formatDateTime(r.to)}</span> : null}
      {r.wins !== null && r.losses !== null ? (
        <span className="block text-2xs text-fg-muted">
          {r.wins}W {r.losses}L this ranked year (Riot)
        </span>
      ) : null}
      {link?.kind === "gap" ? <span className="mt-1 block text-2xs text-fg-muted">Then {link.games} games before the next reading: not observed one by one.</span> : null}
    </span>
  );
}
