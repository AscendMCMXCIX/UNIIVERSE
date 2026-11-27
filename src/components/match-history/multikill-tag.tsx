import { MULTIKILL_NAMES } from "@/domain/multikills";
import { cn } from "@/lib/cn";

/**
 * A game's largest multikill, quietly (Match History, Team Matches), on the text hierarchy (Release
 * 19, the visual review's V6): a double in the secondary grey, a triple or quadra in the primary
 * colour, a pentakill as a small neutral tag. Never the accent: it is the links' colour, and beside a
 * card's blue Victory, gold MVP and violet ACE a cyan word read as a link and as one more state.
 */
export function MultikillTag({ size, className, dense = false, testId = "match-multikill" }: { size: 2 | 3 | 4 | 5; className?: string; /** No taller than its text (a narrow match card's column, under the performance score). */ dense?: boolean; testId?: string }) {
  return (
    <span className={cn("inline-block whitespace-nowrap text-2xs font-semibold", dense ? "leading-none" : "leading-tight", size === 5 ? "rounded bg-surface-3 px-1.5 py-px text-fg" : size >= 3 ? "text-fg" : "text-fg-muted", className)} data-testid={testId} data-size={size}>
      {MULTIKILL_NAMES[size]}
    </span>
  );
}
