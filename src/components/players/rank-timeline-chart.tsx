"use client";

import * as React from "react";
import { ladderGrid, type RankTimeline, type TimelineReading } from "@/domain/rank-timeline";
import { formatCount, formatDate, formatDateTime, formatDayMonth, formatMonth } from "@/lib/format";
import { cn } from "@/lib/cn";

/*
  The rank over time, as Ranked progress draws it: one queue of one account, over the view the
  page chose (the 2026 ranked year by default, or one of its seasons), from the stored readings
  only (domain/rank-timeline says what may be joined). Drawn at the width it is given, in real
  pixels, so its labels keep their size on a phone and on a wide screen.

  - The rank: a step line on one ladder (each division 100 points, Master and above one LP
    ladder), continued only across a single game; a hatched band where several games went by
    unseen; a broken line at a reset.
  - "Not recorded": the hatched stretch before the first reading; Riot does not report past ranks.
  - Promotions (▲) and demotions (▼): filled when they belong to one game, hollow when they fell
    somewhere in a gap. The highest recorded rank: ◆.
  - Under it, the view's ranked games week by week (stored games, which go back to 8 January):
    wins rise above the line, losses hang below it, so the result never rests on colour alone.
  Hover, touch or the arrow keys show a reading (or a week); a table lists every reading.
*/

const MS_DAY = 86_400_000;
const WEEK = 7 * MS_DAY;

interface Hover {
  kind: "reading" | "week" | "untracked";
  index: number;
  x: number;
}

