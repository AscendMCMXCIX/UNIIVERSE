import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { testDb } from "./helpers";
import { createDb, type DbHandle } from "@/server/db/create";
import { EMBEDDED_MIGRATIONS } from "@/server/db/migrations.generated";
import { runMigrations } from "@/server/db/migrator";
import { players, riotAccounts } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam, getPlayer } from "@/server/repositories/team";
import { addAccount, listAccountsForPlayer, removeAccount, setMainAccount } from "@/server/accounts/repository";

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

  it("promotes the oldest remaining account when the Main is removed", async () => {
    const main = (await listAccountsForPlayer(handle.db, playerId)).find((a) => a.label === "main")!;
    await removeAccount(handle.db, main.id);
    expect(await labels(playerId)).toEqual({ "First#OCE": "main", "Second#OCE": "alt" });
    expect((await getPlayer(handle.db, playerId))!.riotId).toBe("First#OCE");
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
      const [p] = await db.insert(players).values({ teamId: team.id, displayName: "Twin", primaryRole: "TOP", riotId: "Second#EUW" }).returning();
      const [q] = await db.insert(players).values({ teamId: team.id, displayName: "Nomain", primaryRole: "MID" }).returning();
      const ins = (playerId: string, name: string, label: string, created: string) => db.insert(riotAccounts).values({ ownerType: "player", playerId, gameName: name, tagLine: "EUW", platform: "euw1", label, createdAt: new Date(created) });
      // Before: two "main" accounts for one player (the old default), none for another.
      await ins(p!.id, "First", "main", "2026-01-01");
      await ins(p!.id, "Second", "main", "2026-02-01");
      await ins(p!.id, "Third", "role", "2026-03-01");
      await ins(q!.id, "Solo", "alt", "2026-01-05");
      await ins(q!.id, "Later", "alt", "2026-04-05");
      const result = await runMigrations(db, { useAdvisoryLock: false });
      expect(result.applied).toEqual(["0018_phase6_accounts", "0019_phase6_backgrounds", "0020_phase6_access_groups", "0021_p7_draft_side", "0022_p7_ranked_ban_recount", "0023_p7_blocks"]);
      const rows = ((await db.execute(sql`SELECT game_name, label FROM riot_accounts ORDER BY game_name`)) as unknown as { rows: Array<{ game_name: string; label: string }> }).rows;
      expect(Object.fromEntries(rows.map((r) => [r.game_name, r.label]))).toEqual({ First: "alt", Second: "main", Third: "alt", Solo: "main", Later: "alt" });
      expect(((await db.execute(sql`SELECT count(*)::int AS n FROM riot_accounts`)) as unknown as { rows: Array<{ n: number }> }).rows[0]!.n).toBe(5);
    } finally {
      await fresh.close();
    }
  });
});
