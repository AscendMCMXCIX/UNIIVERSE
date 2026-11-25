import { formatNumber, formatOrdinal } from "@/lib/format";
import { cn } from "@/lib/cn";
import { PlacementBadge, type Placement, type PlacementSize } from "@/components/ui/placement-badge";

/*
  A game's performance score with its place, as a collapsed game shows it before it is opened (the
  owner's requirements of 25 Nov 2026, §1): the score in the primary colour and bold, the largest
  figure of its block, with the shared place badge (components/ui/placement-badge: MVP gold, ACE
  violet, any other place restrained) beside or under it. Match History's collapsed cards (a column
  of its own right after the K/D/A on a wide card, directly under the K/D/A on a narrow one), the
  opened game's folded header, and each member's row on Team → Matches show it, with the same score
  and place the opened game shows (one calculation: domain/performance-inputs,
  docs/PERFORMANCE_SCORE.md). A game without a score keeps the same box with a quiet dash
  (ScoreMarkEmpty), so nothing moves from card to card. The words a screen reader hears are
  scoreWords'.
*/

export interface ScoreMarkScore extends Placement {
  score: number;
}

/** The mark's words for a screen reader and a label: "Performance score 3.5, 9th of 10, MVP". */
export function scoreWords(s: ScoreMarkScore): string {
  return `Performance score ${formatNumber(s.score, 1)}, ${formatOrdinal(s.rank)} of ${s.of}${s.mvp ? ", MVP" : s.ace ? ", ACE" : ""}`;
}

/** stack: the score over the badge (a wide card's column); inline: side by side (a narrow card, a header, a member's row). */
export type ScoreMarkLayout = "stack" | "inline";

const LAYOUT: Record<ScoreMarkLayout, string> = {
  stack: "flex-col items-center justify-center gap-1",
  inline: "flex-row items-center gap-1.5",
};

/** The score's size in each layout: the stack's is the card's largest figure; inline it matches the K/D/A beside it. */
const VALUE: Record<ScoreMarkLayout, string> = {
  stack: "text-xl",
  inline: "text-md",
};

/** The badge's size in each layout (a header's inline mark takes the card's). */
const BADGE: Record<ScoreMarkLayout, PlacementSize> = { stack: "card", inline: "row" };
/** An empty mark's height: the line the badge would make. */
const EMPTY_HEIGHT: Record<PlacementSize, string> = { row: "min-h-4", card: "min-h-5", header: "min-h-5" };

export function ScoreMark({ score, layout = "inline", badge = BADGE[layout], className, testId = "score-mark", badgeTestId }: { score: ScoreMarkScore; layout?: ScoreMarkLayout; badge?: PlacementSize; className?: string; testId?: string; badgeTestId?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 whitespace-nowrap", LAYOUT[layout], className)} data-testid={testId} data-score={score.score} data-rank={score.rank} data-of={score.of} data-mvp={score.mvp || undefined} data-ace={score.ace || undefined}>
      <span className="sr-only">{scoreWords(score)}</span>
      <span className={cn("font-bold leading-none tabular-nums text-fg", VALUE[layout])} aria-hidden data-testid="score-value">
        {formatNumber(score.score, 1)}
      </span>
      <PlacementBadge placement={score} size={badge} spoken={false} testId={badgeTestId} />
    </span>
  );
}

/**
 * Where a game has no score (none can be worked out, or it waits for the game's timeline): the
 * mark's box with a quiet dash, so the column keeps its width and the card its height. Read by
 * no one (the card's label says why); never `match-score`, which the Production check counts.
 */
export function ScoreMarkEmpty({ layout = "inline", badge = BADGE[layout], className, testId = "score-mark-empty" }: { layout?: ScoreMarkLayout; badge?: PlacementSize; className?: string; testId?: string }) {
  return (
    <span className={cn("inline-flex shrink-0", LAYOUT[layout], layout === "inline" && EMPTY_HEIGHT[badge], className)} aria-hidden data-testid={testId}>
      <span className={cn("font-bold leading-none text-fg-subtle", VALUE[layout])}>—</span>
    </span>
  );
}
