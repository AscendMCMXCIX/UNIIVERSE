"use client";

import * as React from "react";
import { isPlainClick } from "@/lib/back-to-top";
import { Peek, usePeek } from "@/components/ui/peek";
import { usePathname, useSearchParams } from "next/navigation";
import { playerDetail, type ChampionsById } from "@/components/team/team-roster";
import { getPlayerPeekAction } from "@/server/actions/player-peek";
import type { PlayerPeekData } from "@/server/team/player-peek";

/*
  The player Peek on Players and Leaderboards rows (PLAN S8a; S4a's table: "a quick look without
  losing the list, and the profile still one tap away"). A row opens S4a's Peek with the player in
  the address (`?player=`): a docked panel on wider screens, a sheet on touch phones; Back closes it
  and the list does not move. Its content is the Team lineup's (playerDetail) for the player's main
  role, read on open through getPlayerPeekAction, which reapplies the profile's checks (the Players
  directory's right, the personal-use rule, and the season's figures only with view-teammate-stats).
  The row's name stays a link to the full profile. A player without a main role has no Peek: their
  row opens the profile, as before.
*/

type Loaded = { status: "ok"; data: PlayerPeekData } | { status: "not-found"; message: string };

export interface PlayerPeekRow {
  /** The player (the row's data-peek-row: where the keyboard's focus goes back to, and where up and down move it). */
  id: string;
  /** The row's Peek props (RosterRow's `peek`, or the Leaderboards row's own link). */
  href: string;
  onClick: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  selected: boolean;
}

/**
 * The Peek's state and panel for a list of players (`ids`, in the list's order, for ↑/↓ and ‹ ›):
 * `row(id)` gives a row its link's props, `panel` is the Peek to render once on the page.
 * `names`: each player's name, the panel's title while their content loads.
 */
export function usePlayerPeek({ ids, names, viewerPlayerId, canEditPlayer, lead }: { ids: readonly string[]; names: ReadonlyMap<string, string>; viewerPlayerId: string | null; /** Whose pools this viewer may edit (the profile's own rule): the Peek offers "Edit on profile". */ canEditPlayer?: (id: string) => boolean; /** What the page that opened the Peek adds at the top of its body for this player (Leaderboards: the member's multikills), from the page's own data. */ lead?: (id: string) => React.ReactNode }) {
  const peek = usePeek({ param: "player", ids });
  const [loaded, setLoaded] = React.useState<ReadonlyMap<string, Loaded>>(new Map());
  const id = peek.id;
  React.useEffect(() => {
    if (!id || loaded.has(id)) return;
    let live = true;
    getPlayerPeekAction(id).then(
      (r) => live && setLoaded((m) => new Map(m).set(id, r)),
      () => live && setLoaded((m) => new Map(m).set(id, { status: "not-found", message: "This player could not be loaded. Try again." })),
    );
    return () => {
      live = false;
    };
  }, [id, loaded]);

  // The row's address: this page's, with the player (the same on the server and in the browser).
  const pathname = usePathname();
  const search = useSearchParams();
  const hrefOf = React.useCallback(
    (rowId: string) => {
      const q = new URLSearchParams(search?.toString() ?? "");
      q.set("player", rowId);
      return `${pathname}?${q.toString()}`;
    },
    [pathname, search],
  );
  const row = React.useCallback(
    (rowId: string): PlayerPeekRow => ({
      id: rowId,
      href: hrefOf(rowId),
      onClick: (e) => {
        // A click that asks for another tab or window is the browser's.
        if (!isPlainClick(e)) return;
        e.preventDefault();
        peek.toggle(rowId, e.currentTarget);
      },
      selected: peek.id === rowId,
    }),
    [peek, hrefOf],
  );

  const result = id ? loaded.get(id) : undefined;
  const data = result?.status === "ok" ? result.data : null;
  const championsById: ChampionsById = React.useMemo(() => new Map((data?.champions ?? []).map((c) => [c.id, c])), [data]);
  const index = id ? ids.indexOf(id) : -1;
  const detail = data?.slot.player
    ? playerDetail({
        slot: data.slot,
        championsById,
        canEdit: !!canEditPlayer?.(data.slot.player.id),
        canViewProfile: true,
        profileHref: data.slot.player.id === viewerPlayerId ? "/overview" : `/players/${data.slot.player.id}`,
        editHref: data.slot.player.id === viewerPlayerId ? "/overview#champion-pools" : `/players/${data.slot.player.id}#champion-pools`,
        position: index >= 0 ? `${index + 1} of ${ids.length}` : "",
      })
    : null;
  const name = id ? (names.get(id) ?? "Player") : "";
  const panel = (
    <Peek peek={peek} label="Player" title={detail?.title ?? name} itemKey={id} hero={detail?.hero} windowSize="standard" windowHeader={detail?.hero} windowTitleId={detail ? "player-detail-title" : undefined} testId="player-peek" navTestIds={{ prev: "player-peek-prev", next: "player-peek-next" }}>
      {id && lead ? lead(id) : null}
      {detail ? (
        detail.body
      ) : result?.status === "not-found" ? (
        <p className="text-sm text-fg-muted" data-testid="player-peek-unavailable">
          {result.message}
        </p>
      ) : (
        // Its place while the player's figures load: the body's height, quiet (no spinner for a moment's wait).
        <div className="min-h-64 animate-pulse rounded-panel bg-surface-2/50 motion-reduce:animate-none" aria-busy="true" data-testid="player-peek-loading" />
      )}
    </Peek>
  );
  return { peek, row, panel };
}
