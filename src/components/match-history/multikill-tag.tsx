import { MULTIKILL_NAMES } from "@/domain/multikills";
import { cn } from "@/lib/cn";

/**
 * A game's largest multikill, quietly (Match History, Team Matches): a double in plain text, a
 * triple or quadra in the accent colour, a pentakill as a small tag.
 */
export function MultikillTag({ size, className, testId = "match-multikill" }: { size: 2 | 3 | 4 | 5; className?: string; testId?: string }) {
  return (
    <span className={cn("inline-block whitespace-nowrap text-[0.6875rem] font-semibold leading-tight", size === 5 ? "rounded bg-accent/15 px-1.5 py-px text-accent" : size >= 3 ? "text-accent" : "text-fg-muted", className)} data-testid={testId} data-size={size}>
      {MULTIKILL_NAMES[size]}
    </span>
  );
}
