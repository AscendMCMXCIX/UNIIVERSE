"use client";

import type { MatchScores, PlayerScore, TimelinePoint } from "@/domain/performance-score";
import { SCORE_VERSION } from "@/domain/performance-score";
import { InfoTip } from "@/components/ui/info-tip";
import { formatNumber, formatOrdinal } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ScoreChart } from "./score-chart";

/*
  The performance score of the player inspected (domain/performance-score; docs/PERFORMANCE_SCORE.md),
  as the post-game view shows it since the owner's brief of 24 Nov 2026: the score, its place among
  the game's players ("3rd of 10") and MVP or ACE, beside the player's loadout (ScoreSummary), with
  one (i) saying how it is worked out; and the score through the game, one line
  for that player (ScoreTimeline). The comparison with a second player, the team averages, the strip
  of ten tiles and the written "why" were removed from the view at the owner's request: each row of
  the scoreboard carries its player's score and place, and the timeline, the lane and the figures
  speak for themselves (domain/performance-score keeps trendOf and reasonText). Everything comes from
  the opened game's record and timeline, already loaded.
*/

export type TimelineState = "loading" | "ok" | "missing";

/**
 * A place among the players: "3rd" in quiet text, MVP (violet, the emphasis colour) and ACE
 * (ringed) as chips, each by its word, never in a side's blue or red, which the scoreboard gives the
 * teams' sides (a red side can win).
 */
export function RankChip({ score, className, marks = false }: { score: Pick<PlayerScore, "rank" | "mvp" | "ace">; className?: string; /** The scoreboard's own chip: the one the page's MVP and ACE are counted by. */ marks?: boolean }) {
  const chip = score.mvp || score.ace;
  return (
    <span
      className={cn(
        "inline-flex h-4 items-center text-2xs font-semibold leading-none tabular-nums",
        chip ? "rounded-full px-1.5" : "text-fg-subtle",
        score.mvp ? "bg-accent-2/25 font-bold text-fg ring-1 ring-inset ring-accent-2/60" : score.ace ? "bg-fg/10 font-bold text-fg ring-1 ring-inset ring-fg/35" : null,
        className,
      )}
      data-testid={marks ? (score.mvp ? "participant-mvp" : score.ace ? "participant-ace" : "rank-chip") : "performance-mark"}
    >
      {score.mvp ? "MVP" : score.ace ? "ACE" : formatOrdinal(score.rank)}
    </span>
  );
}

/** How the score is worked out, in one sentence (docs/PERFORMANCE_SCORE.md, "What it is, and is not"). */
const METHOD = "Compared within this game: each figure against the role's typical figure, then against the other players and the lane opponent. 0–10; 5 is average.";
const METHOD_NEUTRAL = "Compared within this game. Position not recorded, so judged on every role's figures alike, against the other players. 0–10; 5 is average.";

/**
 * The inspected player's score beside their loadout: the score with MVP or ACE, its place among the
 * scored players and the (i) ("Excellent" from 8.0 was dropped on 24 Nov 2026: the score says it). A quiet stand-in while the timeline answers (the lane
 * at 10:00 and 15:00 is one of its figures); "Not scored" where the game cannot be scored.
 */
export function ScoreSummary({ scores, score, timeline }: { scores: MatchScores | null; score: PlayerScore | null; timeline: TimelineState }) {
  if (timeline === "loading")
    return (
      <span className="inline-block h-6 w-24 animate-pulse rounded bg-surface-2 motion-reduce:animate-none" role="status" data-testid="inspected-score" data-state="loading">
        <span className="sr-only">Scoring the game</span>
      </span>
    );
  if (!scores || !score)
    return (
      <span className="text-xs text-fg-subtle" data-testid="inspected-score" data-state="none">
        <span data-testid="performance-none">Not scored</span>
      </span>
    );
  // Two lines of fixed heights, each short enough never to wrap: the score with MVP or ACE, then its place and the (i).
  return (
    <span className="inline-flex flex-col items-end" data-testid="inspected-score" data-state="ok" data-version={SCORE_VERSION}>
      <span className="flex h-6 items-center gap-1.5 whitespace-nowrap">
        <span className="text-2xl font-semibold leading-none tabular-nums text-fg" data-testid="performance-value">
          {formatNumber(score.score, 1)}
        </span>
        <span className="sr-only"> performance score, </span>
        {score.mvp || score.ace ? <RankChip score={score} /> : null}
      </span>
      <span className="flex h-4 items-center gap-1 whitespace-nowrap">
        <span className="text-xs leading-4 text-fg-muted" data-testid="performance-rank">
          {formatOrdinal(score.rank)} of {scores.scored}
        </span>
        <InfoTip label="About the performance score" testId="performance-info" text={score.weights === "NEUTRAL" ? METHOD_NEUTRAL : METHOD} />
      </span>
    </span>
  );
}

/**
 * The score through the game for the player inspected, under the scoreboard, in an area of one
 * height whatever the player or the game: the chart, or one quiet phrase where the timeline cannot
 * give it.
 */
export function ScoreTimeline({ scores, points, timeline, slot, label }: { scores: MatchScores | null; points: TimelinePoint[] | null; timeline: TimelineState; slot: number; label: string }) {
  const mine = scores?.players.find((p) => p.slot === slot) ?? null;
  return (
    <section aria-label="Performance score through the game" className="min-w-0 space-y-1" data-testid="performance" data-state={timeline === "loading" ? "loading" : scores ? "ok" : "none"} data-version={SCORE_VERSION}>
      <div className="flex items-center gap-1 text-2xs leading-4 text-fg-subtle">
        <span className="font-semibold uppercase tracking-label">Score through the game</span>
        <InfoTip label="About the score through the game" testId="performance-chart-info" text="Each point scores what had happened by then; the end is the final score, from the whole record." />
      </div>
      {/* One height whoever is inspected: the drawing 88px beside a desktop's scoreboard (from 56rem), 64px elsewhere (a tablet's grid, a phone's page), its minutes under it. */}
      <div className="min-h-22 @min-[56rem]/pg:min-h-28" data-testid="performance-chart-area">
        {timeline === "loading" ? (
          <div role="status" className="h-16 animate-pulse rounded-md bg-surface-2 motion-reduce:animate-none @min-[56rem]/pg:h-22">
            <span className="sr-only">Scoring the game</span>
          </div>
        ) : mine && points && points.length > 1 ? (
          <ScoreChart points={points} slot={slot} label={label} plotClassName="h-16 @min-[56rem]/pg:h-22" />
        ) : (
          <p className="text-xs text-fg-subtle" data-testid="performance-timeline-missing">
            {!mine ? "Not scored" : timeline === "missing" ? "Timeline not available for this game" : "Minute-by-minute record incomplete for this game"}
          </p>
        )}
      </div>
    </section>
  );
}
