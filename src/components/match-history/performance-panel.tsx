"use client";

import * as React from "react";
import type { DetailParticipant, DetailTeam } from "@/server/players/match-history";
import { EXCELLENT_AT, reasonText, SCORE_VERSION, teamAverages, trendOf, type MatchScores, type PlayerScore, type TimelinePoint } from "@/domain/performance-score";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { InfoTip } from "@/components/ui/info-tip";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatCount, formatKilo, formatNumber, formatOrdinal } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ScoreChart } from "./score-chart";
import { Fold } from "@/components/ui/fold";

/*
  The performance score of the player inspected (domain/performance-score; docs/PERFORMANCE_SCORE.md):
  the score with its place among the game's players, MVP or ACE, "Excellent" from 8.0, the trend
  word of their timeline with its sentence, and why in a sentence; each team's mean score on one
  split bar; the ten players' scores as a strip of small tiles, the winning team's first (a tile
  inspects its player); and the score through the game where the timeline has it, with a second
  player to compare on the same chart and side by side. Everything comes from the opened game's
  record and timeline, already loaded.
*/

export type TimelineState = "loading" | "ok" | "missing";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

/**
 * A place among the players, as a chip: "3rd"; MVP (violet, the emphasis colour) and ACE (ringed),
 * each by its word, never in a side's blue or red, which the scoreboard and the score panel give the
 * teams' sides (a red side can win).
 */
export function RankChip({ score, className, marks = false }: { score: Pick<PlayerScore, "rank" | "mvp" | "ace">; className?: string; /** The scoreboard's own chip: the one the page's MVP and ACE are counted by. */ marks?: boolean }) {
  return (
    <span className={cn("inline-flex h-4 items-center rounded-full px-1.5 text-2xs font-semibold leading-none tabular-nums", score.mvp ? "bg-accent-2/25 font-bold text-fg ring-1 ring-inset ring-accent-2/60" : score.ace ? "bg-fg/10 font-bold text-fg ring-1 ring-inset ring-fg/35" : "bg-surface-3 text-fg-muted", className)} data-testid={marks ? (score.mvp ? "participant-mvp" : score.ace ? "participant-ace" : "rank-chip") : "performance-mark"}>
      {score.mvp ? "MVP" : score.ace ? "ACE" : formatOrdinal(score.rank)}
    </span>
  );
}

/**
 * Why the inspected player scored as they did, in the player's own column under their name: the
 * timeline's trend word with its sentence (domain/performance-score trendOf), and the components that
 * lifted and held back the score (reasonText).
 */
export function ScoreWhy({ score, points, slot }: { score: PlayerScore | null; points: TimelinePoint[] | null; slot: number }) {
  if (!score) return null;
  const timed = points?.filter((p) => !p.final).map((p) => p.scores[slot]).filter((v): v is number => typeof v === "number") ?? [];
  const trend = trendOf(timed, score.score);
  const why = reasonText(score.reasons);
  if (!trend && !why && score.weights !== "NEUTRAL") return null;
  return (
    <p className="text-xs leading-5 text-fg-muted" data-testid="performance-why">
      {trend ? (
        <span data-testid="performance-trend" data-trend={trend.word}>
          <span className="font-semibold text-fg">{trend.word}</span>: {trend.sentence}{" "}
        </span>
      ) : null}
      {why}
      {score.weights === "NEUTRAL" ? <span className="text-fg-subtle"> Position not recorded: judged on every role&apos;s figures alike.</span> : null}
    </p>
  );
}

/**
 * On a phone, secondary content behind one fold (its window held to two screens, PLAN S6: the
 * overlay kit's budget); everywhere else shown as it is. The phone's answer comes once the page is
 * interactive (usePhone), and the game is drawn on the client after its record loads.
 */
export function PhoneFold({ phone, summary, testId, children }: { phone: boolean; summary: string; testId: string; children: React.ReactNode }) {
  if (!phone) return <>{children}</>;
  return (
    <Fold variant="row" summary={<span className="text-xs font-medium text-fg-muted">{summary}</span>} testId={testId} bodyClassName="space-y-2">
      {children}
    </Fold>
  );
}

