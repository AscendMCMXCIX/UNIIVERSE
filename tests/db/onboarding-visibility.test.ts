import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { lineupSlots, players, users } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { RiotApiError } from "@/server/riot/api/client";
import { verifyRiotIdentity, type RiotIdentityClient } from "@/server/riot/verify-identity";
import { createVerifiedPlayerAccount, listAccountViews } from "@/server/auth/account-admin";
import { completeSetup, loadSetupState } from "@/server/auth/onboarding";
import { createUser } from "@/server/repositories/users";
import { createPlayer, getCurrentLineup, getOrCreateTeam, getPlayer, getPlayerRow, listPlayers, setLineupSlot } from "@/server/repositories/team";
import { getTeamOverview, candidatesFor } from "@/server/team/overview";
import { EMBEDDED_MIGRATIONS } from "@/server/db/migrations.generated";

/*
  New accounts: no primary role until the player picks one. Membership and setup are separate: a
  member still in setup is listed everywhere members are (Players, Team), marked setupPending; a
  member without a chosen role has no legal role, so they are never assigned to a lineup role, and one
  with a role is eligible like anyone else.
*/

class FakeRiot implements RiotIdentityClient {
  constructor(private readonly accounts: Record<string, { puuid: string; gameName: string; tagLine: string; platform?: string }>) {}
  async accountByRiotId(_platform: string, gameName: string, tagLine: string) {
    const hit = this.accounts[`${gameName}#${tagLine}`.toLowerCase()];
    if (!hit) throw new RiotApiError("Riot API 404", 404, false);
    return hit;
  }
  async activePlatformByPuuid(_hint: string, puuid: string) {
    return Object.values(this.accounts).find((a) => a.puuid === puuid)?.platform ?? null;
  }
}
const riot = new FakeRiot({
  "newbie#oce": { puuid: "puuid-newbie", gameName: "Newbie", tagLine: "OCE", platform: "oc1" },
  "later#oce": { puuid: "puuid-later", gameName: "Later", tagLine: "OCE", platform: "oc1" },
});

let handle: DbHandle;
let teamId: string;
let ownerId: string;
const verified = async (riotId: string) => {
  const r = await verifyRiotIdentity(handle.db, riotId, riot, { platformHint: "oc1" });
  if (r.status !== "verified") throw new Error(r.status);
  return r;
};

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  teamId = (await getOrCreateTeam(handle.db)).id;
  ownerId = (await createUser(handle.db, { username: "Boss", password: "Owner-pass-123", role: "owner" })).id;
  for (const [name, role] of [["Top", "TOP"], ["Jg", "JUNGLE"], ["Mid", "MID"], ["Adc", "ADC"], ["Sup", "SUPPORT"]] as const) {
    const p = await createPlayer(handle.db, teamId, { displayName: name, primaryRole: role, primaryPool: ["Ahri"] });
    await setLineupSlot(handle.db, teamId, role, p.id);
  }
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("new accounts start without a primary role", () => {
  let newbie: { userId: string; playerId: string };

  it("stores no role (no Mid default) and the setup form starts empty", async () => {
    const created = await createVerifiedPlayerAccount(handle.db, { username: "Newbie", identity: await verified("Newbie#OCE"), createdByUserId: ownerId });
    newbie = { userId: created.user.id, playerId: created.playerId };
    expect((await getPlayerRow(handle.db, created.playerId))!.primaryRole).toBeNull();
    // Still a member with a profile to open: no role, no pools, marked as in setup.
    expect(await getPlayer(handle.db, created.playerId)).toMatchObject({ primaryRole: null, primaryPool: [], setupPending: true });
    const { state } = await loadSetupState(handle.db, created.user.id);
    expect(state).toEqual({ displayName: "Newbie", primaryRole: null, primaryPool: [], secondaryRole: null, secondaryPool: [] });
  });

  it("requires an explicit primary role; the secondary role stays optional", async () => {
    await expect(completeSetup(handle.db, newbie.userId, { primaryPool: ["Ahri"] })).rejects.toThrow(/primary role/);
    await completeSetup(handle.db, newbie.userId, { primaryRole: "SUPPORT", primaryPool: ["Lulu"] });
    const player = (await getPlayer(handle.db, newbie.playerId))!;
    expect(player).toMatchObject({ primaryRole: "SUPPORT", secondaryRole: null, primaryPool: ["Lulu"], setupPending: false });
  });
});

