"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { ChampionRow } from "@/server/players/overview";
import type { ChampionPreviewData, PairingGamesData, PreviewScope } from "@/server/players/champion-preview";
import type { PreviewResult } from "@/server/actions/champion-preview";
import { getChampionPreviewAction, getPairingGamesAction } from "@/server/actions/champion-preview";
import type { Role } from "@/domain/roles";
import { isGameRole } from "@/domain/season-stats";

/*
  All Champions' preview: its place in the address and in history, and its data (docs/MATCHUPS.md).

  The address holds it (?champion=&crole=[&vs=]): the first open pushes one history entry;
  switching champion, position or opponent replaces it; closing goes Back when this page pushed it,
  so Back always closes and never walks through champions or positions. Nothing re-renders the page:
  the address changes through the History API, and the content comes from two light server actions,
  kept per page.
*/

export interface PreviewSelection {
  championId: string;
  role: Role | null;
  vs: string | null;
}

/** The preview's address parameters (old links' `tab` included, so closing drops it). */
export const PREVIEW_KEYS: readonly string[] = ["champion", "crole", "vs", "tab"];

export function previewFrom(sp: URLSearchParams): PreviewSelection | null {
  const championId = sp.get("champion");
  if (!championId) return null;
  const role = sp.get("crole");
  return { championId, role: isGameRole(role) ? role : null, vs: sp.get("vs") };
}

/**
 * The champion's row a selection names, and the position it shows: the one in the address where
 * the champion was played in it within the filters, else its most played one (null for a champion
 * no game of which records a position). Null when the champion is not on the list.
 */
export function selectionFor(rows: readonly ChampionRow[], sel: PreviewSelection): { row: ChampionRow; role: Role | null } | null {
  const row = rows.find((c) => c.championId === sel.championId);
  if (!row) return null;
  return { row, role: (sel.role && row.roles.some((r) => r.role === sel.role) ? sel.role : null) ?? row.role };
}

/** The preview's place in the address and in history. */
export function usePreviewAddress() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const urlKey = sp.toString();
  const sel = React.useMemo(() => previewFrom(new URLSearchParams(urlKey)), [urlKey]);
  // Opened from this page: closing goes back in history (so Back never reopens it).
  const pushed = React.useRef(false);
  const urlWith = React.useCallback(
    (changes: Record<string, string | null>) => {
      const q = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(changes)) {
        if (v === null) q.delete(k);
        else q.set(k, v);
      }
      return `${pathname}${q.size ? `?${q.toString()}` : ""}`;
    },
    [pathname],
  );
  const show = (championId: string, role: Role | null) => {
    const url = urlWith({ champion: championId, crole: role, vs: null, tab: null });
    // From the address as it is now, not the last render's: two quick clicks push once.
    if (new URLSearchParams(window.location.search).has("champion")) window.history.replaceState(null, "", url);
    else {
      pushed.current = true;
      window.history.pushState(null, "", url);
    }
  };
  const setVs = (vs: string | null) => window.history.replaceState(null, "", urlWith({ vs, tab: null }));
  // Another position of the same champion: its own opponents, so the opponent goes with the old one.
  const setRole = (role: Role) => window.history.replaceState(null, "", urlWith({ crole: role, vs: null, tab: null }));
  const close = () => {
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else window.history.replaceState(null, "", urlWith(Object.fromEntries(PREVIEW_KEYS.map((k) => [k, null]))));
  };
  // Back closed it: a later open pushes again.
  React.useEffect(() => {
    if (!sel) pushed.current = false;
  }, [sel]);
  return { sel, show, setVs, setRole, close };
}

type Loader<T> = (key: string, run: () => Promise<PreviewResult<T>>) => Promise<PreviewResult<T>>;

/** The answers kept for one generation of the list's data, seeded with the server's. */
export interface AnswerCache<T> {
  generation: unknown;
  store: Map<string, Promise<PreviewResult<T>>>;
}

/**
 * The cache for `generation` (the list's data as the server last rendered it): the one in hand while
 * the data is the same, so switching back to a champion asks nothing again; a new one, seeded with
 * the new render's answers, once a server render brings new data (a refresh after new games: the
 * page's FreshnessWatcher). Kept across refreshes, an answer would disagree with the refreshed figures
 * above it (the opponents and "Known in X of Y games" against "N games · W L").
 */
