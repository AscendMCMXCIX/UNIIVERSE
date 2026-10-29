import { rankShortLabel, type ParticipantRank } from "@/domain/known-rank";
import { cn } from "@/lib/cn";

/** Each ranked tier's text colour (globals.css --color-tier-*), as literal class names so Tailwind keeps them. */
const TIER_TEXT: Record<string, string> = {
  IRON: "text-tier-iron",
  BRONZE: "text-tier-bronze",
  SILVER: "text-tier-silver",
  GOLD: "text-tier-gold",
  PLATINUM: "text-tier-platinum",
  EMERALD: "text-tier-emerald",
  DIAMOND: "text-tier-diamond",
  MASTER: "text-tier-master",
  GRANDMASTER: "text-tier-grandmaster",
  CHALLENGER: "text-tier-challenger",
};

/**
 * A player's rank in a collapsed match card (domain/known-rank rankShortLabel): "E2" in its tier's
 * colour when it is the rank around the game, a raised "f" or "s" when it is their Flex or Solo/Duo
 * rank rather than the match's own queue, "Unr" when a check found no ranked entry, and nothing
 * when nothing was read. One read away from the game (later, or before it) or over a month ago is
 * written in the plain caption colour. The full statement (queue, rank, and when it was read
 * against the game) is on hover; screen readers get the rank in the card's description instead (see
 * TeamComposition).
 */
export function RankShort({ rank, queueId, className }: { rank: ParticipantRank; queueId: number | null; className?: string }) {
  const label = rankShortLabel(rank, queueId);
  if (!label.text) return null;
  const colour = label.tier && !label.old && label.aroundGame !== false ? (TIER_TEXT[label.tier] ?? "text-fg-muted") : "text-fg-subtle";
  return (
    <span className={cn("shrink-0 whitespace-nowrap font-semibold tabular-nums", colour, className)} title={label.title} aria-hidden data-testid="slot-rank" data-state={rank.state} data-tier={label.tier ?? undefined} data-queue={label.queueMark ?? undefined} data-timing={rank.timing ?? undefined}>
      {label.text}
      {/* Top-aligned rather than superscript, so it never makes the line taller; in the caption colour, as a note on the rank. */}
      {label.queueMark ? <span className="ml-px align-top text-4xs font-medium leading-none text-fg-subtle">{label.queueMark}</span> : null}
    </span>
  );
}
