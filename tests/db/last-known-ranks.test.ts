import { describe, expect, it } from "vitest";
import { asc, sql } from "drizzle-orm";
import { createDb } from "@/server/db/create";
import { EMBEDDED_MIGRATIONS } from "@/server/db/migrations.generated";
import { runMigrations } from "@/server/db/migrator";
import { lastKnownRanks } from "@/server/db/schema";
import { storedRankReadings } from "@/server/players/participant-ranks";
import { participantRank } from "@/domain/known-rank";

/*
  Migration 0048 copies the last-known ranks Match History shows for players outside the team out
  of the two retired sources (the Draft's enemy scouting and the ranked ladder), before those
  tables are dropped: per player, the newest rank either had, a tie going to the scouting row
  (it has a division). Unranked, undated and anonymous sightings are left out, as Match History
  never showed them, and the sources are only read. Match History then shows the same ranks.
*/

const rowsOf = <T,>(r: unknown): T[] => ((r as { rows?: T[] }).rows ?? (r as T[])) as T[];

describe("migration 0048: last-known ranks", () => {
  it("copies the newest rank of each player from both retired sources, and Match History shows the same", async () => {
    const fresh = await createDb({ mode: "pglite-memory", migrate: false });
    const db = fresh.db;
    try {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS uniiverse_migrations (tag text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
      // Everything before 0048, one transaction per migration as the migrator does.
      for (const m of EMBEDDED_MIGRATIONS.filter((m) => m.tag < "0048")) {
        await db.transaction(async (tx) => {
          for (const statement of m.statements) await tx.execute(sql.raw(statement));
          await tx.execute(sql`INSERT INTO uniiverse_migrations (tag, hash) VALUES (${m.tag}, ${m.hash})`);
        });
      }
      const [team] = rowsOf<{ id: string }>(await db.execute(sql`INSERT INTO teams (name) VALUES ('Team') RETURNING id`));
      const lineup = JSON.stringify([]);
      const roles = JSON.stringify({});
      const draft = async () => rowsOf<{ id: string }>(await db.execute(sql`INSERT INTO drafts (team_id, side, patch, lineup_snapshot, initial_assignments, current_assignments) VALUES (${team!.id}, 'blue', '16.19', ${lineup}::jsonb, ${roles}::jsonb, ${roles}::jsonb) RETURNING id`))[0]!.id;
      const d1 = await draft();
      const d2 = await draft();
      const scout = (draftId: string, role: string, puuid: string | null, tier: string | null, division: string | null, at: string | null) =>
        db.execute(sql`INSERT INTO draft_enemy_scouting (draft_id, role, riot_id, puuid, status, tier, division, fetched_at) VALUES (${draftId}, ${role}, 'Someone#OCE', ${puuid}, 'ok', ${tier}, ${division}, ${at}::timestamptz)`);
      const ladder = (puuid: string, tier: string, at: string) => db.execute(sql`INSERT INTO tracked_summoners (puuid, platform, tier, last_seen_in_league_at) VALUES (${puuid}, 'oc1', ${tier}, ${at}::timestamptz)`);
      // A: scouted twice, the later one wins; an older ladder sighting does not.
      await scout(d1, "TOP", "A", "GOLD", "II", "2026-09-10T00:00:00Z");
      await scout(d2, "TOP", "A", "PLATINUM", "IV", "2026-09-20T00:00:00Z");
      await ladder("A", "GOLD", "2026-08-01T00:00:00Z");
      // B unranked, D without a tier, an anonymous row and an undated one: not copied.
      await scout(d1, "MID", "B", "UNRANKED", null, "2026-09-10T00:00:00Z");
      await scout(d1, "ADC", "D", null, null, "2026-09-10T00:00:00Z");
      await scout(d1, "SUPPORT", null, "GOLD", "I", "2026-09-10T00:00:00Z");
      await scout(d2, "MID", "G", "GOLD", "I", null);
      // C: scouting and ladder on the same day: the scouting row, with its division.
      await scout(d1, "JUNGLE", "C", "DIAMOND", "I", "2026-10-01T00:00:00Z");
      await ladder("C", "MASTER", "2026-10-01T00:00:00Z");
      // E: only on the ladder. F: the ladder sighting is newer than the scouting.
      await ladder("E", "EMERALD", "2026-10-05T00:00:00Z");
      await scout(d2, "JUNGLE", "F", "GOLD", "I", "2026-09-01T00:00:00Z");
      await ladder("F", "DIAMOND", "2026-09-15T00:00:00Z");

      // The held drops remove the sources; marking them (and what follows) applied keeps them here to compare.
      const drop = EMBEDDED_MIGRATIONS.find((m) => m.tag.endsWith("_retire_meta_trends_tables"))!;
      for (const m of EMBEDDED_MIGRATIONS.filter((m) => m.tag >= drop.tag)) await db.execute(sql`INSERT INTO uniiverse_migrations (tag, hash) VALUES (${m.tag}, ${m.hash})`);
      const result = await runMigrations(db, { useAdvisoryLock: false });
      expect(result.applied[0]).toBe("0048_last_known_ranks");
      expect(result.applied.filter((tag) => tag >= drop.tag)).toEqual([]);

      const copied = (await db.select().from(lastKnownRanks).orderBy(asc(lastKnownRanks.puuid))).map((r) => [r.puuid, r.tier, r.division, r.observedAt.toISOString(), r.source]);
      expect(copied).toEqual([
        ["A", "PLATINUM", "IV", "2026-09-20T00:00:00.000Z", "draft scouting"],
        ["C", "DIAMOND", "I", "2026-10-01T00:00:00.000Z", "draft scouting"],
        ["E", "EMERALD", null, "2026-10-05T00:00:00.000Z", "ranked ladder"],
        ["F", "DIAMOND", null, "2026-09-15T00:00:00.000Z", "ranked ladder"],
      ]);
      // The sources are untouched.
      expect(rowsOf<{ n: number }>(await db.execute(sql`SELECT count(*)::int AS n FROM draft_enemy_scouting`))[0]!.n).toBe(8);
      expect(rowsOf<{ n: number }>(await db.execute(sql`SELECT count(*)::int AS n FROM tracked_summoners`))[0]!.n).toBe(4);

      // What Match History shows, from the new table alone: Solo/Duo sightings with their dates,
      // stale (so an opened match checks them with Riot), and nothing for the others: unknown, not unranked.
      const readings = await storedRankReadings(db, ["A", "B", "C", "D", "E", "F", "G"]);
      expect([...readings.keys()].sort()).toEqual(["A", "C", "E", "F"]);
      const shown = (puuid: string) => participantRank(readings.get(puuid) ?? [], 420);
      expect(shown("A")).toMatchObject({ state: "ranked", queue: "solo", tier: "PLATINUM", division: "IV", asOf: "2026-09-20T00:00:00.000Z", kind: "sighting", stale: true });
      expect(shown("C")).toMatchObject({ tier: "DIAMOND", division: "I", asOf: "2026-10-01T00:00:00.000Z" });
      expect(shown("E")).toMatchObject({ tier: "EMERALD", division: null, asOf: "2026-10-05T00:00:00.000Z" });
      expect(shown("F")).toMatchObject({ tier: "DIAMOND", division: null, asOf: "2026-09-15T00:00:00.000Z" });
      for (const puuid of ["B", "D", "G"]) expect(shown(puuid).state).toBe("unknown");
      // The copied rows read as sightings: nothing says their Flex rank.
      expect(readings.get("A")).toEqual([{ at: Date.parse("2026-09-20T00:00:00Z"), kind: "sighting", solo: { tier: "PLATINUM", division: "IV", leaguePoints: null }, flex: null }]);
    } finally {
      await fresh.close();
    }
  });
});
