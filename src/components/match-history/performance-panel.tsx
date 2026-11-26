"use client";

import type { MatchScores, PlayerScore } from "@/domain/performance-score";
import { SCORE_VERSION } from "@/domain/performance-score";
import { InfoTip } from "@/components/ui/info-tip";
import { PlacementBadge } from "@/components/ui/placement-badge";
import { formatNumber, formatOrdinal } from "@/lib/format";

/*
  The performance score of the player inspected (domain/performance-score; docs/PERFORMANCE_SCORE.md),
  as the post-game view shows it: the score, its place among the game's players ("3rd of 10") and
  the shared place badge (MVP gold, ACE violet, any other place restrained), beside the player's
  loadout, with one (i) saying how it is worked out and that it is UNIIVERSE's own score. Each row
  of the scoreboard carries its player's score and place. The score through the game (a chart under
  the scoreboard) was removed at the owner's request of 25 Nov 2026, with every calculation only it
  read; the comparison with a second player, the team averages, the strip of ten tiles and the
  written "why" went on 24 Nov 2026. Everything comes from the opened game's record and timeline,
  already loaded.
*/

export type TimelineState = "loading" | "ok" | "missing";

/** How the score is worked out, and whose it is, in two short sentences (docs/PERFORMANCE_SCORE.md, "What it is, and is not"). */
export const METHOD = "UNIIVERSE's own score, not OP.GG's: each player's figures against their role and this game's other players. 5 is average. MVP tops the winning team, ACE the losing team.";
export const METHOD_NEUTRAL = "UNIIVERSE's own score, not OP.GG's. Their role wasn't recorded, so their figures are compared with everyone's alike. 5 is average. MVP tops the winning team, ACE the losing team.";

/**
 * The inspected player's score beside their loadout: the score with its place badge, then its place
 * among the scored players and the (i). A quiet stand-in while the timeline answers (the lane at
 * 10:00 and 15:00 is one of its figures); "Not scored" where the game cannot be scored.
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
  // Two lines of fixed heights, each short enough never to wrap: the score with its place badge, then its place and the (i).
  return (
    <span className="inline-flex flex-col items-end" data-testid="inspected-score" data-state="ok" data-version={SCORE_VERSION}>
      <span className="flex h-7 items-center gap-2 whitespace-nowrap">
        <span className="text-2xl font-bold leading-none tabular-nums text-fg" data-testid="performance-value">
          {formatNumber(score.score, 1)}
        </span>
        <span className="sr-only"> performance score, </span>
        <PlacementBadge placement={{ rank: score.rank, of: scores.scored, mvp: score.mvp, ace: score.ace }} size="header" testId="performance-mark" />
      </span>
      <span className="flex h-4 items-center gap-1 whitespace-nowrap">
        <span className="text-xs leading-4 text-fg-muted" data-testid="performance-rank" aria-hidden>
          {formatOrdinal(score.rank)} of {scores.scored}
        </span>
        <InfoTip label="About the performance score" testId="performance-info" text={score.weights === "NEUTRAL" ? METHOD_NEUTRAL : METHOD} />
      </span>
    </span>
  );
}
