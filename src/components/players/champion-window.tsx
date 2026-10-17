"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Role } from "@/domain/roles";
import { isGameRole } from "@/domain/season-stats";
import type { OverviewCard, PlayerOverviewData } from "@/server/players/overview";
import type { MatchupsData } from "@/server/players/matchups";
import type { PortraitChampion } from "@/components/champion-portrait";
import { ChampionDetail, type ChampionSelection, type ChampionTab, type RefineChange } from "./champion-detail";

/*
  The champion window's state, shared by every place that opens it (All Champions, Roles &
  champion pools): it lives in the URL (champion, the role it was opened in, the view, the
  opponent), so it can be linked and Back closes it, and the page's server render loads its lane
  data for exactly that selection (getPlayerMatchups), in the page's own season, mode and account.
  One window, one data path: no second champion popup and no second query.
*/

/** The window's URL parameters (the champion's key is "champion", or "champ" where "champion" is already a filter). */
const windowKeys = (championKey: string) => [championKey, "crole", "tab", "vs"];

export function selectionFrom(sp: URLSearchParams, championKey = "champion"): ChampionSelection | null {
  const championId = sp.get(championKey);
  if (!championId) return null;
  const role = sp.get("crole");
  return { championId, role: isGameRole(role) ? role : null, tab: sp.get("tab") === "matchups" ? "matchups" : "overview", vs: sp.get("vs") };
}

/** The row a champion window describes: its role's row, or the champion's most played one. */
export function cardFor(rows: readonly OverviewCard[], sel: ChampionSelection): OverviewCard | null {
  const own = rows.filter((c) => c.championId === sel.championId);
  return (sel.role ? own.find((c) => c.role === sel.role) : null) ?? [...own].sort((a, b) => b.selected.games - a.selected.games)[0] ?? null;
}

export function useChampionWindow({ championKey = "champion" }: { championKey?: string } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const urlKey = sp.toString();
  const [sel, setSel] = React.useState<ChampionSelection | null>(() => selectionFrom(new URLSearchParams(urlKey), championKey));
  // The address wins whenever it changes (Back, a link, a new filter): the window follows it.
  const [seenKey, setSeenKey] = React.useState(urlKey);
  if (seenKey !== urlKey) {
    setSeenKey(urlKey);
    setSel(selectionFrom(new URLSearchParams(urlKey), championKey));
  }
  const [pending, startTransition] = React.useTransition();
  // Opened from this page: closing goes back in history (so Back never reopens it).
  const pushed = React.useRef(false);
  const urlWith = (changes: Record<string, string | null>) => {
    const q = new URLSearchParams(urlKey);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    return `${pathname}${q.size ? `?${q.toString()}` : ""}`;
  };
  /** The window's own address: a link to it opens the window even before the page is interactive. */
  const hrefFor = (championId: string, role: Role | null) => urlWith({ [championKey]: championId, crole: role, tab: null, vs: null });
  const open = (championId: string, role: Role | null) => {
    setSel({ championId, role, tab: "overview", vs: null });
    pushed.current = true;
    startTransition(() => router.push(hrefFor(championId, role), { scroll: false }));
  };
  const close = () => {
    setSel(null);
    if (pushed.current) {
      pushed.current = false;
      router.back();
    } else startTransition(() => router.replace(urlWith(Object.fromEntries(windowKeys(championKey).map((k) => [k, null]))), { scroll: false }));
  };
  const setTab = (tab: ChampionTab) => {
    setSel((s) => (s ? { ...s, tab } : s));
    // The view needs no new data: only the address changes.
    window.history.replaceState(null, "", urlWith({ tab: tab === "matchups" ? "matchups" : null }));
  };
  const setVs = (vs: string) => {
    setSel((s) => (s ? { ...s, vs, tab: "matchups" } : s));
    startTransition(() => router.replace(urlWith({ vs, tab: "matchups" }), { scroll: false }));
  };
  const refine = (c: RefineChange) => {
    const next: Record<string, string | null> = {};
    if (c.season !== undefined) next.season = String(c.season);
    if (c.mode !== undefined) next.mode = c.mode;
    if (c.account !== undefined) next.account = c.account;
    startTransition(() => router.replace(urlWith(next), { scroll: false }));
  };
  return { sel, pending, hrefFor, open, close, setTab, setVs, refine };
}

/** The window itself, for a page that holds the player's overview and the server's lane data. */
/** What the window needs from the player's overview (the page's scope and its champions). */
export type ChampionWindowScope = Pick<PlayerOverviewData, "topChampions" | "season" | "seasons" | "currentSeason" | "mode" | "filter" | "accountOptions">;

export function ChampionWindow({ state, data, detail, championsById, playerId }: { state: ReturnType<typeof useChampionWindow>; data: ChampionWindowScope; detail: MatchupsData | null; championsById: Record<string, PortraitChampion>; playerId: string }) {
  const { sel } = state;
  if (!sel) return null;
  // The server's lane data, only once it is for the window on screen.
  const windowData = detail && detail.champion === sel.championId && (detail.role ?? null) === (sel.role ?? null) ? detail : null;
  return (
    <ChampionDetail
      playerId={playerId}
      sel={sel}
      card={cardFor(data.topChampions, sel)}
      data={windowData}
      scope={{ season: data.season, seasons: data.seasons, currentSeason: data.currentSeason, mode: data.mode, accountId: data.filter.accountId ?? null, accounts: data.accountOptions }}
      championsById={championsById}
      pending={state.pending}
      onTab={state.setTab}
      onVs={state.setVs}
      onRefine={state.refine}
      onClose={state.close}
    />
  );
}
