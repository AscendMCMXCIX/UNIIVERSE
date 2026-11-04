"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { timeAgo } from "@/lib/format";
import { toast } from "@/components/ui/toast";
import { catchUpFiguresAction, refreshMatchesAction } from "@/server/actions/match-history";
import { REFRESH_COOLDOWN_SECONDS } from "@/domain/refresh";
import { REFRESH_TOAST, refreshNote, waitText, type RefreshTone } from "./refresh-note";

/*
  A player's Refresh, one at a time, wherever it was pressed (components/ui/data-status.tsx,
  RefreshButton). The run lives here, outside the page, so it carries on when the profile switches tab:
  the next tab's Refresh shows it still running and announces its result. A second press joins the
  run already going, and a press during the server's cooldown is answered here, without asking it.

  A run is the profile's Refresh in two steps (server/actions/match-history.ts):
    1. the player's linked accounts are read from Riot now (new games, rank and mastery);
    2. while some older games still lack their multikill counts, a batch of them is fetched again.
  When something changed, the page on screen is read again from the server (its figures, the status
  and the caches behind them), and the result is announced once the new figures are shown.
*/

export type RefreshStep = "games" | "multikills" | "reloading";

export interface RefreshResult {
  text: string;
  tone: RefreshTone;
  /** When it ended (ms). */
  at: number;
  newGames: boolean;
}

interface PlayerRefresh {
  /** The step running, or null. */
  step: RefreshStep | null;
  /** The last result in this visit. */
  last: RefreshResult | null;
  /** No new request before this (ms): the server's cooldown, known here. */
  waitUntil: number;
  /** A finished run waiting for the page to be read again (one mounted control does it), then announced. */
  reload: number | null;
}

const EMPTY: PlayerRefresh = { step: null, last: null, waitUntil: 0, reload: null };
const states = new Map<string, PlayerRefresh>();
const running = new Map<string, Promise<RefreshResult>>();
/** Controls on screen per player: a result with nobody to re-read the page is announced at once. */
const mounted = new Map<string, number>();
const claimed = new Set<number>();
const listeners = new Set<() => void>();
let reloads = 0;

