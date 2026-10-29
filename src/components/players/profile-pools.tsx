"use client";

import * as React from "react";
import type { MatchupsData } from "@/server/players/matchups";
import type { PickerChampion } from "@/components/champions/types";
import type { PortraitChampion } from "@/components/champion-portrait";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { ChampionWindow, useChampionWindow, type ChampionWindowScope } from "./champion-window";

/**
 * Roles & champion pools with the profile's champion window: a pool champion opens the same window
 * as All Champions (Overview and Matchups, in this page's season, mode and account, its lane data
 * loaded by the server for the champion in the address), in the role of the pool it sits in. The
 * editor itself is unchanged: dragging reorders, × removes, Add adds; a click on a card opens it.
 * Each card links to the window's address, so a click before the page is interactive still opens it.
 * Without permission to see the player's statistics, the cards stay names only and open nothing.
 */
export function ProfilePools({ editor, scope, detail, championsById, playerId, inspect }: { editor: Omit<React.ComponentProps<typeof ProfileEditor>, "onInspect" | "inspectHref" | "champions"> & { champions: PickerChampion[] }; scope: ChampionWindowScope; detail: MatchupsData | null; championsById: Record<string, PortraitChampion>; playerId: string; inspect: boolean }) {
  const win = useChampionWindow({ championKey: "champ" });
  return (
    <>
      <ProfileEditor {...editor} onInspect={inspect ? (id, role) => win.open(id, role) : undefined} inspectHref={inspect ? win.hrefFor : undefined} />
      {inspect ? <ChampionWindow state={win} data={scope} detail={detail} championsById={championsById} playerId={playerId} /> : null}
    </>
  );
}
