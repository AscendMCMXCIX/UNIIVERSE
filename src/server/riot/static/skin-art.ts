import { and, asc, eq, isNotNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { championSkins, players } from "@/server/db/schema";
import { mapWithConcurrency } from "./sync";

/*
  Card artwork hygiene. Data Dragon lists chromas next to real skins (classified when skins are
  stored), some listed skins have no splash image (yet), and a few entries are the same
  illustration twice (a re-released Prestige skin, for example). Each real skin's splash is
  checked once in the background (a HEAD request: exists?, ETag and size), missing ones are
  checked again after a week (new-patch art can appear late), and saved card choices are moved off
  entries that cannot be shown. Rendering never waits on any of this.
*/

const BASE = (process.env.DDRAGON_BASE_URL ?? "https://ddragon.leagueoflegends.com").replace(/\/$/, "");
export const SPLASH_RECHECK_DAYS = 7;

export function splashUrl(championId: string, num: number, base = BASE): string {
  return `${base}/cdn/img/champion/splash/${championId}_${num}.jpg`;
}

/** Checks up to `budget` unchecked (or long-missing) real skins. Returns how many were checked. */
/** How long one check of the CDN may take (ddragon.ts bounds its reads the same way). */
export const CDN_TIMEOUT_MS = 10_000;

export async function checkSkinSplashes(db: Db, options: { budget?: number; fetchImpl?: typeof fetch; now?: Date; concurrency?: number } = {}): Promise<{ checked: number; ok: number; missing: number }> {
  const now = options.now ?? new Date();
  const fetchImpl = options.fetchImpl ?? fetch;
  const recheckBefore = new Date(now.getTime() - SPLASH_RECHECK_DAYS * 86_400_000);
  const due = await db
    .select({ championId: championSkins.championId, num: championSkins.num })
    .from(championSkins)
    .where(and(eq(championSkins.kind, "skin"), eq(championSkins.isActive, true), or(eq(championSkins.splashStatus, "unknown"), and(eq(championSkins.splashStatus, "missing"), lt(championSkins.splashCheckedAt, recheckBefore)))))
    .orderBy(asc(championSkins.splashCheckedAt), asc(championSkins.championId), asc(championSkins.num))
    .limit(options.budget ?? 300);
  let ok = 0;
  let missing = 0;
  await mapWithConcurrency(due, options.concurrency ?? 8, async (s) => {
    let status: "ok" | "missing" | null = null;
    let signature: string | null = null;
    try {
      // Bounded like every Data Dragon read: a stalled CDN must not hold the version check, and the tick behind it.
      const res = await fetchImpl(splashUrl(s.championId, s.num), { method: "HEAD", signal: AbortSignal.timeout(CDN_TIMEOUT_MS) });
      if (res.ok) {
        status = "ok";
        signature = `${res.headers.get("etag") ?? ""}|${res.headers.get("content-length") ?? ""}`;
      } else if (res.status === 403 || res.status === 404) status = "missing";
    } catch {
      // Network trouble: leave it unknown and try again next run.
    }
    if (!status) return;
    if (status === "ok") ok += 1;
    else missing += 1;
    await db.update(championSkins).set({ splashStatus: status, splashSignature: signature, splashCheckedAt: now }).where(and(eq(championSkins.championId, s.championId), eq(championSkins.num, s.num)));
  });
  return { checked: ok + missing, ok, missing };
}

/**
 * Moves saved card choices onto artwork that can be shown, keeping the same illustration where
 * one exists: a chroma → its parent skin; a duplicate image → the first skin with that image; a
 * skin whose splash is missing (and has no parent) → the default art. Only `featured_skin_num`
 * changes (not the profile version, pools or anything else). Returns how many cards moved.
 */
export async function remapSkinSelections(db: Db): Promise<number> {
  const moved = await db.execute(sql`
    WITH canonical AS (
      SELECT s.champion_id, s.num,
        CASE
          WHEN s.kind = 'chroma' AND s.parent_num IS NOT NULL THEN s.parent_num
          WHEN s.kind = 'skin' AND s.splash_status = 'ok' AND s.splash_signature IS NOT NULL THEN (
            SELECT min(d.num) FROM champion_skins d
            WHERE d.champion_id = s.champion_id AND d.kind = 'skin' AND d.splash_signature = s.splash_signature)
          WHEN s.kind = 'skin' AND s.splash_status = 'missing' AND s.num <> 0 THEN 0
          ELSE s.num
        END AS target
      FROM champion_skins s
    )
    UPDATE players p SET featured_skin_num = c.target
    FROM canonical c
    WHERE c.champion_id = p.featured_champion_id AND c.num = p.featured_skin_num AND c.target <> c.num
    RETURNING p.id`);
  const rows = (moved as unknown as { rows?: unknown[] }).rows ?? (moved as unknown as unknown[]);
  return rows.length;
}

/** For tests and diagnostics: players whose card points at a chroma (should be none after a remap). */
export async function countCardsOnChromas(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(players)
    .innerJoin(championSkins, and(eq(championSkins.championId, players.featuredChampionId), eq(championSkins.num, players.featuredSkinNum)))
    .where(and(eq(championSkins.kind, "chroma"), isNotNull(championSkins.parentNum)));
  return Number(row?.n ?? 0);
}
