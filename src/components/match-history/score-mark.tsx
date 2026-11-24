import { formatNumber, formatOrdinal } from "@/lib/format";
import { cn } from "@/lib/cn";

/*
  A game's performance score and place in one small mark: "3.5 · 9th", with MVP (the winning team's
  highest) in the emphasis colour and ACE (the losing team's highest) ringed, as the scoreboard's
  RankChip marks them. Quiet beside the figures it sits with: the score in the body colour, the
  place in the secondary grey, both at the smallest text size. Match History's collapsed cards show
  it (match-history-view), with the same score and place the opened game shows (the card's score is
  computed by the same functions: domain/performance-inputs, docs/PERFORMANCE_SCORE.md); the
  scoreboard may use it too. The words a screen reader hears are scoreWords'.
*/

export interface ScoreMarkScore {
  score: number;
  rank: number;
  /** How many players were scored (a removed player is not). */
  of: number;
  mvp: boolean;
  ace: boolean;
}

/** The mark's words for a screen reader and a label: "Performance score 3.5, 9th of 10, MVP". */
export function scoreWords(s: ScoreMarkScore): string {
  return `Performance score ${formatNumber(s.score, 1)}, ${formatOrdinal(s.rank)} of ${s.of}${s.mvp ? ", MVP" : s.ace ? ", ACE" : ""}`;
}

/** MVP's and ACE's look, the scoreboard's (RankChip): the emphasis colour, and a ring. */
export const MVP_TONE = "bg-accent-2/25 font-bold text-fg ring-1 ring-inset ring-accent-2/60";
export const ACE_TONE = "bg-fg/10 font-bold text-fg ring-1 ring-inset ring-fg/35";

export function ScoreMark({ score, className, dense = false, testId = "score-mark" }: { score: ScoreMarkScore; className?: string; /** No taller than its text (a line squeezed under another, as on a narrow match card). */ dense?: boolean; testId?: string }) {
  const mark = score.mvp ? "MVP" : score.ace ? "ACE" : null;
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap text-2xs font-normal tabular-nums", dense ? "leading-none" : "leading-tight", className)} data-testid={testId} data-score={score.score} data-rank={score.rank} data-of={score.of} data-mvp={score.mvp || undefined} data-ace={score.ace || undefined}>
      <span className="sr-only">{scoreWords(score)}</span>
      <span className="inline-flex items-center gap-1" aria-hidden>
        <span className="font-semibold text-fg">{formatNumber(score.score, 1)}</span>
        <span className="text-fg-subtle">·</span>
        <span className="text-fg-muted">{formatOrdinal(score.rank)}</span>
        {mark ? <span className={cn("rounded-full px-1", score.mvp ? MVP_TONE : ACE_TONE)}>{mark}</span> : null}
      </span>
    </span>
  );
}
