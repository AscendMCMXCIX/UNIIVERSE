"use client";

import * as React from "react";
import type { DetailParticipant } from "@/server/players/match-history";
import { reasonText, SCORE_VERSION, trendWords, type MatchScores, type TimelinePoint } from "@/domain/performance-score";
import { InfoTip } from "@/components/ui/info-tip";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatCount, formatKilo, formatNumber, formatOrdinal } from "@/lib/format";
import { ScoreChart } from "./score-chart";

/*
  The performance score of the player inspected (domain/performance-score; docs/PERFORMANCE_SCORE.md):
  the score, its place among the game's players, MVP or ACE, why in a sentence, and the score
  through the game where the timeline has it, with a second player to compare on the same chart and
  side by side. Everything comes from the opened game's record and timeline, already loaded.
*/

export type TimelineState = "loading" | "ok" | "missing";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

export function PerformancePanel({ scores, points, timeline, subject, compare, onCompare, others, nameOf }: { scores: MatchScores | null; points: TimelinePoint[] | null; timeline: TimelineState; subject: DetailParticipant; compare: DetailParticipant | null; onCompare: (slot: number | null) => void; /** Everyone else in the game who can be compared (not removed), the lane opponent first. */ others: DetailParticipant[]; nameOf: (p: DetailParticipant) => string }) {
  const mine = scores?.players.find((p) => p.slot === subject.slot) ?? null;
  const theirs = compare ? (scores?.players.find((p) => p.slot === compare.slot) ?? null) : null;
  const series = [{ slot: subject.slot, label: nameOf(subject) }, ...(compare ? [{ slot: compare.slot, label: nameOf(compare) }] : [])];
  const timed = points?.filter((p) => !p.final).map((p) => p.scores[subject.slot]).filter((v): v is number => typeof v === "number") ?? [];
  const trends = trendWords(timed);
  const why = mine ? reasonText(mine.reasons) : null;
  const options = [{ value: "", label: "No comparison" }, ...others.map((o) => ({ value: String(o.slot), label: `${nameOf(o)}${o.slot === subject.laneOpponentSlot ? " (lane opponent)" : ""}` }))];
  return (
    <section aria-label="Performance score" className="space-y-2 rounded-panel border border-border bg-surface px-3 py-2" data-testid="performance" data-state={timeline === "loading" ? "loading" : scores ? "ok" : "none"} data-version={SCORE_VERSION}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5">
          <span className="label-caps">Performance score</span>
          <InfoTip label="About the performance score" testId="performance-info" text="Compared within this game only: each player's figures against the other players and their lane opponent, weighted by role. 5 is the game's average." />
          {mine && timeline !== "loading" ? (
            <span className="ml-1 flex flex-wrap items-baseline gap-x-2" data-testid="performance-summary">
              <span className="text-2xl font-semibold leading-none tabular-nums text-fg" data-testid="performance-value">
                {formatNumber(mine.score, 1)}
              </span>
              <span className="text-xs text-fg-muted" data-testid="performance-rank">
                {formatOrdinal(mine.rank)} of {scores!.scored}
              </span>
            </span>
          ) : null}
        </span>
        {others.length ? <Select value={compare ? String(compare.slot) : ""} options={options} onValueChange={(v) => onCompare(v === "" ? null : Number(v))} aria-label="Compare with another player" className="max-w-[14rem]" data-testid="performance-compare" /> : null}
      </div>
      {timeline === "loading" ? (
        <div role="status" className="h-16 animate-pulse rounded-md bg-surface-2 motion-reduce:animate-none">
          <span className="sr-only">Scoring the game</span>
        </div>
      ) : !scores || !mine ? (
        <p className="text-xs text-fg-muted" data-testid="performance-none">
          No score for this player: a score needs two teams of recorded players to compare.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 empty:hidden">
            {mine.mvp ? (
              <Badge tone="blue" size="line">
                MVP
              </Badge>
            ) : mine.ace ? (
              <Badge tone="red" size="line">
                ACE
              </Badge>
            ) : null}
            {trends.map((t) => (
              <Badge key={t} tone="neutral" size="line">
                {t}
              </Badge>
            ))}
            {mine.weights === "NEUTRAL" ? <span className="text-2xs text-fg-subtle">Position not recorded: judged on every role&apos;s figures alike.</span> : null}
          </div>
          {why ? (
            <p className="text-xs text-fg-muted" data-testid="performance-why">
              {why}
            </p>
          ) : null}
          {points && points.length > 1 ? (
            <ScoreChart points={points} series={series} />
          ) : (
            <p className="text-xs text-fg-subtle" data-testid="performance-timeline-missing">
              {timeline === "missing" ? "Score through the game not available: this game has no stored timeline." : "Score through the game not available: the timeline's minute-by-minute record is incomplete for this game."}
            </p>
          )}
          {compare ? <CompareTable a={subject} b={compare} sa={mine.score} sb={theirs?.score ?? null} nameOf={nameOf} /> : null}
        </>
      )}
    </section>
  );
}

/** Two players side by side on the figures a reader compares first (written plainly: no "KDA" or "/ min" captions, which each player's tiles carry once). */
function CompareTable({ a, b, sa, sb, nameOf }: { a: DetailParticipant; b: DetailParticipant; sa: number; sb: number | null; nameOf: (p: DetailParticipant) => string }) {
  const rows: Array<[string, (p: DetailParticipant) => string]> = [
    ["K / D / A", (p) => `${p.kills} / ${p.deaths} / ${p.assists}`],
    ["Kill participation", (p) => pct(p.killParticipation)],
    ["Damage to champions", (p) => (p.damage === null ? "—" : `${formatKilo(p.damage)} (${pct(p.damageShare)})`)],
    ["Gold", (p) => (p.gold === null ? "—" : formatKilo(p.gold))],
    ["CS", (p) => (p.cs === null ? "—" : `${formatCount(p.cs)} (${p.csPerMin === null ? "—" : formatNumber(p.csPerMin, 1)})`)],
    ["Vision", (p) => (p.vision === null ? "—" : formatCount(p.vision))],
  ];
  return (
    <table className="w-full table-fixed text-xs tabular-nums" data-testid="performance-compare-table">
      <thead>
        <tr className="text-2xs text-fg-subtle">
          <th scope="col" className="w-2/5 text-left font-normal">
            <span className="sr-only">Figure</span>
          </th>
          <th scope="col" className="truncate text-right font-semibold text-fg">
            {nameOf(a)}
          </th>
          <th scope="col" className="truncate text-right font-semibold text-fg-muted">
            {nameOf(b)}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row" className="text-left font-normal text-fg-muted">
            Score
          </th>
          <td className="text-right font-semibold text-fg">{formatNumber(sa, 1)}</td>
          <td className="text-right text-fg">{sb === null ? "—" : formatNumber(sb, 1)}</td>
        </tr>
        {rows.map(([label, get]) => (
          <tr key={label}>
            <th scope="row" className="truncate text-left font-normal text-fg-muted">
              {label}
            </th>
            <td className="text-right text-fg">{get(a)}</td>
            <td className="text-right text-fg">{get(b)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