export function PerformancePanel({ scores, points, timeline, subject, compare, onCompare, others, nameOf, teams, champ, onSelect, phone = false }: { scores: MatchScores | null; points: TimelinePoint[] | null; timeline: TimelineState; subject: DetailParticipant; compare: DetailParticipant | null; onCompare: (slot: number | null) => void; /** Everyone else in the game who can be compared (not removed), the lane opponent first. */ others: DetailParticipant[]; nameOf: (p: DetailParticipant) => string; teams: DetailTeam[]; champ: (id: string | null) => PortraitChampion; onSelect: (slot: number) => void; /** A phone: the why, the teams, the tiles and the chart behind one fold. */ phone?: boolean }) {
  const mine = scores?.players.find((p) => p.slot === subject.slot) ?? null;
  const theirs = compare ? (scores?.players.find((p) => p.slot === compare.slot) ?? null) : null;
  const series = [{ slot: subject.slot, label: nameOf(subject) }, ...(compare ? [{ slot: compare.slot, label: nameOf(compare) }] : [])];
  const options = [{ value: "", label: "No comparison" }, ...others.map((o) => ({ value: String(o.slot), label: `${nameOf(o)}${o.slot === subject.laneOpponentSlot ? " (lane opponent)" : ""}` }))];
  // The winning team first, as the result reads.
  // The scoreboard's order (the profile's team first), each team in its side's colour with its side and result in words: never a result told by the side colours.
  const ordered = teams;
  const word = (t: DetailTeam) => `${t.side === "blue" ? "Blue" : "Red"} · ${t.win ? "Victory" : "Defeat"}`;
  const sideBar = (t: DetailTeam) => (t.side === "blue" ? "bg-blue/80" : "bg-red/70");
  const sideLine = (t: DetailTeam) => (t.side === "blue" ? "border-blue/50" : "border-red/50");
  const averages = scores ? teamAverages(scores) : {};
  const [a, b] = ordered;
  const avgA = a ? averages[a.teamId] : undefined;
  const avgB = b ? averages[b.teamId] : undefined;
  const byScore = new Map(scores?.players.map((p) => [p.slot, p]) ?? []);
  return (
    <section aria-label="Performance score" className="space-y-2 rounded-panel border border-border bg-surface px-3 py-2" data-testid="performance" data-state={timeline === "loading" ? "loading" : scores ? "ok" : "none"} data-version={SCORE_VERSION}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className="label-caps">Performance score</span>
          <InfoTip label="About the performance score" testId="performance-info" text="Compared within this game only: each player's figures against the other players and their lane opponent, weighted by role. 5 is the game's average." />
          {mine && timeline !== "loading" ? (
            <span className="ml-1 flex flex-wrap items-center gap-x-1.5 gap-y-1" data-testid="performance-summary">
              <span className="text-2xl font-semibold leading-none tabular-nums text-fg" data-testid="performance-value">
                {formatNumber(mine.score, 1)}
              </span>
              <span className="sr-only">, </span>
              <span className="text-xs text-fg-muted" data-testid="performance-rank">
                {formatOrdinal(mine.rank)} of {scores!.scored}
              </span>
              {mine.mvp || mine.ace ? <RankChip score={mine} /> : null}
              {mine.score >= EXCELLENT_AT ? (
                <Badge tone="good" size="line">
                  Excellent
                </Badge>
              ) : null}
            </span>
          ) : null}
        </span>
        {others.length ? <Select value={compare ? String(compare.slot) : ""} options={options} onValueChange={(v) => onCompare(v === "" ? null : Number(v))} aria-label="Compare with another player" className="w-40 max-w-full shrink-0" data-testid="performance-compare" /> : null}
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
          <PhoneFold phone={phone} summary="Why, each player's score and the score through the game" testId="performance-fold">
          {phone ? <ScoreWhy score={mine} points={points} slot={subject.slot} /> : null}
          {/* Each team's mean score on one bar, in the scoreboard's order, each with its side and result in words. */}
          {a && b && typeof avgA === "number" && typeof avgB === "number" ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums" data-testid="performance-teams">
              <span className="shrink-0 text-fg-muted">
                {word(a)} <span className="font-semibold text-fg">{formatNumber(avgA, 1)}</span>
              </span>
              <span className="flex h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                <span className={cn("h-full", sideBar(a))} style={{ width: `${(avgA / Math.max(0.1, avgA + avgB)) * 100}%` }} />
                <span className={cn("h-full flex-1", sideBar(b))} />
              </span>
              <span className="shrink-0 text-fg-muted">
                <span className="font-semibold text-fg">{formatNumber(avgB, 1)}</span> {word(b)}
              </span>
              <span className="sr-only">: each team&apos;s mean performance score</span>
            </div>
          ) : null}
          {/* The ten players' scores, a tile each (a press inspects them), the winning team's first. */}
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2" data-testid="performance-strip">
            {ordered.map((t) => (
              // Each team's five under a hairline in its side's colour, as the scoreboard draws its side (the bar above names side and result in words).
              <ul key={t.teamId} className={cn("grid min-w-0 flex-1 basis-[13rem] grid-cols-5 gap-1 border-t-2 pt-1", sideLine(t))} aria-label={`${word(t)}: each player's score`}>
                {t.participants.map((p) => {
                  const s = byScore.get(p.slot);
                  const on = p.slot === subject.slot;
                  return (
                    <li key={p.slot} className="min-w-0">
                      {p.removed || !s ? (
                        <span className="flex h-12 items-center justify-center rounded-md bg-surface-2/50 text-2xs text-fg-subtle">
                          <span aria-hidden>—</span>
                          <span className="sr-only">Removed player, not scored</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelect(p.slot)}
                          aria-current={on ? "true" : undefined}
                          aria-label={`${nameOf(p)}, ${champ(p.championId).name}: ${formatNumber(s.score, 1)}${s.mvp ? ", MVP" : s.ace ? ", ACE" : ""}`}
                          className={cn("flex w-full flex-col items-center gap-0.5 rounded-md py-1 transition-colors focus-visible:outline-2 focus-visible:outline-accent", on ? "bg-surface-3 ring-1 ring-inset ring-accent/70" : "hover:bg-surface-2")}
                          data-testid="performance-tile"
                          data-slot={p.slot}
                        >
                          <ChampionPortrait champion={champ(p.championId)} size="xs" className="h-6 w-6 rounded" />
                          <span className={cn("text-xs font-semibold leading-none tabular-nums", "text-fg")}>{formatNumber(s.score, 1)}</span>
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            ))}
          </div>
          {points && points.length > 1 ? (
            <ScoreChart points={points} series={series} />
          ) : (
            <p className="text-xs text-fg-subtle" data-testid="performance-timeline-missing">
              {timeline === "missing" ? "Score through the game not available: this game has no stored timeline." : "Score through the game not available: the timeline's minute-by-minute record is incomplete for this game."}
            </p>
          )}
          </PhoneFold>
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