describe("players still in setup", () => {
  let pending: string;
  beforeAll(async () => {
    const created = await createVerifiedPlayerAccount(handle.db, { username: "Later", identity: await verified("Later#OCE"), createdByUserId: ownerId });
    pending = created.playerId;
  });

  it("are listed as members everywhere members are, marked as in setup; without a role they are offered for no slot", async () => {
    const members = await listPlayers(handle.db, teamId);
    expect(members.find((p) => p.id === pending)).toMatchObject({ setupPending: true, primaryRole: null, primaryPool: [] });
    const overview = await getTeamOverview(handle.db, teamId);
    expect([...overview.main, ...overview.other].map((p) => p.id)).toContain(pending);
    // No chosen role: no legal role, so no slot offers them (nothing is assumed for them).
    for (const role of ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as const) expect(candidatesFor(role, overview, true).map((p) => p.id)).not.toContain(pending);
    const accounts = await listAccountViews(handle.db);
    expect(accounts.find((a) => a.username === "Later")).toMatchObject({ setupComplete: false });
  });

  it("cannot be put into a lineup while they have no role", async () => {
    await expect(setLineupSlot(handle.db, teamId, "TOP", pending)).rejects.toThrow(/not chosen their roles/);
    expect((await getCurrentLineup(handle.db, teamId)).slots.TOP).not.toBe(pending);
  });

  it("with a role already, are eligible like any member: listed, offered for their roles, and can join the lineup", async () => {
    const legacy = await createPlayer(handle.db, teamId, { displayName: "Old pending", primaryRole: "MID", primaryPool: ["Orianna"] });
    await createUser(handle.db, { username: "OldPending", password: null, role: "player", playerId: legacy.id, setupCompletedAt: null });
    expect((await listPlayers(handle.db, teamId)).find((p) => p.id === legacy.id)).toMatchObject({ setupPending: true, primaryRole: "MID" });
    const overview = await getTeamOverview(handle.db, teamId);
    expect(overview.main.map((p) => p.id)).toContain(legacy.id);
    expect(candidatesFor("MID", overview, false).map((p) => p.id)).toContain(legacy.id);
    expect(candidatesFor("TOP", overview, true).map((p) => p.id)).not.toContain(legacy.id);
    await setLineupSlot(handle.db, teamId, "MID", legacy.id);
    expect((await getCurrentLineup(handle.db, teamId)).slots.MID).toBe(legacy.id);
    expect((await getTeamOverview(handle.db, teamId)).rows.find((r) => r.role === "MID")!.player?.id).toBe(legacy.id);
  });

  it("archived and personal-use profiles are still not members", async () => {
    const gone = await createPlayer(handle.db, teamId, { displayName: "Gone", primaryRole: "TOP", primaryPool: ["Garen"] });
    await handle.db.update(players).set({ archivedAt: new Date() }).where(eq(players.id, gone.id));
    const solo = await createPlayer(handle.db, teamId, { displayName: "Solo only", primaryRole: "ADC", primaryPool: ["Jinx"] });
    await handle.db.update(players).set({ teamMember: false }).where(eq(players.id, solo.id));
    const ids = (await listPlayers(handle.db, teamId)).map((p) => p.id);
    expect(ids).not.toContain(gone.id);
    expect(ids).not.toContain(solo.id);
    await expect(setLineupSlot(handle.db, teamId, "TOP", gone.id)).rejects.toThrow(/archived/);
    await expect(setLineupSlot(handle.db, teamId, "ADC", solo.id)).rejects.toThrow(/not a member/);
  });
});

describe("migration 0024", () => {
  it("clears only the untouched placeholder role of accounts still in setup", async () => {
    const db = handle.db;
    const mk = async (name: string, opts: { pool?: boolean; complete: boolean; inLineup?: boolean }) => {
      const p = await createPlayer(db, teamId, { displayName: name, primaryRole: "MID", primaryPool: opts.pool ? ["Ahri"] : [] });
      await createUser(db, { username: name, password: null, role: "player", playerId: p.id, setupCompletedAt: opts.complete ? new Date() : null });
      if (opts.inLineup) {
        const lineup = await getCurrentLineup(db, teamId);
        await db.insert(lineupSlots).values({ lineupId: lineup.id, role: "TOP", playerId: p.id }).onConflictDoNothing();
      }
      return p.id;
    };
    const placeholder = await mk("Fresh", { complete: false });
    const withChampions = await mk("Halfway", { complete: false, pool: true });
    const finished = await mk("Done", { complete: true });
    const migration = EMBEDDED_MIGRATIONS.find((m) => m.tag === "0024_p7_unset_primary_role")!;
    await db.transaction(async (tx) => {
      for (const statement of migration.statements) await tx.execute(sql.raw(statement));
    });
    const role = async (id: string) => (await db.select({ r: players.primaryRole }).from(players).where(eq(players.id, id)))[0]!.r;
    expect(await role(placeholder)).toBeNull();
    expect(await role(withChampions)).toBe("MID");
    expect(await role(finished)).toBe("MID");
    // Players of complete accounts are untouched in every way.
    const [u] = await db.select().from(users).where(eq(users.playerId, finished));
    expect(u!.setupCompletedAt).not.toBeNull();
  });
});
