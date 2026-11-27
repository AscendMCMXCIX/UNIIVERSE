import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { highEloCounts, highEloCursors, highEloPopulation } from "@/server/db/schema";
import type { CountDelta } from "@/domain/high-elo/counts";
import { previousPatch } from "@/domain/champion-builds";
import { getCurrentPatch, listPatchesDesc } from "@/server/repositories/champions";

/*
  The high-elo tables (docs/HIGH_ELO_EVIDENCE.md, "What is stored"; migration 0072): the sampler's
  reads and its one write per region, the retention, and the page's read. Counts only: nothing here
  takes or returns a player, a game or a Riot ID.
*/

/** The most the counts may take on disk; a slice that finds more writes nothing ("storage cap"). */
export const HIGH_ELO_MAX_BYTES = 40 * 1024 * 1024;

export interface Population {
  platform: string;
  challenger: number;
  grandmaster: number;
  master: number;
  readAt: Date;
}

export async function populations(db: Db): Promise<Map<string, Population>> {
  return new Map((await db.select().from(highEloPopulation)).map((p) => [p.platform, p]));
}

export async function savePopulation(db: Db, p: Population): Promise<void> {
  await db
    .insert(highEloPopulation)
    .values(p)
    .onConflictDoUpdate({ target: highEloPopulation.platform, set: { challenger: p.challenger, grandmaster: p.grandmaster, master: p.master, readAt: p.readAt } });
}

/** Each server's cursor (the end of its last window read), in ms. */
export async function cursors(db: Db): Promise<Map<string, number>> {
  return new Map((await db.select({ platform: highEloCursors.platform, windowEnd: highEloCursors.windowEnd }).from(highEloCursors)).map((c) => [c.platform, c.windowEnd.getTime()]));
}

const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];

/** The counts' size on disk, with their key's index (bytes). */
export async function countsBytes(db: Db): Promise<number> {
  const [row] = rowsOf<{ bytes: number | string }>(await db.execute(sql`SELECT pg_total_relation_size('high_elo_counts') AS bytes`));
  return Number(row?.bytes ?? 0);
}

/** The patches whose counts are kept: the current one and the previous one (the page's window); none while no patch is current. */
export async function keptPatches(db: Db): Promise<string[]> {
  const current = await getCurrentPatch(db);
  if (!current) return [];
  const previous = previousPatch(current.patch, await listPatchesDesc(db));
  return [current.patch, ...(previous ? [previous] : [])];
}

/**
 * The retention (the privacy notice's "Kept"): deletes the counts of every patch but `keep`, and
 * nothing when `keep` is empty (no current patch known: never everything). It does not depend on
 * a write, on the storage cap or on the collection being on: each slice runs it before its regions
 * (so a slice over the cap still deletes), and the daily housekeeping (jobs/integrity.ts) runs it
 * whether or not the collection runs. Gives the rows deleted (a count).
 */
export async function deleteOldPatches(db: Db, keep: readonly string[]): Promise<number> {
  if (!keep.length) return 0;
  const [row] = rowsOf<{ deleted: number | string }>(
    await db.execute(sql`WITH d AS (DELETE FROM high_elo_counts WHERE patch NOT IN (${sql.join(keep.map((p) => sql`${p}`), sql`, `)}) RETURNING 1) SELECT count(*)::int AS deleted FROM d`),
  );
  return Number(row?.deleted ?? 0);
}

