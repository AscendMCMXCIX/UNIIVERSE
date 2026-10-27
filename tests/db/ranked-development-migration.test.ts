import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createDb } from "@/server/db/create";
import { runMigrations } from "@/server/db/migrator";
import { EMBEDDED_MIGRATIONS } from "@/server/db/migrations.generated";

/*
  Migration 0059 turns Solo Queue Blocks into Ranked Development without losing anything: every
  block, game, note and mistake stays as it was, the ranked focus becomes the primary objective, and
  a block in progress follows it.
*/

describe("0059 Ranked Development keeps every Solo Queue Blocks record", () => {
  it("maps blocks, games, mistakes and the focus into the new model", async () => {
    const fresh = await createDb({ mode: "pglite-memory", migrate: false });
    const db = fresh.db;
    try {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS uniiverse_migrations (tag text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
      await db.transaction(async (tx) => {
        for (const m of EMBEDDED_MIGRATIONS.filter((m) => m.tag < "0059")) {
          for (const statement of m.statements) await tx.execute(sql.raw(statement));
          await tx.execute(sql`INSERT INTO uniiverse_migrations (tag, hash) VALUES (${m.tag}, ${m.hash})`);
        }
      });
      const q = async <T,>(s: ReturnType<typeof sql>) => ((await db.execute(s)) as unknown as { rows: T[] }).rows;
      const teamId = (await q<{ id: string }>(sql`INSERT INTO teams (name) VALUES ('T') RETURNING id`))[0]!.id;
      const alice = (await q<{ id: string }>(sql`INSERT INTO players (team_id, display_name, primary_role) VALUES (${teamId}, 'Alice', 'MID') RETURNING id`))[0]!.id;
      const bob = (await q<{ id: string }>(sql`INSERT INTO players (team_id, display_name, primary_role) VALUES (${teamId}, 'Bob', 'TOP') RETURNING id`))[0]!.id;
      // Alice: a focus with two chosen champions and a cleared slot, a finished block and one in progress.
      await db.execute(sql`INSERT INTO ranked_profiles (player_id, champion_1, champion_2, champion_3, focus, created_at) VALUES (${alice}, 'Ahri', '', 'Syndra', '  Ward   river before 3:15 ', '2026-09-01T00:00:00Z')`);
      // Bob: champions but no focus sentence (no objective is invented for him).
      await db.execute(sql`INSERT INTO ranked_profiles (player_id, champion_1, focus) VALUES (${bob}, 'Garen', '')`);
      const done = (await q<{ id: string }>(sql`INSERT INTO ranked_blocks (player_id, number, status, planned_games, focus, completion_rule, completed_reason, started_at, completed_at) VALUES (${alice}, 1, 'completed', 3, 'Old focus', 'target', 'manual', '2026-09-02T00:00:00Z', '2026-09-03T00:00:00Z') RETURNING id`))[0]!.id;
      const active = (await q<{ id: string }>(sql`INSERT INTO ranked_blocks (player_id, number, status, completion_rule, started_at) VALUES (${alice}, 2, 'active', 'two-losses', '2026-10-01T00:00:00Z') RETURNING id`))[0]!.id;
      await db.execute(sql`INSERT INTO ranked_games (block_id, player_id, riot_match_id, champion_id, result, main_mistake, notes) VALUES
        (${done}, ${alice}, 'OC1_1', 'Ahri', 'win', 'wave-tempo', ''),
        (${done}, ${alice}, NULL, 'Syndra', 'loss', NULL, 'Died to gank at 4'),
        (${done}, ${alice}, 'OC1_2', 'Ahri', 'loss', NULL, ''),
        (${active}, ${alice}, 'OC1_3', 'Ahri', 'win', 'positioning-teamfight', 'kept')`);
      const before = await q(sql`SELECT id, block_id, riot_match_id, champion_id, result, main_mistake, notes FROM ranked_games ORDER BY riot_match_id NULLS LAST`);

      expect((await runMigrations(db, { useAdvisoryLock: false })).applied).toEqual(["0059_ranked_development"]);

      // Nothing that existed changed or went missing.
      expect(await q(sql`SELECT id, block_id, riot_match_id, champion_id, result, main_mistake, notes FROM ranked_games ORDER BY riot_match_id NULLS LAST`)).toEqual(before);
      expect(await q(sql`SELECT number, status, planned_games, focus, completion_rule, completed_reason FROM ranked_blocks ORDER BY number`)).toEqual([
        { number: 1, status: "completed", planned_games: 3, focus: "Old focus", completion_rule: "target", completed_reason: "manual" },
        { number: 2, status: "active", planned_games: null, focus: null, completion_rule: "two-losses", completed_reason: null },
      ]);
      expect(await q(sql`SELECT focus, champion_1, champion_2, champion_3 FROM ranked_profiles WHERE player_id = ${alice}`)).toEqual([{ focus: "  Ward   river before 3:15 ", champion_1: "Ahri", champion_2: "", champion_3: "Syndra" }]);

      // Games: where they came from, whether they were reviewed, the old mistake read as an area.
      expect(await q(sql`SELECT riot_match_id, source, review_status, went_wrong, reviewed_at IS NOT NULL AS reviewed FROM ranked_games ORDER BY riot_match_id NULLS LAST`)).toEqual([
        { riot_match_id: "OC1_1", source: "import", review_status: "done", went_wrong: "wave-management", reviewed: true },
        { riot_match_id: "OC1_2", source: "import", review_status: "none", went_wrong: null, reviewed: false },
        { riot_match_id: "OC1_3", source: "import", review_status: "done", went_wrong: "teamfighting", reviewed: true },
        { riot_match_id: null, source: "manual", review_status: "done", went_wrong: null, reviewed: true },
      ]);

      // The focus became Alice's primary objective, with the champions she chose; Bob got none.
      const objectives = await q<{ id: string; player_id: string; title: string; category: string; status: string; is_primary: boolean; champion_ids: string[]; source: string; identified_at: string | Date }>(sql`SELECT * FROM development_objectives`);
      expect(objectives).toHaveLength(1);
      expect(objectives[0]).toMatchObject({ player_id: alice, title: "Ward river before 3:15", category: "other", status: "practising", is_primary: true, champion_ids: ["Ahri", "Syndra"], source: "blocks-focus" });
      expect(new Date(objectives[0]!.identified_at).toISOString()).toBe("2026-09-01T00:00:00.000Z");

      // The block in progress follows it and counts as active from now; the finished one is untouched.
      const blocks = await q<{ number: number; objective_id: string | null; active_now: boolean | null }>(sql`SELECT number, objective_id, last_activity_at > now() - interval '1 minute' AS active_now FROM ranked_blocks ORDER BY number`);
      expect(blocks).toEqual([
        { number: 1, objective_id: null, active_now: null },
        { number: 2, objective_id: objectives[0]!.id, active_now: true },
      ]);

      // The new tables keep Row Level Security on.
      expect(await q(sql`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('development_objectives', 'development_plans') ORDER BY relname`)).toEqual([
        { relname: "development_objectives", relrowsecurity: true },
        { relname: "development_plans", relrowsecurity: true },
      ]);
    } finally {
      await fresh.close();
    }
  });
});