export function cacheFor<T>(current: AnswerCache<T> | null, generation: unknown, seed: Array<[string, T]>): AnswerCache<T> {
  if (current && current.generation === generation) return current;
  return { generation, store: new Map(seed.map(([k, data]) => [k, Promise.resolve({ status: "ok", data } as PreviewResult<T>)])) };
}

/** The answer for `key`: the one kept, or `run`'s, kept only when it is an answer (a refusal or a failed load is asked again next time). */
export function answerFrom<T>(cache: AnswerCache<T>, key: string, run: () => Promise<PreviewResult<T>>): Promise<PreviewResult<T>> {
  const { store } = cache;
  const hit = store.get(key);
  if (hit) return hit;
  const p = run().catch(() => ({ status: "not-found", message: "This champion's games could not be loaded." }) as PreviewResult<T>);
  store.set(key, p);
  void p.then((r) => {
    if (r.status !== "ok" && store.get(key) === p) store.delete(key);
  });
  return p;
}

/** One answer per key while the list's data stays the same (cacheFor). */
function useCache<T>(seed: Array<[string, T]>, generation: unknown): Loader<T> {
  const [held, setHeld] = React.useState(() => cacheFor<T>(null, generation, seed));
  const cache = cacheFor(held, generation, seed);
  if (cache !== held) setHeld(cache);
  return React.useCallback((key, run) => answerFrom(cache, key, run), [cache]);
}

export type ListScope = Omit<PreviewScope, "champion" | "role">;
const keyOf = (scope: ListScope, champion: string, role: Role, vs?: string) => JSON.stringify([scope.season, scope.mode, scope.account, champion, role, vs ?? null]);

/**
 * The preview's data: loaded through the actions, kept while the list's data stays the same, seeded
 * by the server's render. `generation` is that data as rendered (a refresh brings a new one).
 */
export function usePreviewData(playerId: string, scope: ListScope, initial: { preview: ChampionPreviewData | null; pairing: PairingGamesData | null }, generation: unknown) {
  const previews = useCache<ChampionPreviewData>(initial.preview ? [[keyOf(scope, initial.preview.champion, initial.preview.role), initial.preview]] : [], generation);
  const pairings = useCache<PairingGamesData>(initial.pairing ? [[keyOf(scope, initial.pairing.champion, initial.pairing.role, initial.pairing.vs), initial.pairing]] : [], generation);
  const preview = React.useCallback((champion: string, role: Role) => previews(keyOf(scope, champion, role), () => getChampionPreviewAction(playerId, { ...scope, champion, role })), [previews, playerId, scope]);
  const pairing = React.useCallback((champion: string, role: Role, vs: string) => pairings(keyOf(scope, champion, role, vs), () => getPairingGamesAction(playerId, { ...scope, champion, role }, vs)), [pairings, playerId, scope]);
  return React.useMemo(() => ({ preview, pairing, initial, generation, scopeKey: JSON.stringify([scope.season, scope.mode, scope.account]) }), [preview, pairing, initial, generation, scope]);
}

/**
 * An answer for exactly this key, or null while it loads. A new generation of the list's data asks
 * again (the refreshed render's answer, or the action), showing the answer it has until then.
 */
export function useAnswer<T>(key: string | null, generation: unknown, load: (() => Promise<PreviewResult<T>>) | null, seed: T | null): PreviewResult<T> | null {
  const [got, setGot] = React.useState<{ key: string; result: PreviewResult<T> } | null>(() => (key && seed ? { key, result: { status: "ok", data: seed } } : null));
  React.useEffect(() => {
    if (!key || !load) return;
    let live = true;
    void load().then((result) => {
      if (live) setGot({ key, result });
    });
    return () => {
      live = false;
    };
    // The key and the generation name the request; `load` is rebuilt with them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, generation]);
  return got && got.key === key ? got.result : null;
}


/** The preview's data, as usePreviewData gives it. */
export type PreviewData = ReturnType<typeof usePreviewData>;
