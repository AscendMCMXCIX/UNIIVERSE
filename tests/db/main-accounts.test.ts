import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { testDb } from "./helpers";
import { createDb, type DbHandle } from "@/server/db/create";
import { EMBEDDED_MIGRATIONS } from "@/server/db/migrations.generated";
import { runMigrations } from "@/server/db/migrator";
import { riotAccounts } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam, getPlayer } from "@/server/repositories/team";
import { addAccount, listAccountsForPlayer, listAccountsForPlayers, removeAccount, reorderAccounts, setMainAccount } from "@/server/accounts/repository";

let handle: DbHandle;
let playerId: string;
let otherId: string;

beforeAll(async () => {
  handle = await testDb();
  const team = await getOrCreateTeam(handle.db);
  playerId = (await createPlayer(handle.db, team.id, { displayName: "Mains", primaryRole: "MID", primaryPool: [] })).id;
  otherId = (await createPlayer(handle.db, team.id, { displayName: "Other", primaryRole: "TOP", primaryPool: [] })).id;
});
afterAll(async () => {
  await handle.close();
});

const labels = async (id: string) => Object.fromEntries((await listAccountsForPlayer(handle.db, id)).map((a) => [a.riotId, a.label]));

describe("Main and Alt accounts", () => {
  it("makes a player's first account Main and later ones Alt", async () => {
    await addAccount(handle.db, { ownerType: "player", playerId, riotId: "First#OCE", platform: "oc1" });
    await addAccount(handle.db, { ownerType: "player", playerId, riotId: "Second#OCE", platform: "oc1" });
    await addAccount(handle.db, { ownerType: "player", playerId, riotId: "Third#OCE", platform: "oc1", label: "main" });
    expect(await labels(playerId)).toEqual({ "First#OCE": "main", "Second#OCE": "alt", "Third#OCE": "alt" });
  });

  it("switches the Main account: exactly one Main, nothing else changes, the profile Riot ID follows", async () => {
    const before = await listAccountsForPlayer(handle.db, playerId);
    const third = before.find((a) => a.riotId === "Third#OCE")!;
    await setMainAccount(handle.db, playerId, third.id);
    expect(await labels(playerId)).toEqual({ "First#OCE": "alt", "Second#OCE": "alt", "Third#OCE": "main" });
    const after = await listAccountsForPlayer(handle.db, playerId);
    // Same accounts, same ids, same owner.
    expect(after.map((a) => a.id).sort()).toEqual(before.map((a) => a.id).sort());
    expect(after.every((a) => a.playerId === playerId)).toBe(true);
    expect((await getPlayer(handle.db, playerId))!.riotId).toBe("Third#OCE");
  });

  it("refuses to make another player's account Main", async () => {
    const theirs = await addAccount(handle.db, { ownerType: "player", playerId: otherId, riotId: "Theirs#OCE", platform: "oc1" });
    await expect(setMainAccount(handle.db, playerId, theirs.id)).rejects.toThrow(/not linked to this player/);
    expect(await labels(otherId)).toEqual({ "Theirs#OCE": "main" });
  });

  it("the database itself allows only one Main per player", async () => {
    const [alt] = await handle.db.select().from(riotAccounts).where(eq(riotAccounts.gameName, "First"));
    await expect(handle.db.update(riotAccounts).set({ label: "main" }).where(eq(riotAccounts.id, alt!.id))).rejects.toThrow();
  });

  it("promotes the first alternative (oldest, when never reordered) when the Main is removed", async () => {
    const main = (await listAccountsForPlayer(handle.db, playerId)).find((a) => a.label === "main")!;
    await removeAccount(handle.db, main.id);
    expect(await labels(playerId)).toEqual({ "First#OCE": "main", "Second#OCE": "alt" });
    expect((await getPlayer(handle.db, playerId))!.riotId).toBe("First#OCE");
  });
});