function update(playerId: string, patch: Partial<PlayerRefresh>) {
  states.set(playerId, { ...(states.get(playerId) ?? EMPTY), ...patch });
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

function announce(result: RefreshResult, onNewGames?: { label: string; run: () => void } | null) {
  const action = result.newGames && onNewGames ? { label: onNewGames.label, onClick: onNewGames.run } : undefined;
  toast[REFRESH_TOAST[result.tone]](result.text, action ? { action } : undefined);
}

/** The page has been read again (or will not be): the run is over and its result is said. */
function finish(playerId: string, reload: number, onNewGames?: { label: string; run: () => void } | null) {
  const s = states.get(playerId);
  if (!s || s.reload !== reload) return;
  update(playerId, { step: null, reload: null });
  if (s.last) announce(s.last, onNewGames);
}

/** Starts the player's Refresh, or joins the one already running. */
function start(playerId: string): Promise<RefreshResult> {
  const already = running.get(playerId);
  if (already) return already;
  const run = (async (): Promise<RefreshResult> => {
    update(playerId, { step: "games" });
    let games: Awaited<ReturnType<typeof refreshMatchesAction>>;
    try {
      games = await refreshMatchesAction(playerId);
    } catch {
      games = { status: "failed", message: "please try again in a few minutes." };
    }
    let multikills: Awaited<ReturnType<typeof catchUpFiguresAction>> | null = null;
    if ((games.pendingFigures ?? 0) > 0) {
      update(playerId, { step: "multikills" });
      try {
        multikills = await catchUpFiguresAction(playerId);
      } catch {
        multikills = { status: "unavailable", message: "" };
      }
    }
    const note = refreshNote(games, multikills);
    const ran = games.status === "updated" || games.status === "no-new";
    const changed = ran || multikills?.status === "fetched" || multikills?.status === "complete";
    const result: RefreshResult = { text: note.text, tone: note.tone, at: Date.now(), newGames: games.status === "updated" };
    // A run that read Riot holds the accounts for the cooldown; a "recent" answer says how long is left.
    const waitUntil = Date.now() + 1000 * Math.max(note.retryInSeconds, ran ? REFRESH_COOLDOWN_SECONDS : 0);
    running.delete(playerId);
    if (changed && (mounted.get(playerId) ?? 0) > 0) update(playerId, { step: "reloading", last: result, waitUntil, reload: ++reloads });
    else {
      update(playerId, { step: null, last: result, waitUntil, reload: null });
      announce(result);
    }
    return result;
  })();
  running.set(playerId, run);
  return run;
}

/**
 * The player's Refresh as something only shown (the data status beside a section's scope line): the
 * state every control shares, without taking part in the run (the Refresh button re-reads the page
 * and announces the result).
 */
export function usePlayerRefreshState(playerId: string | null) {
  const state = React.useSyncExternalStore(subscribe, () => (playerId ? (states.get(playerId) ?? EMPTY) : EMPTY), () => EMPTY);
  return { step: state.step, last: state.last, busy: state.step !== null };
}

/**
 * The player's Refresh for one control: its state (shared with every other control for the same
 * player), and `press`, which starts it, joins it, or says when to try again. While a control is
 * on screen it re-reads the page after a run that changed something, and announces the result once
 * the new figures are in (with `onNewGames` as the notification's action after new games).
 */
export function usePlayerRefresh(playerId: string | null, onNewGames?: { label: string; run: () => void } | null) {
  const router = useRouter();
  const state = React.useSyncExternalStore(subscribe, () => (playerId ? (states.get(playerId) ?? EMPTY) : EMPTY), () => EMPTY);
  const [pending, startTransition] = React.useTransition();
  const holding = React.useRef<number | null>(null);
  const sawPending = React.useRef(false);
  const action = React.useRef(onNewGames);
  React.useEffect(() => {
    action.current = onNewGames;
  });

  React.useEffect(() => {
    if (!playerId) return;
    mounted.set(playerId, (mounted.get(playerId) ?? 0) + 1);
    return () => {
      mounted.set(playerId, Math.max(0, (mounted.get(playerId) ?? 1) - 1));
      // Leaving while the page is read again: the result is said now rather than lost.
      if (holding.current !== null) finish(playerId, holding.current);
      holding.current = null;
    };
  }, [playerId]);

  // A finished run that changed something: one control reads the page again…
  React.useEffect(() => {
    const reload = state.reload;
    if (!playerId || reload === null || claimed.has(reload)) return;
    claimed.add(reload);
    holding.current = reload;
    sawPending.current = false;
    startTransition(() => router.refresh());
    // (Should the read never start, the result is still said.)
    const fallback = window.setTimeout(() => {
      if (holding.current !== reload) return;
      holding.current = null;
      finish(playerId, reload, action.current);
    }, 15_000);
    return () => window.clearTimeout(fallback);
  }, [playerId, state.reload, router]);

  // …and says the result once the new figures are on screen.
  React.useEffect(() => {
    if (pending) {
      sawPending.current = true;
      return;
    }
    const reload = holding.current;
    if (!playerId || reload === null || !sawPending.current) return;
    holding.current = null;
    finish(playerId, reload, action.current);
  }, [pending, playerId]);

  const press = React.useCallback(() => {
    if (!playerId) return;
    const s = states.get(playerId) ?? EMPTY;
    if (s.step) return;
    const wait = Math.ceil((s.waitUntil - Date.now()) / 1000);
    if (wait > 0) {
      toast.info(`${s.last ? `Refreshed ${timeAgo(new Date(s.last.at))}` : "Checked recently"} · try again in ${waitText(wait)}`);
      return;
    }
    void start(playerId);
  }, [playerId]);

  return { step: state.step, last: state.last, busy: state.step !== null, press };
}
