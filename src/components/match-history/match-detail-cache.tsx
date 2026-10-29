"use client";

import * as React from "react";
import { getMatchDetailAction, getMatchGroupsAction, getMatchRanksAction, getMatchTimelineAction } from "@/server/actions/match-history";
import type { MatchDetailResult, MatchRanksResult } from "@/server/players/match-history";
import type { MatchGroupsResult } from "@/server/matches/possible-groups";
import type { MatchTimelineResult } from "@/server/accounts/match-timeline";

/** Matches kept per list (a page of Match History is at most 25). */
const LIMIT = 30;

/**
 * Match details one list has already loaded, so a match opened again (or one prefetched as the
 * pointer went down on it) shows at once. The cache belongs to that list: it goes with it (another
 * page, another account) and is replaced whenever the list's data is (a refresh after a
 * bookmark), and nothing is stored in the browser. Only complete results are kept, and every load
 * is still checked by the server.
 */
export interface MatchDetailCache {
  load(playerId: string, matchId: string): Promise<MatchDetailResult>;
  /** The match's possible groups (loaded after its details, kept the same way). */
  groups(playerId: string, matchId: string): Promise<MatchGroupsResult>;
  /** The match's rank checks (after its details); a check left incomplete is asked again next time. */
  ranks(playerId: string, matchId: string): Promise<MatchRanksResult>;
  /** The match's timeline figures (build, lane at 10:00 and 15:00, gold difference), when a section that needs them opens. */
  timeline(playerId: string, matchId: string): Promise<MatchTimelineResult>;
}

function memo<T extends { status: string }>(fetch: (playerId: string, matchId: string) => Promise<T>, complete: (r: T) => boolean = (r) => r.status === "ok") {
  const entries = new Map<string, Promise<T>>();
  return (playerId: string, matchId: string): Promise<T> => {
    const key = `${playerId}:${matchId}`;
    const hit = entries.get(key);
    if (hit) {
      entries.delete(key);
      entries.set(key, hit);
      return hit;
    }
    const loading = fetch(playerId, matchId).then(
      (r) => {
        if (!complete(r)) entries.delete(key);
        return r;
      },
      (e: unknown) => {
        entries.delete(key);
        throw e;
      },
    );
    entries.set(key, loading);
    while (entries.size > LIMIT) entries.delete(entries.keys().next().value!);
    return loading;
  };
}

/** `onRanks`: told of every match's rank results as they arrive, so the list can show ranks the window checked. */
export function createMatchDetailCache({ onRanks }: { onRanks?: (matchId: string, result: MatchRanksResult) => void } = {}): MatchDetailCache {
  const ranks = memo(getMatchRanksAction, (r) => r.status === "ok" && !r.check.failed && !r.check.skipped);
  return {
    load: memo(getMatchDetailAction),
    groups: memo(getMatchGroupsAction),
    timeline: memo(getMatchTimelineAction),
    ranks: (playerId, matchId) =>
      ranks(playerId, matchId).then((r) => {
        onRanks?.(matchId, r);
        return r;
      }),
  };
}

export const MatchDetailCacheContext = React.createContext<MatchDetailCache | null>(null);