describe("account order", () => {
  const ids = async (id: string) => (await listAccountsForPlayer(handle.db, id)).map((a) => a.riotId);
  it("keeps the Main first and the alternatives in the player's chosen order, everywhere they are listed", async () => {
    const team = await getOrCreateTeam(handle.db);
    const pid = (await createPlayer(handle.db, team.id, { displayName: "Order", primaryRole: "ADC", primaryPool: [] })).id;
    for (const name of ["Mainly", "AltA", "AltB", "AltC"]) await addAccount(handle.db, { ownerType: "player", playerId: pid, riotId: `${name}#OCE`, platform: "oc1" });
    expect(await ids(pid)).toEqual(["Mainly#OCE", "AltA#OCE", "AltB#OCE", "AltC#OCE"]);
    const byName = Object.fromEntries((await listAccountsForPlayer(handle.db, pid)).map((a) => [a.riotId, a]));
    const statsBefore = await handle.db.select({ id: riotAccounts.id, label: riotAccounts.label, playerId: riotAccounts.playerId, puuid: riotAccounts.puuid }).from(riotAccounts).where(eq(riotAccounts.playerId, pid));
    // The Main stays first even when sent last.
    await reorderAccounts(handle.db, pid, [byName["AltC#OCE"]!.id, byName["AltA#OCE"]!.id, byName["AltB#OCE"]!.id, byName["Mainly#OCE"]!.id]);
    expect(await ids(pid)).toEqual(["Mainly#OCE", "AltC#OCE", "AltA#OCE", "AltB#OCE"]);
    expect((await listAccountsForPlayers(handle.db, [pid])).map((a) => a.riotId)).toEqual(["Mainly#OCE", "AltC#OCE", "AltA#OCE", "AltB#OCE"]);
    // Ordering is presentation only: labels, owners and identities are unchanged.
    const statsAfter = await handle.db.select({ id: riotAccounts.id, label: riotAccounts.label, playerId: riotAccounts.playerId, puuid: riotAccounts.puuid }).from(riotAccounts).where(eq(riotAccounts.playerId, pid));
    expect(new Set(statsAfter.map((r) => JSON.stringify(r)))).toEqual(new Set(statsBefore.map((r) => JSON.stringify(r))));
    // A new account goes last; making an alternative Main swaps it with the former Main.
    await addAccount(handle.db, { ownerType: "player", playerId: pid, riotId: "AltD#OCE", platform: "oc1" });
    expect(await ids(pid)).toEqual(["Mainly#OCE", "AltC#OCE", "AltA#OCE", "AltB#OCE", "AltD#OCE"]);
    await setMainAccount(handle.db, pid, byName["AltA#OCE"]!.id);
    expect(await ids(pid)).toEqual(["AltA#OCE", "AltC#OCE", "Mainly#OCE", "AltB#OCE", "AltD#OCE"]);
    // Removing the Main promotes the first alternative in the chosen order.
    await removeAccount(handle.db, byName["AltA#OCE"]!.id);
    expect(await ids(pid)).toEqual(["AltC#OCE", "Mainly#OCE", "AltB#OCE", "AltD#OCE"]);
    expect((await getPlayer(handle.db, pid))!.riotId).toBe("AltC#OCE");
  });

  it("refuses an order that is not exactly the player's own accounts", async () => {
    const mine = (await listAccountsForPlayer(handle.db, otherId)).map((a) => a.id);
    const someoneElse = (await listAccountsForPlayer(handle.db, playerId)).map((a) => a.id);
    await expect(reorderAccounts(handle.db, otherId, [...mine, someoneElse[0]!])).rejects.toThrow(/changed meanwhile/);
    await expect(reorderAccounts(handle.db, playerId, [...someoneElse.slice(1), mine[0]!])).rejects.toThrow(/changed meanwhile/);
    await expect(reorderAccounts(handle.db, playerId, [someoneElse[0]!, someoneElse[0]!])).rejects.toThrow(/changed meanwhile/);
    // Nothing of the other player's changed.
    expect((await handle.db.select({ o: riotAccounts.sortOrder }).from(riotAccounts).where(eq(riotAccounts.playerId, otherId))).every((r) => r.o === null)).toBe(true);
  });
});