export function RankTimelineChart({ t, label }: { t: RankTimeline; label: string }) {
  const box = React.useRef<HTMLDivElement>(null);
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const [width, setWidth] = React.useState(640);
  const [hover, setHover] = React.useState<Hover | null>(null);
  const [focusIndex, setFocusIndex] = React.useState<number | null>(null);
  const [tableOpen, setTableOpen] = React.useState(false);

  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(260, Math.round(el.getBoundingClientRect().width)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Narrow below 30rem of the section (its container query, /rank): the same threshold sizes the
  // chart's box in CSS (h-58, then h-68), so the box is the right height from the first paint and
  // nothing below it moves when the chart measures its width (232 and 272 px: H below).
  const narrow = width < 480;
  const pad = { l: narrow ? 52 : 70, r: 10, t: 12 };
  const plotH = narrow ? 150 : 190;
  const stripH = 40;
  const axisH = 20;
  const H = pad.t + plotH + 10 + stripH + axisH;
  const span = Math.max(1, t.to - t.from);
  const plotW = width - pad.l - pad.r;
  // Where nothing was recorded: the view up to the first reading (or all of it, without one).
  const untrackedTo = t.trackingSince === null ? t.to : Math.min(t.to, t.trackingSince);
  const untracked = untrackedTo > t.from ? { from: t.from, to: untrackedTo } : null;
  // A long unrecorded stretch before a recorded one is drawn narrower, behind a marked break in the
  // time axis, so the recorded weeks get the room: its dates are written on it, and its weeks of
  // games stay drawn (narrower) under it.
  const squeeze = untracked && untracked.to < t.to && (untracked.to - untracked.from) / span > 0.4 && t.to - untracked.to >= 2 * MS_DAY ? { at: untracked.to, share: 0.26 } : null;
  const x = (at: number) => {
    const v = Math.min(Math.max(at, t.from), t.to);
    if (!squeeze) return pad.l + ((v - t.from) / span) * plotW;
    const left = squeeze.share * plotW;
    if (v <= squeeze.at) return pad.l + ((v - t.from) / Math.max(1, squeeze.at - t.from)) * left;
    return pad.l + left + ((v - squeeze.at) / Math.max(1, t.to - squeeze.at)) * (plotW - left);
  };
  const range = t.scoreRange;
  const y = (score: number) => (range ? pad.t + (1 - (score - range[0]) / Math.max(1, range[1] - range[0])) * plotH : pad.t + plotH / 2);
  const stripTop = pad.t + plotH + 10;
  const stripMid = stripTop + stripH / 2;

  // The rank's paths: one per unbroken run (a step across at most one game).
  const reads = t.readings;
  const paths: string[] = [];
  let d = "";
  reads.forEach((r, i) => {
    if (r.score === null) {
      if (d) paths.push(d);
      d = "";
      return;
    }
    const link = t.links[i];
    const next = reads[i + 1];
    const endAt = link?.kind === "step" && next ? next.from : r.to;
    if (endAt < t.from || r.from > t.to) {
      if (link?.kind !== "step" && d) {
        paths.push(d);
        d = "";
      }
      return;
    }
    const x0 = x(r.from);
    const x1 = Math.max(x0 + 1.5, x(endAt));
    const yy = y(r.score).toFixed(1);
    d += d ? ` L${x0.toFixed(1)},${yy} L${x1.toFixed(1)},${yy}` : `M${x0.toFixed(1)},${yy} L${x1.toFixed(1)},${yy}`;
    if (link?.kind === "step" && next?.score != null) d += ` L${x1.toFixed(1)},${y(next.score).toFixed(1)}`;
    else {
      paths.push(d);
      d = "";
    }
  });
  if (d) paths.push(d);

  const gaps = t.links.map((l, i) => (l.kind === "gap" ? { from: reads[i]!.to, to: reads[i + 1]!.from, games: l.games ?? 0, i } : null)).filter((g): g is NonNullable<typeof g> => g !== null && g.to > t.from && g.from < t.to);
  const resets = t.links.map((l, i) => (l.kind === "reset" ? { at: reads[i + 1]!.from } : null)).filter((g): g is NonNullable<typeof g> => g !== null && g.at >= t.from && g.at <= t.to);

  // Month ticks: every month, every other one on a phone, by quarter when narrower still.
  const months: Array<{ at: number; label: string }> = [];
  {
    const start = new Date(t.from);
    for (let m = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)).getTime(); m <= t.to; ) {
      months.push({ at: m, label: formatMonth(m + 12 * 3_600_000) });
      const d0 = new Date(m);
      m = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1);
    }
  }
  // Month labels where they fit, at least 34px apart: the recorded stretch first (behind a break,
  // the narrow stretch before it keeps only the labels that still fit), the last one right-aligned
  // when it would run off the edge.
  const ticks: Array<{ at: number; label: string; end?: boolean }> = [];
  const fits = (mx: number) => ticks.every((tk) => Math.abs(x(tk.at) - mx) >= 34);
  const ordered = squeeze ? [...months.filter((m) => m.at >= squeeze.at), ...months.filter((m) => m.at < squeeze.at).reverse()] : months;
  for (const m of ordered) {
    const mx = x(m.at);
    if (!fits(mx)) continue;
    ticks.push({ ...m, end: mx + 24 > width - pad.r });
  }
  ticks.sort((a, b) => a.at - b.at);

  const maxWeek = Math.max(1, ...t.weeks.map((w) => Math.max(w.wins, w.losses)));
  const visible = reads.map((r, i) => ({ r, i })).filter(({ r }) => r.score !== null && r.to >= t.from && r.from <= t.to);
  const dots = visible.length <= 160;

  const pick = (px: number): Hover | null => {
    if (px < pad.l || px > width - pad.r) return null;
    let best: Hover | null = null;
    let bestDist = Infinity;
    for (const { r, i } of visible) {
      const rx = x(r.from);
      const dist = Math.abs(rx - px);
      if (dist < bestDist && dist <= 18) {
        best = { kind: "reading", index: i, x: rx };
        bestDist = dist;
      }
    }
    if (best) return best;
    const at = t.from + ((px - pad.l) / plotW) * span;
    const w = t.weeks.findIndex((wk) => at >= wk.week && at < wk.week + WEEK);
    if (w >= 0) return { kind: "week", index: w, x: px };
    if (untracked && at < untracked.to) return { kind: "untracked", index: 0, x: px };
    return null;
  };

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect();
    setHover(pick(((e.clientX - rect.left) / rect.width) * width));
  };

  const active: Hover | null = hover ?? (focusIndex !== null && visible[focusIndex] ? { kind: "reading", index: visible[focusIndex]!.i, x: x(visible[focusIndex]!.r.from) } : null);
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

  const summary = describe(t);
  const grid = range ? ladderGrid(range) : [];
  return (
    <div className="space-y-2">
      <div ref={box} className="relative" data-testid="ranked-chart-box">
        <svg
          viewBox={`0 0 ${width} ${H}`}
          width="100%"
          className="block h-58 touch-pan-y select-none @min-[30rem]/rank:h-68 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          role="img"
          aria-label={`${label}. ${summary}`}
          tabIndex={0}
          onKeyDown={onKey}
          onBlur={() => setFocusIndex(null)}
          data-testid="ranked-chart"
          data-view={t.view}
        >
          <defs>
            <pattern id={`untracked-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" className="stroke-fg-subtle/35" strokeWidth="1.5" />
            </pattern>

            <linearGradient id={`line-${uid}`} gradientUnits="userSpaceOnUse" x1={pad.l} x2={width - pad.r} y1={0} y2={0}>
              <stop offset="0%" style={{ stopColor: "var(--color-accent)" }} />
              <stop offset="100%" style={{ stopColor: "var(--color-accent-2)" }} />
            </linearGradient>
          </defs>

          {/* Divisions: quiet dashed lines, named on the left. */}
          {grid.map((g) => (
            <g key={g.score}>
              <line x1={pad.l} x2={width - pad.r} y1={y(g.score)} y2={y(g.score)} className="stroke-border" strokeWidth={1} strokeDasharray="3 4" />
              <text x={pad.l - 6} y={y(g.score) + 4} textAnchor="end" className="fill-fg-subtle text-2xs">
                {g.label}
              </text>
            </g>
          ))}

          {/* Not recorded: before the first reading. */}
          {untracked ? (
            <g data-testid="ranked-untracked" data-until={t.trackingSince ?? ""}>
              <rect x={x(untracked.from)} y={pad.t} width={Math.max(0, x(untracked.to) - x(untracked.from))} height={plotH} fill={`url(#untracked-${uid})`} />
              {x(untracked.to) - x(untracked.from) > 110 ? (
                <text x={(x(untracked.from) + x(untracked.to)) / 2} y={pad.t + plotH / 2 - 2} textAnchor="middle" className="fill-fg-muted text-2xs font-medium">
                  {t.trackingSince === null || t.trackingSince > t.to ? "No rank recorded in this period" : `Not recorded before ${formatDayMonth(t.trackingSince)}`}
                </text>
              ) : null}
              {x(untracked.to) - x(untracked.from) > 150 ? (
                <text x={(x(untracked.from) + x(untracked.to)) / 2} y={pad.t + plotH / 2 + 12} textAnchor="middle" className="fill-fg-subtle text-2xs">
                  Riot reports only the current rank
                </text>
              ) : null}
            </g>
          ) : null}
          {squeeze ? (
            // The break in the time axis: the stretch before it is drawn narrower.
            <g data-testid="ranked-axis-break" className="stroke-fg-subtle">
              <line x1={x(squeeze.at)} x2={x(squeeze.at)} y1={pad.t} y2={stripTop + stripH} strokeWidth={1} strokeDasharray="1 3" />
              <path d={`M${x(squeeze.at) - 5},${H - axisH + 1} l4,-8 M${x(squeeze.at) + 1},${H - axisH + 1} l4,-8`} strokeWidth={1.5} fill="none" />
            </g>
          ) : null}

          {/* Several games unseen between two readings: a shaded band with dashed edges, never a line. */}
          {gaps.map((g) => (
            <g key={`gap-${g.i}`} data-testid="ranked-gap" data-games={g.games}>
              <rect x={x(g.from)} y={pad.t} width={Math.max(2, x(g.to) - x(g.from))} height={plotH} className="fill-fg-subtle/10" />
              <line x1={x(g.from)} x2={x(g.from)} y1={pad.t} y2={pad.t + plotH} className="stroke-fg-subtle/50" strokeWidth={1} strokeDasharray="2 3" />
              <line x1={x(g.to)} x2={x(g.to)} y1={pad.t} y2={pad.t + plotH} className="stroke-fg-subtle/50" strokeWidth={1} strokeDasharray="2 3" />
              {x(g.to) - x(g.from) > 46 ? (
                <text x={(x(g.from) + x(g.to)) / 2} y={pad.t + 12} textAnchor="middle" className="fill-fg-subtle text-2xs">
                  {g.games} games
                </text>
              ) : null}
            </g>
          ))}
          {resets.map((r, i) => (
            <line key={`reset-${i}`} x1={x(r.at)} x2={x(r.at)} y1={pad.t} y2={pad.t + plotH} className="stroke-fg-subtle" strokeWidth={1} strokeDasharray="2 3" data-testid="ranked-reset" />
          ))}

          {/* The rank. */}
          {paths.map((p, i) => (
            <path key={i} d={p} fill="none" stroke={`url(#line-${uid})`} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" data-testid="ranked-line" />
          ))}
          {dots
            ? visible.map(({ r, i }) => <circle key={i} cx={x(r.from)} cy={y(r.score!)} r={2.5} className="fill-accent" data-testid="ranked-reading" />)
            : null}

          {/* Promotions and demotions; hollow when they fell somewhere in a gap. */}
          {t.markers
            .filter((m) => m.kind === "promotion" || m.kind === "demotion")
            .map((m, i) => {
              const r = reads.find((rr) => rr.from === m.at);
              if (!r || r.score === null) return null;
              const up = m.kind === "promotion";
              const cx = x(m.at);
              const cy = y(r.score) + (up ? -11 : 11);
              const tri = up ? `M${cx - 5},${cy + 4} L${cx + 5},${cy + 4} L${cx},${cy - 4} Z` : `M${cx - 5},${cy - 4} L${cx + 5},${cy - 4} L${cx},${cy + 4} Z`;
              return <path key={i} d={tri} className={cn(up ? "stroke-good" : "stroke-bad", m.exact ? (up ? "fill-good" : "fill-bad") : "fill-surface")} strokeWidth={1.5} data-testid="ranked-marker" data-kind={m.kind} data-exact={m.exact} />;
            })}

          {/* The highest recorded rank. */}
          {t.peak && range ? (
            <g data-testid="ranked-peak">
              <path d={`M${x(t.peak.at)},${y(t.peak.score) - 6} l5,6 l-5,6 l-5,-6 Z`} className="fill-accent-2 stroke-surface" strokeWidth={1.5} />
            </g>
          ) : null}

          {/* The weeks' ranked games: wins up, losses down. */}
          <line x1={pad.l} x2={width - pad.r} y1={stripMid} y2={stripMid} className="stroke-border" strokeWidth={1} />
          <text x={pad.l - 6} y={stripMid + 4} textAnchor="end" className="fill-fg-subtle text-2xs">
            Games
          </text>
          {t.weeks.map((w, i) => {
            const x0 = x(w.week) + 0.5;
            const bw = Math.max(1.5, x(w.week + WEEK) - x(w.week) - 1.5);
            const up = (w.wins / maxWeek) * (stripH / 2 - 2);
            const down = (w.losses / maxWeek) * (stripH / 2 - 2);
            return (
              <g key={w.week} data-testid="ranked-week" data-wins={w.wins} data-losses={w.losses} opacity={active?.kind === "week" && active.index !== i ? 0.55 : 1}>
                {w.wins > 0 ? <rect x={x0} y={stripMid - 1 - up} width={bw} height={up} rx={1} className="fill-blue" /> : null}
                {w.losses > 0 ? <rect x={x0} y={stripMid + 1} width={bw} height={down} rx={1} className="fill-red" /> : null}
              </g>
            );
          })}

          {/* The time axis. */}
          {ticks.map((m) => (
            <g key={m.at}>
              <line x1={x(m.at)} x2={x(m.at)} y1={pad.t} y2={stripTop + stripH} className="stroke-border/60" strokeWidth={1} />
              <text x={m.end ? x(m.at) - 3 : x(m.at) + 3} y={H - 6} textAnchor={m.end ? "end" : "start"} className="fill-fg-subtle text-2xs">
                {m.label}
              </text>
            </g>
          ))}

          {/* The pointer's reading or week. */}
          {active ? <line x1={active.x} x2={active.x} y1={pad.t} y2={stripTop + stripH} className="stroke-fg-muted" strokeWidth={1} strokeDasharray="2 2" /> : null}
          {active?.kind === "reading" && reads[active.index]?.score != null ? <circle cx={active.x} cy={y(reads[active.index]!.score!)} r={5} className="fill-accent stroke-surface" strokeWidth={2} /> : null}

          <rect x={pad.l} y={pad.t} width={plotW} height={stripTop + stripH - pad.t} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={(e) => {
              // A finger leaves as soon as it lifts: a tapped reading stays shown until the next tap.
              if (e.pointerType !== "touch") setHover(null);
            }} data-testid="ranked-chart-hit" />
        </svg>
        {active ? <ChartTip t={t} hover={active} width={width} /> : null}
        <p className="sr-only" aria-live="polite">
          {active?.kind === "reading" ? readingText(t, active.index) : ""}
        </p>
      </div>
      <ChartKey t={t} />
      <div>
        <button type="button" className="text-xs font-medium text-fg-muted underline-offset-2 hover:text-fg hover:underline" aria-expanded={tableOpen} onClick={() => setTableOpen((o) => !o)} data-testid="ranked-table-toggle">
          {tableOpen ? "Hide the readings" : `Show the readings (${formatCount(visible.length)})`}
        </button>
        {tableOpen ? <ReadingsTable t={t} /> : null}
      </div>
    </div>
  );
}

