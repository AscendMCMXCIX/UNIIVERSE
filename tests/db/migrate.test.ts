import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { sql } from "drizzle-orm";
import { players, teams, users } from "@/server/db/schema";
import { runMigrations } from "@/server/db/migrator";
import { EMBEDDED_MIGRATIONS } from "@/server/db/migrations.generated";
import { createDb } from "@/server/db/create";
import { hashPassword } from "@/server/auth/password";
import { authenticate } from "@/server/repositories/users";
import { listOwnerAccounts, recoverOwnerAccount } from "@/server/auth/recovery";

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

  it("upgrades a database from before usernames and series, keeps the owner and drops email", async () => {
    // Replay the production history: the first two migrations, an owner account with an email
    // and no username, a team with the old two-champion secondary limit; then migrate to the
    // current schema (usernames and series in 0002, email removed in 0003).
    const fresh = await createDb({ mode: "pglite-memory", migrate: false });
    const db = fresh.db;
    const [m0, m1] = EMBEDDED_MIGRATIONS;
    await db.execute(sql`CREATE TABLE IF NOT EXISTS uniiverse_migrations (tag text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    for (const m of [m0!, m1!]) {
      for (const statement of m.statements) await db.execute(sql.raw(statement));
      await db.execute(sql`INSERT INTO uniiverse_migrations (tag, hash) VALUES (${m.tag}, ${m.hash})`);
    }
    await db.execute(sql`INSERT INTO teams (name, primary_pool_limit, secondary_pool_limit) VALUES ('UNIIVERSE', 6, 2)`);
    const ownerHash = await hashPassword("owner-password-1");
    await db.execute(sql`INSERT INTO users (email, display_name, password_hash, role) VALUES ('owner@example.com', 'Ascend', ${ownerHash}, 'owner')`);
    await db.execute(sql`INSERT INTO users (email, display_name, password_hash, role) VALUES ('other@example.com', 'ascend', 'scrypt$1$a$b', 'player')`);
    await db.execute(sql`INSERT INTO users (email, display_name, password_hash, role) VALUES ('blank@example.com', '', 'scrypt$1$a$b', 'player')`);

    const result = await runMigrations(db, { useAdvisoryLock: false });
    expect(result.applied).toEqual(["0002_accounts_series", "0003_regions_no_email", "0004_indexes"]);
    const rows = await db.select({ username: users.username, role: users.role, playerId: users.playerId, passwordHash: users.passwordHash }).from(users).orderBy(users.username);
    // Usernames come from the display name (unique case-insensitively), then the email's local part.
    expect(rows.map((r) => r.username).sort()).toEqual(["Ascend", "ascend-2", "blank"]);
    // The owner account survives with its password hash; the email column is gone for good.
    expect(rows.find((r) => r.role === "owner")).toMatchObject({ username: "Ascend", playerId: null, passwordHash: ownerHash });
    // The lockout case: the owner's login is now the former display name (any case) with the
    // old password; the email is not a login any more. Recovery shows that username and can
    // rename it while keeping the password, without creating a second owner.
    expect((await authenticate(db, "ascend", "owner-password-1"))?.role).toBe("owner");
    expect(await authenticate(db, "owner@example.com", "owner-password-1")).toBeNull();
    const owners = await listOwnerAccounts(db);
    expect(owners.map((o) => o.username)).toEqual(["Ascend"]);
    const ownerId = owners[0]!.id;
    const recovered = await recoverOwnerAccount(db, { ownerId, username: "AscendMCMXCIX" });
    expect(recovered.role).toBe("owner");
    expect(recovered.playerId).toBeNull(); // login works without a player profile; /me asks for it afterwards
    expect((await authenticate(db, "AscendMCMXCIX", "owner-password-1"))?.id).toBe(ownerId);
    expect((await listOwnerAccounts(db)).length).toBe(1);
    const columns = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users'`);
    const names = ((columns as unknown as { rows?: Array<{ column_name: string }> }).rows ?? (columns as unknown as Array<{ column_name: string }>)).map((c) => c.column_name);
    expect(names).toContain("username");
    expect(names).not.toContain("email");
    const inviteColumns = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'invites'`);
    expect(((inviteColumns as unknown as { rows?: Array<{ column_name: string }> }).rows ?? (inviteColumns as unknown as Array<{ column_name: string }>)).map((c) => c.column_name)).not.toContain("email");
    // Regions: the new provenance tables exist and old Riot accounts keep working with the new columns' defaults.
    await db.execute(sql`SELECT platform, last_error FROM region_status`);
    await db.execute(sql`SELECT patch, platform, games FROM stat_region_periods`);
    const [team] = await db.select().from(teams);
    expect(team?.secondaryPoolLimit).toBe(3);
    // The new tables and columns exist and the legacy account can still be looked up.
    await db.execute(sql`SELECT id, token_hash FROM sessions`);
    await db.execute(sql`SELECT id, best_of FROM series`);
    await db.execute(sql`SELECT series_id, game_number, enemy_players FROM matches`);
    await expect(db.execute(sql`INSERT INTO users (username, display_name, role) VALUES ('ASCENDMCMXCIX', 'dup', 'player')`)).rejects.toThrow();
    await fresh.close();
  });
});
