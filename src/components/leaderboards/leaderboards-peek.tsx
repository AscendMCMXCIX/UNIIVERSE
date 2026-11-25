"use client";

import * as React from "react";
import { usePlayerPeek, type PlayerPeekRow } from "@/components/players/player-peek";
import { ROW_LINK_COVER, RowLink } from "@/components/ui/data-list";
import { isPlainClick } from "@/lib/back-to-top";
import { dropOtherPeek } from "./record-game";
import { MultikillPeekBreakdown } from "./multikill-breakdown";
import type { MultikillBreakdown } from "@/server/leaderboards/recent-view";

/*
  The player Peek on the Leaderboards' member rows (PLAN S8a), led by the member's multikill score in
  short (the Score breakdown's own parts and words: multikill-breakdown.tsx, 25 Nov 2026), for a
  ranked player: the boards are drawn on the server,
  so the page's Peek lives in this provider, and each member row's press (PeekRowLink, in a row's
  `link` slot, where RowLink was) asks it for its link. The member's name stays a link to the
  profile (MemberCell's `nameHref`). On the public boards, which link nowhere, nothing of this is used.
*/

const PeekContext = React.createContext<{ row: (id: string) => PlayerPeekRow; ids: ReadonlySet<string> } | null>(null);

export function LeaderboardsPeek({ ids, names, viewerPlayerId, multikills, seasonLabel, children }: { ids: string[]; names: Array<[string, string]>; viewerPlayerId: string | null; /** Each ranked player's Score breakdown, which the Peek leads with in short on this page. */ multikills?: Record<string, MultikillBreakdown>; seasonLabel?: string; children: React.ReactNode }) {
  const nameMap = React.useMemo(() => new Map(names), [names]);
  const lead = React.useCallback((id: string) => (multikills?.[id] ? <MultikillPeekBreakdown breakdown={multikills[id]} seasonLabel={seasonLabel ?? ""} /> : null), [multikills, seasonLabel]);
  const { row, panel } = usePlayerPeek({ ids, names: nameMap, viewerPlayerId, lead });
  const value = React.useMemo(() => ({ row, ids: new Set(ids) }), [row, ids]);
  return (
    <PeekContext.Provider value={value}>
      {children}
      {panel}
    </PeekContext.Provider>
  );
}

/** A member row's press: the player Peek (a link to the row's address with `?player=`), laid over the row as RowLink is. */
export function PeekRowLink({ playerId, name, profileHref, hint, testId }: { playerId: string; name: string; /** Where the row goes without a Peek on the page (a board drawn on its own): the profile. */ profileHref: string; /** The row's tooltip, shown on hover, never read out. */ hint?: string; testId?: string }) {
  const peek = React.useContext(PeekContext);
  // No Peek on the page (a board drawn on its own), or none for this member (no main role yet): the row opens the profile.
  if (!peek || !peek.ids.has(playerId))
    return (
      <RowLink href={profileHref} prefetch={false} hint={hint}>
        {name}
      </RowLink>
    );
  const r = peek.row(playerId);
  return (
    <a
      href={r.href}
      onClick={(e) => {
        // One Peek at a time on the board: a record's game open gives way to the player (record-game.tsx).
        if (isPlainClick(e)) dropOtherPeek("match");
        r.onClick(e);
      }} aria-current={r.selected ? "true" : undefined} className={`${ROW_LINK_COVER} rounded-[inherit]`} data-row-link="" data-peek-open="" data-peek-row={playerId} data-player-id={playerId} data-selected={r.selected || undefined} data-testid={testId ?? "board-peek-open"}>
      <span className="sr-only">Quick look: {name}</span>
      {hint ? <span aria-hidden title={hint} className="absolute inset-0 rounded-[inherit]" /> : null}
    </a>
  );
}
