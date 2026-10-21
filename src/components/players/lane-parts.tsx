"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { CURVE_MINUTES, MIN_CURVE_GAMES, type MinuteSummary } from "@/domain/matchups";
import type { LaneSummary, MatchupGameView } from "@/server/players/matchups";
import { MatchRail, MatchResult, matchCardClass, matchTone } from "@/components/match-history/match-card";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useNow } from "@/components/ui/relative-time";

/*
  The lane parts of the champion window: the checkpoint table, the lane chart and the game card.
  Every figure is the player minus the lane opponent at an exact minute, from stored match
  timelines; every column and every point carries the number of games behind it, and a minute
  without data is a gap, never a zero.
*/

export type LaneMetric = "gold" | "xp" | "cs";
export const LANE_METRICS: Array<{ key: LaneMetric; label: string; long: string; digits: number }> = [
  { key: "gold", label: "Gold", long: "gold", digits: 0 },
  { key: "xp", label: "XP", long: "experience", digits: 0 },
  { key: "cs", label: "CS", long: "CS", digits: 1 },
];

export const signed = (n: number | null, digits = 0) => (n === null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toLocaleString("en", { maximumFractionDigits: digits, minimumFractionDigits: digits })}`);
export const diffTone = (n: number | null) => (n === null || Math.abs(n) < 0.5 ? "text-fg-muted" : n > 0 ? "text-good" : "text-bad");
export const fmtDuration = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "—");
const meanOf = (m: MinuteSummary, metric: LaneMetric) => (metric === "gold" ? m.goldMean : metric === "xp" ? m.xpMean : m.csMean);

/** One sentence on how many of the games have a timeline, and why the rest do not. */
export function timelineCoverage(t: LaneSummary["timelines"], games: number): string {
  const parts = [t.frames ? `Timelines for ${t.frames} of ${games} game${games === 1 ? "" : "s"}` : games === 1 ? "No timeline stored yet for this game" : `No timeline stored yet for these ${games} games`];
  if (t.pending) parts.push(`${t.pending} still to be collected, a few at a time, newest first`);
  if (t.unavailable) parts.push(`${t.unavailable} no longer provided by Riot`);
  if (t.noDetails) parts.push(`${t.noDetails} without a clear lane opponent in the match details`);
  return parts.join(" · ");
}

/** Gold, experience and CS differences at the checkpoints, each column with its number of games. */
export function LaneTable({ checkpoints, testId = "lane-checkpoints" }: { checkpoints: MinuteSummary[]; testId?: string }) {
  const rows: Array<{ label: string; value: (c: MinuteSummary) => React.ReactNode }> = [
    { label: "Gold", value: (c) => <span className={diffTone(c.goldMean)}>{signed(c.goldMean)}</span> },
    { label: "Experience", value: (c) => <span className={diffTone(c.xpMean)}>{signed(c.xpMean)}</span> },
    { label: "CS", value: (c) => <span className={diffTone(c.csMean)}>{signed(c.csMean, 1)}</span> },
    { label: "Ahead in gold", value: (c) => `${c.aheadInGold} of ${c.games}` },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs sm:text-sm" data-testid={testId}>
        <caption className="sr-only">Average difference with the lane opponent at each minute (yours minus theirs), with the games behind each column</caption>
        <thead>
          <tr className="text-xs text-fg-subtle">
            <th scope="col" className="py-1 pr-2 text-left font-medium">
              Average difference
            </th>
            {checkpoints.map((c) => (
              <th key={c.minute} scope="col" className="px-1 py-1 text-right font-medium tabular-nums sm:px-2">
                {c.minute}:00
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-border/60">
              <th scope="row" className="py-1.5 pr-2 text-left font-normal text-fg-muted">
                {r.label}
              </th>
              {checkpoints.map((c) => (
                <td key={c.minute} className="whitespace-nowrap px-1 py-1.5 text-right font-medium sm:px-2">
                  {c.games ? r.value(c) : <span className="text-fg-subtle">—</span>}
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t border-border/60 text-xs text-fg-subtle">
            <th scope="row" className="py-1 pr-2 text-left font-normal">
              Games with a timeline
            </th>
            {checkpoints.map((c) => (
              <td key={c.minute} className="px-1 py-1 text-right sm:px-2" data-testid={`checkpoint-games-${c.minute}`}>
                {c.games}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * The lane by minute: the average difference where at least MIN_CURVE_GAMES games reached the
 * minute (a gap elsewhere), single games as faint lines when given, and the zero line. Hover, touch
 * or the arrow keys read one minute: the average and the games behind it. With fewer than
 * MIN_CURVE_GAMES timelines there is no curve at all, only the checkpoint table.
 */
export function LaneChart({ curve, games = [], metric, onMetric, testId = "lane-chart" }: { curve: MinuteSummary[]; games?: MatchupGameView[]; metric: LaneMetric; onMetric: (m: LaneMetric) => void; testId?: string }) {
  const m = LANE_METRICS.find((x) => x.key === metric)!;
  const drawable = curve.some((c) => c.games >= MIN_CURVE_GAMES);
  const groupId = React.useId();
  return (
    <figure className="min-w-0" data-testid={testId} data-metric={metric}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <figcaption id={`${groupId}-cap`} className="text-xs text-fg-muted">
          {m.label} difference by minute (yours minus your lane opponent&apos;s)
        </figcaption>
        <div role="radiogroup" aria-label="Lane figure" className={segmentedGroupClass()} data-testid={`${testId}-metric`}>
          {LANE_METRICS.map((x) => (
            <button key={x.key} type="button" role="radio" aria-checked={metric === x.key} onClick={() => onMetric(x.key)} className={segmentClass(metric === x.key)} data-testid={`${testId}-metric-${x.key}`}>
              {x.label}
            </button>
          ))}
        </div>
      </div>
      {drawable ? (
        <ChartBody curve={curve} games={games} metric={metric} labelledBy={`${groupId}-cap`} testId={testId} />
      ) : (
        <p className="rounded-panel border border-dashed border-border px-3 py-4 text-center text-xs text-fg-muted" data-testid={`${testId}-empty`}>
          No minute has {MIN_CURVE_GAMES} or more games with a timeline yet, so no curve is drawn. The table shows each checkpoint with its games.
        </p>
      )}
    </figure>
  );
}

function ChartBody({ curve, games, metric, labelledBy, testId }: { curve: MinuteSummary[]; games: MatchupGameView[]; metric: LaneMetric; labelledBy: string; testId: string }) {
  const m = LANE_METRICS.find((x) => x.key === metric)!;
  const [hover, setHover] = React.useState<number | null>(null);
  // Drawn at the width it is shown, so the axis labels keep their size on a phone.
  const box = React.useRef<HTMLDivElement>(null);
  const [W, setW] = React.useState(640);
  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 480 ? 200 : 220;
  const pad = { l: 46, r: 24, t: 12, b: 24 };
  const mean = curve.map((c) => (c.games >= MIN_CURVE_GAMES ? meanOf(c, metric) : null));
  const singles = games.filter((g) => g.curves[metric].length);
  const values = [...mean, ...singles.flatMap((g) => g.curves[metric])].filter((v): v is number => v !== null);
  const step = metric === "cs" ? 10 : 500;
  const floor = metric === "cs" ? 20 : 1000;
  const max = Math.max(floor, Math.ceil(Math.max(0, ...values.map((v) => Math.abs(v))) / step) * step);
  const x = (minute: number) => pad.l + ((W - pad.l - pad.r) * minute) / CURVE_MINUTES;
  const y = (v: number) => pad.t + ((H - pad.t - pad.b) * (max - v)) / (2 * max);
  const segments = (series: Array<number | null>) => {
    const out: Array<Array<[number, number]>> = [];
    let cur: Array<[number, number]> = [];
    series.forEach((v, i) => {
      if (v === null) {
        if (cur.length) out.push(cur);
        cur = [];
      } else cur.push([i + 1, v]);
    });
    if (cur.length) out.push(cur);
    return out;
  };
  const path = (pts: Array<[number, number]>) => pts.map(([mm, v], i) => `${i ? "L" : "M"}${x(mm).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const ticks = [-max, -max / 2, 0, max / 2, max];
  const first = curve.findIndex((c) => c.games >= MIN_CURVE_GAMES);
  const lastDrawn = curve.length - 1 - [...curve].reverse().findIndex((c) => c.games >= MIN_CURVE_GAMES);
  const at = hover === null ? null : curve[hover - 1] ?? null;
  const atMean = at && at.games >= MIN_CURVE_GAMES ? meanOf(at, metric) : null;
  const pick = (clientX: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * W;
    const minute = (px - pad.l) / ((W - pad.l - pad.r) / CURVE_MINUTES);
    setHover(Math.min(CURVE_MINUTES, Math.max(1, Math.round(minute))));
  };
  const xLabels = W < 480 ? [0, 10, 20, 30] : [0, 5, 10, 15, 20, 25, 30];
  return (
    <div className="relative" ref={box}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-pan-y select-none rounded focus-visible:outline-2 focus-visible:outline-accent"
        role="img"
        aria-labelledby={labelledBy}
        aria-describedby={`${testId}-readout`}
        tabIndex={0}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          setHover((h) => Math.min(CURVE_MINUTES, Math.max(1, (h ?? (e.key === "ArrowRight" ? first : lastDrawn + 2)) + (e.key === "ArrowRight" ? 1 : -1))));
        }}
        data-testid={`${testId}-svg`}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className={v === 0 ? "stroke-fg-subtle/70" : "stroke-border/60"} strokeDasharray={v === 0 ? undefined : "3 4"} />
            <text x={pad.l - 6} y={y(v) + 3.5} textAnchor="end" className="fill-fg-subtle text-2xs tabular-nums">
              {v === 0 ? "0" : signed(v)}
            </text>
          </g>
        ))}
        {xLabels.map((mm) => (
          <text key={mm} x={x(mm)} y={H - 6} textAnchor="middle" className="fill-fg-subtle text-2xs tabular-nums">
            {mm}:00
          </text>
        ))}
        {singles.map((g) => segments(g.curves[metric]).map((seg, i) => <path key={`${g.matchId}-${i}`} d={path(seg)} fill="none" className={g.win ? "stroke-blue/30" : "stroke-red/30"} strokeWidth={1.1} />))}
        {segments(mean).map((seg, i) => (
          <path key={`mean-${i}`} d={path(seg)} fill="none" className="stroke-accent" strokeWidth={2.75} strokeLinejoin="round" strokeLinecap="round" data-testid={`${testId}-mean`} />
        ))}
        {hover !== null ? (
          <g aria-hidden>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} className="stroke-fg-subtle/60" />
            {atMean !== null ? <circle cx={x(hover)} cy={y(atMean)} r={4.5} className="fill-accent stroke-bg-elevated" strokeWidth={2} /> : null}
          </g>
        ) : null}
      </svg>
      <p id={`${testId}-readout`} className={cn("pointer-events-none mt-1 min-h-[2.5rem] text-xs tabular-nums sm:min-h-[1.25rem]", hover === null ? "text-fg-subtle" : "text-fg")} aria-live="polite" data-testid={`${testId}-readout`}>
        {hover === null || !at ? (
          <>Hover, touch or use the arrow keys to read a minute.</>
        ) : atMean === null ? (
          <>
            {hover}:00 · {at.games ? `only ${at.games} game${at.games === 1 ? "" : "s"} reached this minute with a timeline: too few to average` : "no game with a timeline reached this minute"}
          </>
        ) : (
          <>
            {hover}:00 · You <span className={cn("font-semibold", diffTone(atMean))}>{signed(atMean, m.digits)}</span> {m.long} · {at.games} game{at.games === 1 ? "" : "s"}
          </>
        )}
      </p>
      <p className="text-2xs text-fg-subtle">
        <span className="text-accent">━</span> your average, drawn where {MIN_CURVE_GAMES}+ games reached the minute
        {singles.length ? (
          <>
            {" "}
            · faint lines are single games (<span className="text-blue">win</span>, <span className="text-red">loss</span>)
          </>
        ) : null}
      </p>
    </div>
  );
}

