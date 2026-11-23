import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { miHighCounts, miHighCursors, miHighPopulation } from "@/server/db/schema";
import type { CountDelta } from "@/domain/matchup-intel/high-elo/counts";
import type { HighEloRow } from "@/domain/matchup-intel/high-elo/lines";
import type { RiotRegion } from "@/domain/riot-platforms";

/*
  MATCHUP INTEL's high-elo tables (docs/HIGH_ELO_EVIDENCE.md, "What is stored"): the sampler's
  reads and its one write per region, and the page's read. Counts only: nothing here takes or
  returns a player, a game or a Riot ID.
*/

export interface Population {
  platform: string;
  challenger: number;
  grandmaster: number;
  master: number;
  readAt: Date;
}

export async function populations(db: Db): Promise<Map<string, Population>> {
  return new Map((await db.select().from(miHighPopulation)).map((p) => [p.platform, p]));
}

export async function savePopulation(db: Db, p: Population): Promise<void> {
  await db
    .insert(miHighPopulation)
    .values(p)
    .onConflictDoUpdate({ target: miHighPopulation.platform, set: { challenger: p.challenger, grandmaster: p.grandmaster, master: p.master, readAt: p.readAt } });
}

/** Each server's cursor (the end of its last window read), in ms. */
export async function cursors(db: Db): Promise<Map<string, number>> {
  return new Map((await db.select({ platform: miHighCursors.platform, windowEnd: miHighCursors.windowEnd }).from(miHighCursors)).map((c) => [c.platform, c.windowEnd.getTime()]));
}

/**
 * One region's visit, written at once: the server's cursor moves from `from` (what the slice read;
 * null when it had none) to `to`, and only then are its counts added. When the cursor is no longer
 * `from` (another slice read the same window) nothing is written and false comes back, so a window
 * is counted once. Counts older than `keep` (the current and previous patches) are deleted with it.
 */
export async function commitVisit(db: Db, visit: { platform: string; from: number | null; to: number; games: number; deltas: readonly CountDelta[]; keep: readonly string[] }): Promise<boolean> {
  return db.transaction(async (tx) => {
    const to = new Date(visit.to);
    let claimed: boolean;
    if (visit.from === null) {
      const inserted = await tx.insert(miHighCursors).values({ platform: visit.platform, windowEnd: to, visits: 1, games: visit.games }).onConflictDoNothing().returning({ platform: miHighCursors.platform });
      claimed = inserted.length > 0;
    } else {
      const updated = await tx
        .update(miHighCursors)
        .set({ windowEnd: to, visits: sql`${miHighCursors.visits} + 1`, games: sql`${miHighCursors.games} + ${visit.games}` })
        .where(and(eq(miHighCursors.platform, visit.platform), eq(miHighCursors.windowEnd, new Date(visit.from))))
        .returning({ platform: miHighCursors.platform });
      claimed = updated.length > 0;
    }
    if (!claimed) return false;
    const kept = visit.keep.length ? visit.deltas.filter((d) => visit.keep.includes(d.patch)) : visit.deltas;
    // In slices, so one statement never carries more than a few thousand parameters.
    for (let i = 0; i < kept.length; i += 500) {
      const chunk = kept.slice(i, i + 500);
      await tx
        .insert(miHighCounts)
        .values(chunk.map((d) => ({ patch: d.patch, region: d.region, role: d.role, champion: d.champion, opponent: d.opponent, kind: d.kind, value: d.value, n: d.n, w: d.w, w2: d.w2, ww: d.ww })))
        .onConflictDoUpdate({
          target: [miHighCounts.patch, miHighCounts.region, miHighCounts.role, miHighCounts.champion, miHighCounts.opponent, miHighCounts.kind, miHighCounts.value],
          set: { n: sql`${miHighCounts.n} + excluded.n`, w: sql`${miHighCounts.w} + excluded.w`, w2: sql`${miHighCounts.w2} + excluded.w2`, ww: sql`${miHighCounts.ww} + excluded.ww` },
        });
    }
    if (visit.keep.length) await tx.delete(miHighCounts).where(notInArray(miHighCounts.patch, [...visit.keep]));
    return true;
  });
}

/** The page's rows for one champion in one role: against every opponent, and against `opponent` where one is chosen, on the given patches, every region. */
export async function highEloRows(db: Db, input: { role: string; champion: string; opponent: string | null; patches: readonly string[] }): Promise<HighEloRow[]> {
  if (!input.patches.length) return [];
  const opponents = input.opponent ? ["", input.opponent] : [""];
  const rows = await db
    .select()
    .from(miHighCounts)
    .where(and(eq(miHighCounts.role, input.role), eq(miHighCounts.champion, input.champion), inArray(miHighCounts.opponent, opponents), inArray(miHighCounts.patch, [...input.patches])));
  return rows.map((r) => ({ patch: r.patch, region: r.region as RiotRegion, opponent: r.opponent, kind: r.kind as HighEloRow["kind"], value: r.value, n: r.n, w: r.w, w2: r.w2, ww: r.ww }));
}
