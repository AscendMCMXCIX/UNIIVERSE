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
    expect(result.applied).toEqual(["0002_accounts_series", "0003_regions_no_email", "0004_indexes", "0005_ranked_journal_scouting_bands", "0006_permissions_onboarding", "0007_auth_activation_ownership", "0008_password_signin", "0009_separate_admin_account", "0010_season_history_pro_patches", "0011_ranked_5s_mode", "0012_permissions_avatars", "0013_brand_assets", "0014_access_levels", "0015_brand_upload_chunks", "0016_phase5_profiles", "0017_phase6_identity", "0018_phase6_accounts", "0019_phase6_backgrounds", "0020_phase6_access_groups", "0021_p7_draft_side", "0022_p7_ranked_ban_recount", "0023_p7_blocks", "0024_p7_unset_primary_role", "0025_p7_skin_kinds", "0026_p7_match_details", "0027_p9_block_featured_champion", "0028_p9_match_timelines", "0029_p10_team_access", "0030_p11_rank_queue", "0031_p11_retire_other_coach", "0032_p13_card_studio", "0033_p15_match_summary", "0034_r6_match_links", "0035_r8_rank_snapshots", "0036_matchups_frames", "0037_account_order", "0038_blocks_completion_rules", "0039_patterns_notes", "0040_public_profiles", "0041_lineup_substitutes", "0042_retire_trends_capability", "0043_audit_events", "0044_row_level_security", "0045_keep_product_name", "0046_auth_failures", "0047_db_egress_daily", "0048_last_known_ranks", "0049_social_links", "0050_clash_scouts", "0051_public_site_copy", "0052_data_api_grants", "0053_administrator_access", "0054_web_vitals", "0055_restore_ascend_owner", "0056_privacy_erasures", "0057_participant_ranks", "0058_match_details_puuids", "0059_ranked_development"]);
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
    expect(result.applied).toEqual(["0014_access_levels", "0015_brand_upload_chunks", "0016_phase5_profiles", "0017_phase6_identity", "0018_phase6_accounts", "0019_phase6_backgrounds", "0020_phase6_access_groups", "0021_p7_draft_side", "0022_p7_ranked_ban_recount", "0023_p7_blocks", "0024_p7_unset_primary_role", "0025_p7_skin_kinds", "0026_p7_match_details", "0027_p9_block_featured_champion", "0028_p9_match_timelines", "0029_p10_team_access", "0030_p11_rank_queue", "0031_p11_retire_other_coach", "0032_p13_card_studio", "0033_p15_match_summary", "0034_r6_match_links", "0035_r8_rank_snapshots", "0036_matchups_frames", "0037_account_order", "0038_blocks_completion_rules", "0039_patterns_notes", "0040_public_profiles", "0041_lineup_substitutes", "0042_retire_trends_capability", "0043_audit_events", "0044_row_level_security", "0045_keep_product_name", "0046_auth_failures", "0047_db_egress_daily", "0048_last_known_ranks", "0049_social_links", "0050_clash_scouts", "0051_public_site_copy", "0052_data_api_grants", "0053_administrator_access", "0054_web_vitals", "0055_restore_ascend_owner", "0056_privacy_erasures", "0057_participant_ranks", "0058_match_details_puuids", "0059_ranked_development"]);
    const presets = ((await db.execute(sql`SELECT name, level_key, capabilities FROM permission_presets ORDER BY name`)) as unknown as { rows: Array<{ name: string; level_key: string | null; capabilities: string[] }> }).rows;
    // 0029 later renames the built-in Administrator level to Team Manager without site settings.
    expect(presets.map((p) => [p.name, p.level_key])).toEqual([
      ["Drafters", null],
      ["Restricted Player", "restricted"],
      ["Standard Player", "standard"],
      ["Team Manager", "administrator"],
    ]);
    const manager = presets.find((p) => p.name === "Team Manager")!.capabilities;
    for (const c of ["manage-users", "manage-branding", "manage-data", "manage-competition"]) expect(manager).not.toContain(c);
    expect(manager).toEqual(expect.arrayContaining(["manage-lineup", "manage-players", "manage-matches"]));
    const people = ((await db.execute(sql`SELECT username, role, permission_preset_id, custom_capabilities FROM users ORDER BY username`)) as unknown as { rows: Array<{ username: string; role: string; permission_preset_id: string | null; custom_capabilities: string[] | null }> }).rows;
    expect(people).toEqual([
      { username: "custom", role: "player", permission_preset_id: null, custom_capabilities: ["view-team"] },
      { username: "onrestricted", role: "player", permission_preset_id: restrictedId, custom_capabilities: null },
    ]);
    await fresh.close();
  });

  it("0029 keeps every profile on the team and removes only the retired Admin-page rights", async () => {
    const fresh = await createDb({ mode: "pglite-memory", migrate: false });
    const db = fresh.db;
    await db.execute(sql`CREATE TABLE IF NOT EXISTS uniiverse_migrations (tag text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    // Applied as the migrator does (in a transaction: 0022 locks a table).
    await db.transaction(async (tx) => {
      for (const m of EMBEDDED_MIGRATIONS.filter((m) => m.tag < "0029")) {
        for (const statement of m.statements) await tx.execute(sql.raw(statement));
        await tx.execute(sql`INSERT INTO uniiverse_migrations (tag, hash) VALUES (${m.tag}, ${m.hash})`);
      }
    });
    const teamId = ((await db.execute(sql`INSERT INTO teams (name) VALUES ('T') RETURNING id`)) as unknown as { rows: Array<{ id: string }> }).rows[0]!.id;
    await db.execute(sql`INSERT INTO players (team_id, display_name, primary_role) VALUES (${teamId}, 'Old', 'MID')`);
    await db.execute(sql`INSERT INTO users (username, display_name, role, custom_capabilities, access_groups) VALUES ('mixed', 'M', 'player', '["view-team","manage-branding","manage-lineup"]'::jsonb, '["branding-manager","lineup-manager","data-manager"]'::jsonb)`);
    await db.execute(sql`INSERT INTO users (username, display_name, role, password_hash) VALUES ('boss', 'B', 'owner', 'x')`);
    await db.execute(sql`INSERT INTO permission_presets (name, description, capabilities) VALUES ('Mine', '', '["view-team","manage-data"]'::jsonb)`);
    const result = await runMigrations(db, { useAdvisoryLock: false });
    expect(result.applied[0]).toBe("0029_p10_team_access");
    const q = async <T,>(s: ReturnType<typeof sql>) => ((await db.execute(s)) as unknown as { rows: T[] }).rows;
    expect(await q(sql`SELECT team_member FROM players`)).toEqual([{ team_member: true }]);
    expect(await q(sql`SELECT username, role, custom_capabilities, access_groups FROM users ORDER BY username`)).toEqual([
      { username: "boss", role: "owner", custom_capabilities: null, access_groups: [] },
      { username: "mixed", role: "player", custom_capabilities: ["view-team", "manage-lineup"], access_groups: ["lineup-manager"] },
    ]);
    expect(await q(sql`SELECT capabilities FROM permission_presets WHERE name = 'Mine'`)).toEqual([{ capabilities: ["view-team"] }]);
    await fresh.close();
  });

  it("0035 starts rank history from the rank already stored, and adds nothing for unranked accounts", async () => {
    const fresh = await createDb({ mode: "pglite-memory", migrate: false });
    const db = fresh.db;
    await db.execute(sql`CREATE TABLE IF NOT EXISTS uniiverse_migrations (tag text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    await db.transaction(async (tx) => {
      for (const m of EMBEDDED_MIGRATIONS.filter((m) => m.tag < "0035")) {
        for (const statement of m.statements) await tx.execute(sql.raw(statement));
        await tx.execute(sql`INSERT INTO uniiverse_migrations (tag, hash) VALUES (${m.tag}, ${m.hash})`);
      }
    });
    const q = async <T,>(s: ReturnType<typeof sql>) => ((await db.execute(s)) as unknown as { rows: T[] }).rows;
    const teamId = (await q<{ id: string }>(sql`INSERT INTO teams (name) VALUES ('T') RETURNING id`))[0]!.id;
    const playerId = (await q<{ id: string }>(sql`INSERT INTO players (team_id, display_name, primary_role) VALUES (${teamId}, 'P', 'MID') RETURNING id`))[0]!.id;
    await db.execute(sql`INSERT INTO riot_accounts (owner_type, player_id, game_name, tag_line, platform, puuid, label, tier, division, league_points, ranked_wins, ranked_losses, rank_queue, rank_updated_at)
      VALUES ('player', ${playerId}, 'Ranked', 'T', 'oc1', 'p1', 'main', 'GOLD', 'II', 40, 20, 18, 'solo', '2026-10-01T10:00:00Z'),
             ('player', ${playerId}, 'Unranked', 'T', 'oc1', 'p2', 'alt', NULL, NULL, NULL, NULL, NULL, NULL, NULL)`);
    expect((await runMigrations(db, { useAdvisoryLock: false })).applied).toEqual(["0035_r8_rank_snapshots", "0036_matchups_frames", "0037_account_order", "0038_blocks_completion_rules", "0039_patterns_notes", "0040_public_profiles", "0041_lineup_substitutes", "0042_retire_trends_capability", "0043_audit_events", "0044_row_level_security", "0045_keep_product_name", "0046_auth_failures", "0047_db_egress_daily", "0048_last_known_ranks", "0049_social_links", "0050_clash_scouts", "0051_public_site_copy", "0052_data_api_grants", "0053_administrator_access", "0054_web_vitals", "0055_restore_ascend_owner", "0056_privacy_erasures", "0057_participant_ranks", "0058_match_details_puuids", "0059_ranked_development"]);
    const rows = await q<{ queue: string; tier: string; division: string; league_points: number; wins: number; losses: number; captured_at: string | Date }>(sql`SELECT queue, tier, division, league_points, wins, losses, captured_at FROM rank_snapshots`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ queue: "solo", tier: "GOLD", division: "II", league_points: 40, wins: 20, losses: 18 });
    expect(new Date(rows[0]!.captured_at).toISOString()).toBe("2026-10-01T10:00:00.000Z");
    await fresh.close();
  });

  it("0031 retires Other Players and the Coach role without deleting anyone, and keeps them retired", async () => {
    const fresh = await createDb({ mode: "pglite-memory", migrate: false });
    const db = fresh.db;
    await db.execute(sql`CREATE TABLE IF NOT EXISTS uniiverse_migrations (tag text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    await db.transaction(async (tx) => {
      for (const m of EMBEDDED_MIGRATIONS.filter((m) => m.tag < "0031")) {
        for (const statement of m.statements) await tx.execute(sql.raw(statement));
        await tx.execute(sql`INSERT INTO uniiverse_migrations (tag, hash) VALUES (${m.tag}, ${m.hash})`);
      }
    });
    const q = async <T,>(s: ReturnType<typeof sql>) => ((await db.execute(s)) as unknown as { rows: T[] }).rows;
    const teamId = (await q<{ id: string }>(sql`INSERT INTO teams (name) VALUES ('T') RETURNING id`))[0]!.id;
    await db.execute(sql`INSERT INTO players (team_id, display_name, primary_role, "group", notes) VALUES (${teamId}, 'Main', 'MID', 'main', ''), (${teamId}, 'Sub', 'TOP', 'other', 'flex top')`);
    await db.execute(sql`UPDATE players SET team_member = false WHERE display_name = 'Sub'`);
    await db.execute(sql`INSERT INTO users (username, display_name, role, password_hash) VALUES ('boss', 'B', 'owner', 'x'), ('kim', 'K', 'coach', 'y'), ('pat', 'P', 'player', 'z')`);
    const result = await runMigrations(db, { useAdvisoryLock: false });
    expect(result.applied).toEqual(["0031_p11_retire_other_coach", "0032_p13_card_studio", "0033_p15_match_summary", "0034_r6_match_links", "0035_r8_rank_snapshots", "0036_matchups_frames", "0037_account_order", "0038_blocks_completion_rules", "0039_patterns_notes", "0040_public_profiles", "0041_lineup_substitutes", "0042_retire_trends_capability", "0043_audit_events", "0044_row_level_security", "0045_keep_product_name", "0046_auth_failures", "0047_db_egress_daily", "0048_last_known_ranks", "0049_social_links", "0050_clash_scouts", "0051_public_site_copy", "0052_data_api_grants", "0053_administrator_access", "0054_web_vitals", "0055_restore_ascend_owner", "0056_privacy_erasures", "0057_participant_ranks", "0058_match_details_puuids", "0059_ranked_development"]);
    // Everyone is still there with their data: the former substitute keeps its notes and its own team membership.
    expect(await q(sql`SELECT display_name, "group", team_member, notes FROM players ORDER BY display_name`)).toEqual([
      { display_name: "Main", group: "main", team_member: true, notes: "" },
      { display_name: "Sub", group: "main", team_member: false, notes: "flex top" },
    ]);
    // The coach account becomes an ordinary player with its password untouched; the Owner is unchanged.
    expect(await q(sql`SELECT username, role, password_hash FROM users ORDER BY username`)).toEqual([
      { username: "boss", role: "owner", password_hash: "x" },
      { username: "kim", role: "player", password_hash: "y" },
      { username: "pat", role: "player", password_hash: "z" },
    ]);
    // Neither value can come back.
    await expect(db.execute(sql`UPDATE players SET "group" = 'other' WHERE display_name = 'Main'`)).rejects.toThrow();
    await expect(db.execute(sql`INSERT INTO users (username, display_name, role) VALUES ('newcoach', 'N', 'coach')`)).rejects.toThrow();
    await fresh.close();
  });
});
