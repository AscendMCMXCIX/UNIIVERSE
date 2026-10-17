"use client";

import * as React from "react";
import { getMatchDetailAction } from "@/server/actions/match-history";
import type { MatchDetailResult } from "@/server/players/match-history";

/** Matches kept per list (a page of Match History is at most 25). */
const LIMIT = 30;

/**
 * Match details one list has already loaded, so a match opened again (or one prefetched as the
 * pointer went down on it) shows at once. The cache belongs to that list: it goes with it (another
 * page, another account) and is replaced whenever the list's data is (a refresh after a bookmark or
 * a Solo Queue Blocks import), and nothing is stored in the browser. Only complete results are
 * kept, and every load is still checked by the server.
 */
export interface MatchDetailCache {
  load(playerId: string, matchId: string): Promise<MatchDetailResult>;
}

export function createMatchDetailCache(): MatchDetailCache {
  const entries = new Map<string, Promise<MatchDetailResult>>();
  return {
    load(playerId, matchId) {
      const key = `${playerId}:${matchId}`;
      const hit = entries.get(key);
      if (hit) {
        entries.delete(key);
        entries.set(key, hit);
        return hit;
      }
      const loading = getMatchDetailAction(playerId, matchId).then(
        (r) => {
          if (r.status !== "ok") entries.delete(key);
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
    },
  };
}

export const MatchDetailCacheContext = React.createContext<MatchDetailCache | null>(null);
