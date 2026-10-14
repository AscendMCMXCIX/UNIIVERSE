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
    expect(result.applied).toEqual(["0002_accounts_series", "0003_regions_no_email", "0004_indexes", "0005_ranked_journal_scouting_bands", "0006_permissions_onboarding", "0007_auth_activation_ownership", "0008_password_signin", "0009_separate_admin_account", "0010_season_history_pro_patches", "0011_ranked_5s_mode", "0012_permissions_avatars", "0013_brand_assets", "0014_access_levels", "0015_brand_upload_chunks", "0016_phase5_profiles", "0017_phase6_identity", "0018_phase6_accounts", "0019_phase6_backgrounds", "0020_phase6_access_groups", "0021_p7_draft_side"]);
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

  it("0010 renames year-named pro patches to the client version and rebuilds only the pro statistics", async () => {
    const fresh = await createDb({ mode: "pglite-memory", migrate: false });
    const db = fresh.db;
    try {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS uniiverse_migrations (tag text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
      for (const m of EMBEDDED_MIGRATIONS.filter((m) => m.tag < "0010")) {
        for (const statement of m.statements) await db.execute(sql.raw(statement));
        await db.execute(sql`INSERT INTO uniiverse_migrations (tag, hash) VALUES (${m.tag}, ${m.hash})`);
      }
      await db.execute(sql`INSERT INTO pro_games (id, provider, patch, aggregated_at) VALUES ('lp:1', 'leaguepedia', '26.20', now()), ('lp:2', 'leaguepedia', '26.9', now()), ('lp:old', 'leaguepedia', '14.24', now())`);
      await db.execute(sql`INSERT INTO champion_role_stats (patch, source, tier_band, champion_id, role, games, wins) VALUES ('26.20', 'pro', 'PRO', 'Gwen', 'TOP', 10, 5), ('16.20', 'ranked', 'DIAMOND', 'Gwen', 'TOP', 40, 22)`);
      await db.execute(sql`INSERT INTO stat_periods (patch, source, games) VALUES ('26.20', 'pro', 10), ('16.20', 'ranked', 40)`);
      expect((await runMigrations(db, { useAdvisoryLock: false })).applied).toContain("0010_season_history_pro_patches");
      const rows = (r: unknown) => ((r as { rows?: Array<Record<string, unknown>> }).rows ?? (r as Array<Record<string, unknown>>));
      const games = rows(await db.execute(sql`SELECT id, patch, aggregated_at FROM pro_games ORDER BY id`));
      expect(games.map((g) => [g.id, g.patch])).toEqual([["lp:1", "16.20"], ["lp:2", "16.9"], ["lp:old", "14.24"]]);
      expect(games.every((g) => g.aggregated_at === null)).toBe(true);
      // Derived pro rows are rebuilt by the aggregate job; ranked statistics are untouched.
      expect(rows(await db.execute(sql`SELECT source, patch FROM champion_role_stats`))).toEqual([{ source: "ranked", patch: "16.20" }]);
      expect(rows(await db.execute(sql`SELECT source FROM stat_periods`))).toEqual([{ source: "ranked" }]);
      const accountCols = rows(await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'riot_accounts' AND column_name = 'history_backfill'`));
      expect(accountCols).toHaveLength(1);
    } finally {
      await fresh.close();
    }
  });

  it("0014 turns the existing presets into access levels without changing anyone's access", async () => {
    const fresh = await createDb({ mode: "pglite-memory", migrate: false });
    const db = fresh.db;
    await db.execute(sql`CREATE TABLE IF NOT EXISTS uniiverse_migrations (tag text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    for (const m of EMBEDDED_MIGRATIONS.filter((m) => m.tag < "0014")) {
      for (const statement of m.statements) await db.execute(sql.raw(statement));
      await db.execute(sql`INSERT INTO uniiverse_migrations (tag, hash) VALUES (${m.tag}, ${m.hash})`);
    }
    // Before: the two 0012 presets plus one the owner made, a player on Restricted, one custom.
    await db.execute(sql`INSERT INTO permission_presets (name, description, capabilities) VALUES ('Drafters', '', '["view-team","create-draft"]'::jsonb)`);
    const restrictedId = ((await db.execute(sql`SELECT id FROM permission_presets WHERE name = 'Restricted Player'`)) as unknown as { rows: Array<{ id: string }> }).rows[0]!.id;
    await db.execute(sql`INSERT INTO users (username, display_name, role, permission_preset_id) VALUES ('onrestricted', 'R', 'player', ${restrictedId})`);
    await db.execute(sql`INSERT INTO users (username, display_name, role, custom_capabilities) VALUES ('custom', 'C', 'player', '["view-team"]'::jsonb)`);
    const result = await runMigrations(db, { useAdvisoryLock: false });
    expect(result.applied).toEqual(["0014_access_levels", "0015_brand_upload_chunks", "0016_phase5_profiles", "0017_phase6_identity", "0018_phase6_accounts", "0019_phase6_backgrounds", "0020_phase6_access_groups", "0021_p7_draft_side"]);
    const presets = ((await db.execute(sql`SELECT name, level_key, capabilities FROM permission_presets ORDER BY name`)) as unknown as { rows: Array<{ name: string; level_key: string | null; capabilities: string[] }> }).rows;
    expect(presets.map((p) => [p.name, p.level_key])).toEqual([
      ["Administrator", "administrator"],
      ["Drafters", null],
      ["Restricted Player", "restricted"],
      ["Standard Player", "standard"],
    ]);
    expect(presets.find((p) => p.name === "Administrator")!.capabilities).not.toContain("manage-users");
    const people = ((await db.execute(sql`SELECT username, role, permission_preset_id, custom_capabilities FROM users ORDER BY username`)) as unknown as { rows: Array<{ username: string; role: string; permission_preset_id: string | null; custom_capabilities: string[] | null }> }).rows;
    expect(people).toEqual([
      { username: "custom", role: "player", permission_preset_id: null, custom_capabilities: ["view-team"] },
      { username: "onrestricted", role: "player", permission_preset_id: restrictedId, custom_capabilities: null },
    ]);
    await fresh.close();
  });
});