function describe(t: RankTimeline): string {
  const parts: string[] = [];
  if (t.trackingSince === null) parts.push("No rank recorded yet.");
  else if (t.trackingSince > t.from) parts.push(`Rank recorded from ${formatDate(t.trackingSince)}; not recorded before.`);
  const ranked = t.readings.filter((r) => r.score !== null && r.to >= t.from && r.from <= t.to);
  if (ranked.length) parts.push(`From ${ranked[0]!.label} ${ranked[0]!.lp} LP to ${ranked.at(-1)!.label} ${ranked.at(-1)!.lp} LP.`);
  if (t.peak) parts.push(`Highest recorded: ${t.peak.label} ${t.peak.lp} LP.`);
  const gaps = t.links.filter((l) => l.kind === "gap").length;
  if (gaps) parts.push(`${gaps} stretch${gaps === 1 ? "" : "es"} of several games not observed.`);
  parts.push(`${formatCount(t.games.wins + t.games.losses)} ranked games stored in this period.`);
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
  const left = Math.min(Math.max(8, hover.x - 110), width - 228);
  let body: React.ReactNode = null;
  if (hover.kind === "reading") {
    const r: TimelineReading | undefined = t.readings[hover.index];
    if (!r) return null;
    const link = t.links[hover.index];
    body = (
      <>
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
      </>
    );
  } else if (hover.kind === "week") {
    const w = t.weeks[hover.index];
    if (!w) return null;
    body = (
      <>
        <span className="block text-sm font-semibold text-fg">Week of {formatDate(w.week)}</span>
        <span className="block text-2xs text-fg-muted">
          {w.wins + w.losses} ranked games · {w.wins}W {w.losses}L
        </span>
      </>
    );
  } else {
    body = (
      <>
        <span className="block text-sm font-semibold text-fg">Rank not recorded</span>
        <span className="block text-2xs text-fg-muted">{t.trackingSince === null ? "No reading of this rank yet." : `UNIIVERSE began reading this rank on ${formatDate(t.trackingSince)}. Riot does not report past ranks, so nothing earlier exists.`}</span>
      </>
    );
  }
  return (
    <span className="pointer-events-none absolute top-1 z-10 w-[13.5rem] rounded-card border border-border bg-bg-elevated px-2.5 py-1.5 shadow-lg" style={{ left }} data-testid="ranked-tip">
      {body}
    </span>
  );
}

