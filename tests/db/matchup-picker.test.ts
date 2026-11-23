import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountChampionHistory, players, riotAccounts } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { recordedRoles, viewerPool } from "@/server/matchup-intel/picker";
import { invalidateAllCaches } from "@/server/observability/cache";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { STANDARD_PLAYER, type Session } from "@/server/auth/permissions";

/*
  Matchup Intel's picker (R11a; server/matchup-intel/picker.ts): Your pool is the viewer's own
  player profile's pool only; the role filter counts the team's members' stored games only (never a
  personal-use profile, an archived player or a scouting account) and is offered only with
  "view-teammate-stats".
*/

let handle: DbHandle;
let member: string;
const base = { userId: "11111111-1111-4111-8111-111111111111", label: "Me", username: "me", hasPassword: true, mustChangePassword: false, setupComplete: true };
const session = (over: Partial<Session> = {}): Session => ({ ...base, role: "player", playerId: null, capabilities: STANDARD_PLAYER, teamMember: true, ...over }) as Session;

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider());
  const teamId = (await getOrCreateTeam(db)).id;
  member = (await createPlayer(db, teamId, { displayName: "Member", primaryRole: "TOP", primaryPool: ["Riven", "Darius", "Garen"], secondaryRole: "MID", secondaryPool: ["Ahri"] })).id;
  const personal = (await createPlayer(db, teamId, { displayName: "Personal", primaryRole: "TOP", primaryPool: [] })).id;
  const archived = (await createPlayer(db, teamId, { displayName: "Archived", primaryRole: "TOP", primaryPool: [] })).id;
  await db.update(players).set({ teamMember: false }).where(eq(players.id, personal));
  await db.update(players).set({ archivedAt: new Date() }).where(eq(players.id, archived));
  const account = async (ownerType: "player" | "opponent", playerId: string | null, n: number) =>
    (await db.insert(riotAccounts).values({ ownerType, playerId, gameName: `acct${n}`, tagLine: "T", platform: "oc1", puuid: `p-${n}`, label: "main" }).returning({ id: riotAccounts.id }))[0]!.id;
  const row = (accountId: string, championId: string, role: string, extra: Partial<{ games: number; queueGroup: string }> = {}) => ({ accountId, championId, role, queueGroup: extra.queueGroup ?? "solo", patch: "16.22", games: extra.games ?? 3, wins: 1 });
  const mine = await account("player", member, 1);
  await db.insert(accountChampionHistory).values([
    row(mine, "Riven", "TOP"),
    row(mine, "Ahri", "MID"),
    row(mine, "Lux", "MID", { queueGroup: "other" }),
    row(mine, "Zed", "MID", { games: 0 }),
    row(await account("player", personal, 2), "Teemo", "TOP"),
    row(await account("player", archived, 3), "Garen", "TOP"),
    row(await account("opponent", null, 4), "Yone", "MID"),
  ]);
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("Matchup Intel's picker: Your pool and the role filter", () => {
  it("gives the viewer's own pool for the lane, kept to the roster; nothing without a player profile", async () => {
    const roster = new Set(["Riven", "Darius", "Ahri"]);
    expect(await viewerPool(handle.db, session({ playerId: member }), "top", roster)).toEqual(["Riven", "Darius"]);
    expect(await viewerPool(handle.db, session({ playerId: member }), "mid", roster)).toEqual(["Ahri"]);
    expect(await viewerPool(handle.db, session({ playerId: member }), "support", roster)).toEqual([]);
    expect(await viewerPool(handle.db, session(), "top", roster)).toEqual([]);
    expect(await viewerPool(handle.db, null, "top", roster)).toEqual([]);
  });

  it("counts the team's members' rift games only, and is offered only with view-teammate-stats", async () => {
    invalidateAllCaches();
    expect(await recordedRoles(handle.db, session())).toEqual({ TOP: ["Riven"], MID: ["Ahri"] });
    invalidateAllCaches();
    expect(await recordedRoles(handle.db, session({ capabilities: STANDARD_PLAYER.filter((c) => c !== "view-teammate-stats") }))).toBeNull();
    expect(await recordedRoles(handle.db, null)).toBeNull();
  });
});
