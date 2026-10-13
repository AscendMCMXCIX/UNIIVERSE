import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { sql } from "drizzle-orm";
import { players, teams, users } from "@/server/db/schema";
import { runMigrations } from "@/server/db/migrator";
import { EMBEDDED_MIGRATIONS } from "@/server/db/migrations.generated";
import { createDb } from "@/server/db/create";

let handle: DbHandle;

beforeAll(async () => {
  handle = await testDb();
});

afterAll(async () => {
  await handle.close();
});

describe("database migrations", () => {
  it("applies the schema and is idempotent", async () => {
    const again = await runMigrations(handle.db, { useAdvisoryLock: false });
    expect(again.applied).toEqual([]);
  });

  it("runs the single-transaction, advisory-locked path used on Postgres without re-applying anything", async () => {
    const again = await runMigrations(handle.db, { useAdvisoryLock: true });
    expect(again.applied).toEqual([]);
  });

  it("stores and reads a team and a player", async () => {
    const [team] = await handle.db.insert(teams).values({ name: "UNIIVERSE" }).returning();
    expect(team?.primaryPoolLimit).toBe(6);
    const [player] = await handle.db
      .insert(players)
      .values({ teamId: team!.id, displayName: "Alpha", primaryRole: "TOP", secondaryRole: "MID", group: "main" })
      .returning();
    const found = await handle.db.select().from(players).where(eq(players.id, player!.id));
    expect(found[0]?.displayName).toBe("Alpha");
    expect(found[0]?.secondaryRole).toBe("MID");
  });

  it("upgrades a database from before usernames and series without touching existing rows", async () => {
    // Replay the production history: the first two migrations, an owner account with an email
    // and no username, a team with the old two-champion secondary limit; then migrate.
    const fresh = await createDb({ mode: "pglite-memory", migrate: false });
    const db = fresh.db;
    const [m0, m1] = EMBEDDED_MIGRATIONS;
    await db.execute(sql`CREATE TABLE IF NOT EXISTS uniiverse_migrations (tag text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    for (const m of [m0!, m1!]) {
      for (const statement of m.statements) await db.execute(sql.raw(statement));
      await db.execute(sql`INSERT INTO uniiverse_migrations (tag, hash) VALUES (${m.tag}, ${m.hash})`);
    }
    await db.execute(sql`INSERT INTO teams (name, primary_pool_limit, secondary_pool_limit) VALUES ('UNIIVERSE', 6, 2)`);
    await db.execute(sql`INSERT INTO users (email, display_name, password_hash, role) VALUES ('owner@example.com', 'Ascend', 'scrypt$1$a$b', 'owner')`);
    await db.execute(sql`INSERT INTO users (email, display_name, password_hash, role) VALUES ('other@example.com', 'ascend', 'scrypt$1$a$b', 'player')`);
    await db.execute(sql`INSERT INTO users (email, display_name, password_hash, role) VALUES ('blank@example.com', '', 'scrypt$1$a$b', 'player')`);

    const result = await runMigrations(db, { useAdvisoryLock: false });
    expect(result.applied).toEqual(["0002_accounts_series"]);
    const rows = await db.select({ username: users.username, email: users.email, role: users.role, playerId: users.playerId }).from(users).orderBy(users.email);
    // Usernames come from the display name (unique case-insensitively), then the email's local part.
    expect(rows.map((r) => r.username).sort()).toEqual(["Ascend", "ascend-2", "blank"]);
    expect(rows.find((r) => r.email === "owner@example.com")?.username).toBe("Ascend");
    expect(rows.find((r) => r.email === "other@example.com")?.username).toBe("ascend-2");
    expect(rows.find((r) => r.role === "owner")).toMatchObject({ email: "owner@example.com", playerId: null });
    const [team] = await db.select().from(teams);
    expect(team?.secondaryPoolLimit).toBe(3);
    // The new tables and columns exist and the legacy account can still be looked up.
    await db.execute(sql`SELECT id, token_hash FROM sessions`);
    await db.execute(sql`SELECT id, best_of FROM series`);
    await db.execute(sql`SELECT series_id, game_number, enemy_players FROM matches`);
    await expect(db.execute(sql`INSERT INTO users (username, display_name, role) VALUES ('ASCEND', 'dup', 'player')`)).rejects.toThrow();
    await fresh.close();
  });
});