/** deleteOldPatches with the kept patches read from the database: the daily housekeeping's step. */
export async function pruneHighEloCounts(db: Db): Promise<number> {
  return deleteOldPatches(db, await keptPatches(db));
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The deltas in the key's own order (champion, patch, role, region, opponent, kind, value): every
 * region's transaction then locks the rows it upserts in the same order, so two regions writing the
 * same "all" rows at once wait for each other and can never deadlock.
 */
export function inKeyOrder(deltas: readonly CountDelta[]): CountDelta[] {
  return [...deltas].sort((a, b) => byText(a.champion, b.champion) || byText(a.patch, b.patch) || byText(a.role, b.role) || byText(a.region, b.region) || byText(a.opponent, b.opponent) || byText(a.kind, b.kind) || byText(a.value, b.value));
}

/**
 * One region's visit, written at once: the server's cursor moves from `from` (what the slice read;
 * null when it had none) to `to`, and only then are its counts added, in the key's order
 * (inKeyOrder). When the cursor is no longer `from` (another slice read the same window) nothing is
 * written and "taken" comes back, so a window is counted once. Counts of a patch not in `keep` (the
 * current and previous patches) are not written; deleting the older ones is the slice's
 * (deleteOldPatches), outside every region's transaction. Above HIGH_ELO_MAX_BYTES nothing is
 * written ("storage cap"), the cursor included.
 */
export async function commitVisit(db: Db, visit: { platform: string; from: number | null; to: number; games: number; deltas: readonly CountDelta[]; keep: readonly string[]; maxBytes?: number }): Promise<"written" | "taken" | "storage cap"> {
  if ((await countsBytes(db)) > (visit.maxBytes ?? HIGH_ELO_MAX_BYTES)) return "storage cap";
  const kept = inKeyOrder(visit.keep.length ? visit.deltas.filter((d) => visit.keep.includes(d.patch)) : visit.deltas);
  return db.transaction(async (tx) => {
    const to = new Date(visit.to);
    let claimed: boolean;
    if (visit.from === null) {
      const inserted = await tx.insert(highEloCursors).values({ platform: visit.platform, windowEnd: to, visits: 1, games: visit.games }).onConflictDoNothing().returning({ platform: highEloCursors.platform });
      claimed = inserted.length > 0;
    } else {
      const updated = await tx
        .update(highEloCursors)
        .set({ windowEnd: to, visits: sql`${highEloCursors.visits} + 1`, games: sql`${highEloCursors.games} + ${visit.games}` })
        .where(and(eq(highEloCursors.platform, visit.platform), eq(highEloCursors.windowEnd, new Date(visit.from))))
        .returning({ platform: highEloCursors.platform });
      claimed = updated.length > 0;
    }
    if (!claimed) return "taken" as const;
    // In slices, so one statement never carries more than a few thousand parameters; the slices
    // follow one another in the key's order too.
    for (let i = 0; i < kept.length; i += 500) {
      const chunk = kept.slice(i, i + 500);
      await tx
        .insert(highEloCounts)
        .values(chunk.map((d) => ({ champion: d.champion, patch: d.patch, role: d.role, region: d.region, opponent: d.opponent, kind: d.kind, value: d.value, n: d.n, w: d.w, w2: d.w2, ww: d.ww })))
        .onConflictDoUpdate({
          target: [highEloCounts.champion, highEloCounts.patch, highEloCounts.role, highEloCounts.region, highEloCounts.opponent, highEloCounts.kind, highEloCounts.value],
          set: { n: sql`${highEloCounts.n} + excluded.n`, w: sql`${highEloCounts.w} + excluded.w`, w2: sql`${highEloCounts.w2} + excluded.w2`, ww: sql`${highEloCounts.ww} + excluded.ww` },
        });
    }
    return "written" as const;
  });
}

/**
 * The page's rows for one champion on the window's patches, every region together and every
 * opponent: a range of the key (it leads with the champion). Totals only.
 */
export async function highEloChampionCounts(db: Db, input: { champion: string; patches: readonly string[] }): Promise<Array<{ patch: string; role: string; kind: string; value: string; n: number; w: number; w2: number; ww: number }>> {
  if (!input.patches.length) return [];
  return db
    .select({ patch: highEloCounts.patch, role: highEloCounts.role, kind: highEloCounts.kind, value: highEloCounts.value, n: highEloCounts.n, w: highEloCounts.w, w2: highEloCounts.w2, ww: highEloCounts.ww })
    .from(highEloCounts)
    .where(and(eq(highEloCounts.champion, input.champion), inArray(highEloCounts.patch, [...input.patches]), eq(highEloCounts.region, "all"), eq(highEloCounts.opponent, "")));
}
