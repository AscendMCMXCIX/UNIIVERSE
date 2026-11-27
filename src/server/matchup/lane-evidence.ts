import { unstable_cache, revalidateTag } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { getDbHandle } from "@/server/db/client";
import { staticDigests } from "@/server/db/schema";
import { hasPermission, type Session } from "@/server/auth/permissions";
import { currentSeason } from "@/server/accounts/sync";
import { getCurrentPatch } from "@/server/repositories/champions";
import { log } from "@/server/observability/log";
import { LANE_FORMAT, laneEvidence, lastRecordedChange, type LaneEvidenceView, type LaneGameRow } from "@/domain/matchup/lane-evidence";
import type { Role } from "@/domain/roles";
import { readLaneGames } from "./lane-query";

/*
  Matchup Intel's "In the team's matches" for one pair, built on the server (docs/MATCHUP_INTEL.md):
  who may see it, the season, Riot's latest recorded change to either champion, the games (one
  statement, lane-query.ts, cached) and the evidence by queue (domain/matchup/lane-evidence).

  - Only for accounts holding "view-teammate-stats", as the builds: the team members' own games are
    among them, and a pair only one member plays would show that member's lane results. Anyone else
    gets nothing: no block, no words (the band then shows its two other blocks).
  - The games are cached for CACHE_SECONDS in Next's data cache, shared by every instance, keyed by
    the unordered pair, the role, the season and LANE_FORMAT, so Swap and a queue change read
    nothing (every queue is in the one entry). Tagged LANE_CACHE_TAG, dropped by an erasure
    (forgetLaneMatchups, server/privacy/after-erasure.ts). Only the production database is cached
    so: the in-memory demo is counted each time (the builds' rule).
  - A failure is the "unavailable" view: one honest line, logged, never a failed page.
*/

export const LANE_CACHE_TAG = "lane-matchups";
const CACHE_SECONDS = 6 * 3600;

/** Whether counts go through Next's data cache: inside the Next server, on the production database only. */
async function sharedCacheFor(db: Db): Promise<boolean> {
  if (!process.env.NEXT_RUNTIME) return false;
  try {
    const handle = await getDbHandle();
    return handle.db === db && handle.mode === "postgres";
  } catch {
    return false;
  }
}

export interface LaneEvidenceInput {
  /** The first column's champion (the one played) and the second's (the lane opponent), Data Dragon ids and names. */
  a: { id: string; name: string };
  b: { id: string; name: string };
  role: Role;
}

/** The pair's games, cached (Swap reads the same entry). */
async function gamesOf(db: Db, lo: string, hi: string, role: Role, season: number): Promise<LaneGameRow[]> {
  const read = () => readLaneGames(db, { lo, hi, role, season });
  return (await sharedCacheFor(db)) ? unstable_cache(read, ["lane-matchups", String(LANE_FORMAT), role, lo, hi, String(season)], { revalidate: CACHE_SECONDS, tags: [LANE_CACHE_TAG] })() : read();
}

/**
 * The block's evidence for this account, or null where nothing is shown (no permission). Never
 * throws: a failure is the "unavailable" view.
 */
export async function loadLaneEvidence(db: Db, session: Session | null, input: LaneEvidenceInput): Promise<LaneEvidenceView | null> {
  if (!hasPermission(session, "view-teammate-stats")) return null;
  if (input.a.id === input.b.id) return { status: "mirror" };
  try {
    const [season, current] = await Promise.all([currentSeason(db), getCurrentPatch(db)]);
    const [lo, hi] = input.a.id < input.b.id ? [input.a.id, input.b.id] : [input.b.id, input.a.id];
    const [rows, digests] = await Promise.all([
      gamesOf(db, lo, hi, input.role, season),
      db.select({ patch: staticDigests.patch, key: staticDigests.key, hash: staticDigests.hash }).from(staticDigests).where(and(eq(staticDigests.kind, "champion"), inArray(staticDigests.key, [lo, hi]))),
    ]);
    const recorded = lastRecordedChange(digests, [input.a.id, input.b.id], [input.a.name, input.b.name]);
    return laneEvidence(rows, { a: input.a.id, b: input.b.id, role: input.role, season, currentPatch: current && !current.isFixture ? current.patch : null, recorded });
  } catch (err) {
    log("error", "matchup.lane-evidence.failed", { role: input.role, error: err });
    return { status: "unavailable" };
  }
}

/**
 * Drops every cached game list (an erasure: the erased person's games must leave the figures now).
 * Only inside a request of the Next server; elsewhere there is no data cache to drop.
 */
export function forgetLaneMatchups(): void {
  try {
    revalidateTag(LANE_CACHE_TAG, { expire: 0 });
  } catch {
    // Outside a request of the Next server: nothing cached here.
  }
}
