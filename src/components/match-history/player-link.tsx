import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";

/*
  A player's name in a completed match, shared by the match cards, Team → Matches and the match
  window. A UNIIVERSE member opens their profile here; anyone else with a known Riot ID opens their
  public OP.GG profile in a new tab (a small arrow marks it, and it sends no referrer); without
  either, the name is plain text. A member's OP.GG profile is a separate small arrow beside their
  name, for a mouse and the keyboard: on a touch screen it would be too small a target beside the
  name, so it is not drawn there (their profile's Riot Accounts tab has it, and the match window's
  "View Match History on OP.GG" for the player). Only stored data is used: no lookup happens.

  `preview`: in the dense team previews the links are for pointer and touch (tabIndex -1), so a
  keyboard still moves card by card; the same links are in the match window, in the tab order.
*/

export function PlayerLink({ memberId, opgg, label, preview = false, className, children }: { memberId: string | null; opgg: string | null; label: string; preview?: boolean; className?: string; children: React.ReactNode }) {
  const tab = preview ? -1 : undefined;
  const base = "underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";
  if (memberId) {
    const profile = (
      <Link href={`/players/${memberId}`} tabIndex={tab} className={cn(base, preview && opgg && "min-w-0 truncate", className)} title={`${label}: open their profile`} data-testid="player-link" data-link="profile">
        {children}
      </Link>
    );
    if (!opgg) return profile;
    return (
      <span className={cn("inline-flex min-w-0 max-w-full items-center align-bottom", preview ? "gap-0.5" : "gap-1")}>
        {profile}
        <a href={opgg} target="_blank" rel="noopener noreferrer" tabIndex={tab} className={cn("inline-flex shrink-0 items-center rounded-sm text-fg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:hidden", !preview && "p-0.5")} title={`${label} on OP.GG (opens in a new tab)`} data-testid="player-opgg">
          <ExternalLink className="h-2.5 w-2.5" aria-hidden />
          <span className="sr-only">{label} on OP.GG (opens in a new tab)</span>
        </a>
      </span>
    );
  }
  if (opgg)
    return (
      <a href={opgg} target="_blank" rel="noopener noreferrer" tabIndex={tab} className={cn(base, "inline-flex min-w-0 max-w-full items-center gap-0.5 align-bottom", className)} title={`${label} on OP.GG (opens in a new tab)`} data-testid="player-link" data-link="opgg">
        <span className="min-w-0 truncate">{children}</span>
        <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-50" aria-hidden />
        <span className="sr-only"> (OP.GG, opens in a new tab)</span>
      </a>
    );
  return <span className={className}>{children}</span>;
}