describe("migration 0018: one Main per player", () => {
  it("keeps one Main per player (the one matching their Riot ID, else the oldest) without touching anything else", async () => {
    const fresh = await createDb({ mode: "pglite-memory", migrate: false });
    const db = fresh.db;
    try {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS uniiverse_migrations (tag text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
      for (const m of EMBEDDED_MIGRATIONS.filter((m) => m.tag < "0018")) {
        for (const statement of m.statements) await db.execute(sql.raw(statement));
        await db.execute(sql`INSERT INTO uniiverse_migrations (tag, hash) VALUES (${m.tag}, ${m.hash})`);
      }
      const team = await getOrCreateTeam(db);
      // Raw SQL: the schema in code has columns that later migrations add.
      const insertPlayer = async (name: string, role: string, riotId: string | null) => ((await db.execute(sql`INSERT INTO players (team_id, display_name, primary_role, riot_id) VALUES (${team.id}, ${name}, ${role}, ${riotId}) RETURNING id`)) as unknown as { rows: Array<{ id: string }> }).rows[0];
      const p = await insertPlayer("Twin", "TOP", "Second#EUW");
      const q = await insertPlayer("Nomain", "MID", null);
      const ins = (playerId: string, name: string, label: string, created: string) => db.execute(sql`INSERT INTO riot_accounts (owner_type, player_id, game_name, tag_line, platform, label, created_at) VALUES ('player', ${playerId}, ${name}, 'EUW', 'euw1', ${label}, ${new Date(created).toISOString()})`);
      // Before: two "main" accounts for one player (the old default), none for another.
      await ins(p!.id, "First", "main", "2026-01-01");
      await ins(p!.id, "Second", "main", "2026-02-01");
      await ins(p!.id, "Third", "role", "2026-03-01");
      await ins(q!.id, "Solo", "alt", "2026-01-05");
      await ins(q!.id, "Later", "alt", "2026-04-05");
      const result = await runMigrations(db, { useAdvisoryLock: false });
      expect(result.applied).toEqual(["0018_phase6_accounts", "0019_phase6_backgrounds", "0020_phase6_access_groups", "0021_p7_draft_side", "0022_p7_ranked_ban_recount", "0023_p7_blocks", "0024_p7_unset_primary_role", "0025_p7_skin_kinds", "0026_p7_match_details", "0027_p9_block_featured_champion", "0028_p9_match_timelines", "0029_p10_team_access", "0030_p11_rank_queue", "0031_p11_retire_other_coach", "0032_p13_card_studio", "0033_p15_match_summary", "0034_r6_match_links", "0035_r8_rank_snapshots", "0036_matchups_frames", "0037_account_order", "0038_blocks_completion_rules", "0039_patterns_notes", "0040_public_profiles", "0041_lineup_substitutes", "0042_retire_trends_capability", "0043_audit_events", "0044_row_level_security", "0045_keep_product_name", "0046_auth_failures", "0047_db_egress_daily", "0048_last_known_ranks", "0049_social_links", "0050_retire_meta_trends_tables"]);
      const rows = ((await db.execute(sql`SELECT game_name, label FROM riot_accounts ORDER BY game_name`)) as unknown as { rows: Array<{ game_name: string; label: string }> }).rows;
      expect(Object.fromEntries(rows.map((r) => [r.game_name, r.label]))).toEqual({ First: "alt", Second: "main", Third: "alt", Solo: "main", Later: "alt" });
      expect(((await db.execute(sql`SELECT count(*)::int AS n FROM riot_accounts`)) as unknown as { rows: Array<{ n: number }> }).rows[0]!.n).toBe(5);
    } finally {
      await fresh.close();
    }
  });
});
