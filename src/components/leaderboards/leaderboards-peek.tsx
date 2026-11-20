"use client";

import * as React from "react";
import { usePlayerPeek, type PlayerPeekRow } from "@/components/players/player-peek";
import { RowLink } from "@/components/ui/data-list";

/*
  The player Peek on the Leaderboards' member rows (PLAN S8a): the boards are drawn on the server,
  so the page's Peek lives in this provider, and each member row's press (PeekRowLink, in a row's
  `link` slot, where RowLink was) asks it for its link. The member's name stays a link to the
  profile (MemberCell's `nameHref`). On the public boards, which link nowhere, nothing of this is used.
*/

const PeekContext = React.createContext<((id: string) => PlayerPeekRow) | null>(null);

export function LeaderboardsPeek({ ids, names, viewerPlayerId, children }: { ids: string[]; names: Array<[string, string]>; viewerPlayerId: string | null; children: React.ReactNode }) {
  const nameMap = React.useMemo(() => new Map(names), [names]);
  const { row, panel } = usePlayerPeek({ ids, names: nameMap, viewerPlayerId });
  return (
    <PeekContext.Provider value={row}>
      {children}
      {panel}
    </PeekContext.Provider>
  );
}

/** A member row's press: the player Peek (a link to the row's address with `?player=`), laid over the row as RowLink is. */
export function PeekRowLink({ playerId, name, profileHref, hint, testId }: { playerId: string; name: string; /** Where the row goes without a Peek on the page (a board drawn on its own): the profile. */ profileHref: string; /** The row's tooltip, shown on hover, never read out. */ hint?: string; testId?: string }) {
  const rowOf = React.useContext(PeekContext);
  if (!rowOf)
    return (
      <RowLink href={profileHref} prefetch={false} hint={hint}>
        {name}
      </RowLink>
    );
  const r = rowOf(playerId);
  return (
    <a href={r.href} onClick={r.onClick} aria-current={r.selected ? "true" : undefined} className="absolute inset-0 z-[1] rounded-[inherit] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent" data-row-link="" data-peek-open="" data-player-id={playerId} data-selected={r.selected || undefined} data-testid={testId ?? "board-peek-open"}>
      <span className="sr-only">Quick look: {name}</span>
      {hint ? <span aria-hidden title={hint} className="absolute inset-0 rounded-[inherit]" /> : null}
    </a>
  );
}