function ChartKey({ t }: { t: RankTimeline }) {
  const hasGap = t.links.some((l) => l.kind === "gap");
  const hasUntracked = t.trackingSince === null || t.trackingSince > t.from;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-fg-subtle" data-testid="ranked-key">
      <li className="flex items-center gap-1.5">
        <span className="h-0.5 w-4 rounded bg-accent" aria-hidden />
        Rank read by UNIIVERSE
      </li>
      <li className="flex items-center gap-1.5">
        <span className="text-good" aria-hidden>
          ▲
        </span>
        <span className="text-bad" aria-hidden>
          ▼
        </span>
        Promotion, demotion (hollow: within a gap)
      </li>
      <li className="flex items-center gap-1.5">
        <span className="text-accent-2" aria-hidden>
          ◆
        </span>
        Highest recorded
      </li>
      {hasGap ? (
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-dashed border-fg-subtle/60 bg-fg-subtle/10" aria-hidden />
          Several games between two readings: not seen one by one
        </li>
      ) : null}
      {hasUntracked ? (
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-fg-subtle/40 bg-[repeating-linear-gradient(45deg,var(--color-fg-subtle)_0_1px,transparent_1px_4px)] opacity-60" aria-hidden />
          Not recorded
        </li>
      ) : null}
      <li className="flex items-center gap-1.5">
        <span className="flex flex-col gap-px" aria-hidden>
          <span className="h-1.5 w-2 rounded-sm bg-blue" />
          <span className="h-1.5 w-2 rounded-sm bg-red" />
        </span>
        Ranked games a week: wins up, losses down
      </li>
    </ul>
  );
}

