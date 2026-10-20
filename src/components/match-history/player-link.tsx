import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";

/*
  A player's name in a completed match, shared by the match cards, Team → Matches and the match
  window. A UNIIVERSE member opens their profile here; anyone else with a known Riot ID opens their
  public OP.GG profile in a new tab (a small arrow marks it, and it sends no referrer); without
  either, the name is plain text. In the match window a member's OP.GG profile is a separate small
  link beside their name. Only stored data is used: no lookup happens.

  `preview`: in the dense team previews the links are for pointer and touch (tabIndex -1), so a
  keyboard still moves card by card; the same links are in the match window, in the tab order.
*/

export function PlayerLink({ memberId, opgg, label, preview = false, className, children }: { memberId: string | null; opgg: string | null; label: string; preview?: boolean; className?: string; children: React.ReactNode }) {
  const tab = preview ? -1 : undefined;
  const base = "underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";
  if (memberId) {
    const profile = (
      <Link href={`/players/${memberId}`} tabIndex={tab} className={cn(base, className)} title={`${label}: open their profile`} data-testid="player-link" data-link="profile">
        {children}
      </Link>
    );
    if (!opgg || preview) return profile;
    return (
      <span className="inline-flex min-w-0 max-w-full items-center gap-1 align-bottom">
        {profile}
        <a href={opgg} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center rounded-sm p-0.5 text-fg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-accent" title={`${label} on OP.GG (opens in a new tab)`} data-testid="player-opgg">
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