const TIMELINE_LABEL: Record<MatchupGameView["timeline"], string> = { frames: "", pending: "Timeline not collected yet", unavailable: "Timeline no longer provided by Riot", "no-details": "Lane opponent unclear in the match details" };

/**
 * One game as the shared match card (the result column, then the lane figures); it opens the match
 * window. `opponent` shows who the lane opponent was (the champion's recent games, where it varies).
 */
export function LaneGameCard({ g, showAccount, onOpen, stated, opponent }: { g: MatchupGameView; showAccount: boolean; onOpen: () => void; stated?: MatchupGameView["timeline"] | null; opponent?: PortraitChampion | null }) {
  const at = (mm: number) => g.at.find((a) => a.minute === mm);
  const when = timeAgo(new Date(g.playedAt), useNow());
  return (
    <li>
      <button type="button" onClick={onOpen} className={cn("group w-full text-left focus-visible:outline-2 focus-visible:outline-accent", matchCardClass(g.win, { interactive: true }))} data-testid="lane-game" data-match={g.matchId} aria-label={`${matchTone(g.win).word}, ${g.queue}, ${when}${opponent ? ` against ${opponent.name}` : ""}. Open the match details.`}>
        <MatchRail win={g.win} />
        <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-3 py-2.5 sm:grid-cols-[6.5rem_minmax(0,1fr)_auto]">
          <MatchResult win={g.win} queue={g.queue} when={when} duration={fmtDuration(g.durationSeconds)} lineBelow="sm" className="max-sm:col-span-2" />
          <span className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1 text-xs text-fg-subtle">
            {opponent ? (
              <span className="flex items-center gap-1.5">
                <span className="text-fg-subtle">vs</span>
                <ChampionPortrait champion={opponent} size="xs" />
                <span className="font-medium text-fg">{opponent.name}</span>
              </span>
            ) : null}
            <span className="tabular-nums">
              <span className="block text-sm font-semibold text-fg">{g.kills === null ? "—" : `${g.kills} / ${g.deaths} / ${g.assists}`}</span> KDA
            </span>
            <span className="tabular-nums">
              <span className="block text-sm font-semibold text-fg">{g.cs ?? "—"}</span> CS
            </span>
            {g.timeline === "frames" ? (
              <span className="tabular-nums">
                <span className={cn("block text-sm font-semibold", diffTone(at(10)?.gold ?? null))}>{signed(at(10)?.gold ?? null)}</span> Gold at 10:00
              </span>
            ) : g.timeline === stated ? null : (
              <span className="self-center" data-testid="lane-game-timeline">
                {TIMELINE_LABEL[g.timeline]}
              </span>
            )}
            {showAccount ? <span className="self-center truncate rounded bg-surface-2 px-1.5 py-px text-2xs">{g.account}</span> : null}
          </span>
          <ChevronRight className="h-4 w-4 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg motion-reduce:transition-none" aria-hidden />
        </span>
      </button>
    </li>
  );
}