function ReadingsTable({ t }: { t: RankTimeline }) {
  const rows = t.readings.filter((r) => r.to >= t.from && r.from <= t.to).reverse();
  return (
    <div className="mt-2 max-h-72 overflow-auto rounded-card border border-border" data-testid="ranked-table">
      <table className="w-full text-left text-xs tabular-nums">
        <caption className="sr-only">Rank readings, newest first</caption>
        <thead className="sticky top-0 bg-bg-elevated text-2xs text-fg-subtle">
          <tr>
            <th scope="col" className="px-2 py-1.5 font-medium">
              First read
            </th>
            <th scope="col" className="px-2 py-1.5 font-medium">
              Rank
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">
              Wins–losses (Riot)
            </th>
            <th scope="col" className="hidden px-2 py-1.5 font-medium sm:table-cell">
              Last confirmed
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.from} className="border-t border-border/60">
              <td className="whitespace-nowrap px-2 py-1 text-fg-muted">{formatDateTime(r.from)}</td>
              <td className="whitespace-nowrap px-2 py-1 font-medium text-fg">
                {r.label}
                {r.lp !== null ? ` · ${r.lp} LP` : ""}
              </td>
              <td className="whitespace-nowrap px-2 py-1 text-right text-fg-muted">{r.wins !== null && r.losses !== null ? `${r.wins}–${r.losses}` : "—"}</td>
              <td className="hidden whitespace-nowrap px-2 py-1 text-fg-subtle sm:table-cell">{r.to > r.from ? formatDateTime(r.to) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
