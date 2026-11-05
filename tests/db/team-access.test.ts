import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { RiotApiError } from "@/server/riot/api/client";
import { verifyRiotIdentity, type RiotIdentityClient } from "@/server/riot/verify-identity";
import { createVerifiedPlayerAccount, listAccountViews } from "@/server/auth/account-admin";
import { completeSetup } from "@/server/auth/onboarding";
import { createUser, getUser } from "@/server/repositories/users";
import { sessionFromUser } from "@/server/auth/session";
import { canEditPlayer, canUseAdminArea, hasPermission, isTeamMember } from "@/server/auth/permissions";
import { createPlayer, getCurrentLineup, getOrCreateTeam, listPlayers, listProfilesForAdmin, setLineupSlot, setTeamMember } from "@/server/repositories/team";

/* Team membership (Phase 10): personal-use accounts, promotion to the team and back, and the Admin account list that shows every account. */

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
  "solo#oce": { puuid: "puuid-solo", gameName: "Solo", tagLine: "OCE", platform: "oc1" },
  "pending#oce": { puuid: "puuid-pending", gameName: "Pending", tagLine: "OCE", platform: "oc1" },
  "member#oce": { puuid: "puuid-member", gameName: "Member", tagLine: "OCE", platform: "oc1" },
});

let handle: DbHandle;
let teamId: string;
let ownerId: string;
const verified = async (riotId: string) => {
  const r = await verifyRiotIdentity(handle.db, riotId, riot, { platformHint: "oc1" });
  if (r.status !== "verified") throw new Error(r.status);
  return r;
};
const sessionOf = async (userId: string) => sessionFromUser((await getUser(handle.db, userId))!);

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  teamId = (await getOrCreateTeam(handle.db)).id;
  ownerId = (await createUser(handle.db, { username: "adminascend", password: "Owner-pass-123", role: "owner" })).id;
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("personal-use accounts", () => {
  let solo: { userId: string; playerId: string };
  beforeAll(async () => {
    const created = await createVerifiedPlayerAccount(handle.db, { username: "Solo", identity: await verified("Solo#OCE"), teamMember: false, createdByUserId: ownerId });
    solo = { userId: created.user.id, playerId: created.playerId };
    await completeSetup(handle.db, solo.userId, { primaryRole: "MID", primaryPool: ["Ahri"] });
  });

  it("keep their own profile but none of the team workspace", async () => {
    const s = await sessionOf(solo.userId);
    expect(s.teamMember).toBe(false);
    expect(isTeamMember(s)).toBe(false);
    for (const p of ["view-team", "view-players", "view-teammate-stats", "view-matches", "manage-lineup", "manage-matches"] as const) expect(hasPermission(s, p), p).toBe(false);
    expect(hasPermission(s, "edit-own-profile")).toBe(true);
    expect(canEditPlayer(s, solo.playerId)).toBe(true);
    expect(canUseAdminArea(s)).toBe(false);
    // Even extra groups do not open the team workspace for them.
    expect(hasPermission({ ...s, capabilities: [...(s.capabilities ?? []), "manage-lineup"] }, "manage-lineup")).toBe(false);
  });

  it("are not in Players or lineup selection, but Admin sees them", async () => {
    expect((await listPlayers(handle.db, teamId)).map((p) => p.displayName)).not.toContain("Solo");
    expect((await listPlayers(handle.db, teamId, { includePersonal: true })).map((p) => p.displayName)).toContain("Solo");
    await expect(setLineupSlot(handle.db, teamId, "MID", solo.playerId)).rejects.toThrow("That player is not on the team, so they cannot join the lineup.");
    expect((await listProfilesForAdmin(handle.db, teamId)).find((p) => p.id === solo.playerId)).toMatchObject({ teamMember: false, primaryRole: "MID" });
    expect((await listAccountViews(handle.db)).find((a) => a.userId === solo.userId)).toMatchObject({ teamMember: false });
  });

  it("join the team with one switch, keeping everything of theirs, and can leave it again", async () => {
    await setTeamMember(handle.db, teamId, solo.playerId, true);
    const s = await sessionOf(solo.userId);
    expect(hasPermission(s, "view-team")).toBe(true);
    expect(hasPermission(s, "view-matches")).toBe(true);
    const listed = (await listPlayers(handle.db, teamId)).find((p) => p.id === solo.playerId);
    expect(listed).toMatchObject({ primaryRole: "MID", primaryPool: ["Ahri"] });
    await setLineupSlot(handle.db, teamId, "MID", solo.playerId);
    // Holding a lineup place: leaving the team is refused until the place goes to someone else.
    await expect(setTeamMember(handle.db, teamId, solo.playerId, false)).rejects.toThrow(/Mid place/);
    await setLineupSlot(handle.db, teamId, "MID", null);
    await setTeamMember(handle.db, teamId, solo.playerId, false);
    expect(hasPermission(await sessionOf(solo.userId), "view-team")).toBe(false);
    expect((await listPlayers(handle.db, teamId, { includePersonal: true })).find((p) => p.id === solo.playerId)?.primaryPool).toEqual(["Ahri"]);
    expect((await getCurrentLineup(handle.db, teamId)).slots.MID).toBeUndefined();
  });
});

describe("the Admin account list shows every account", () => {
  it("includes accounts that have not signed in or finished setup (no primary role yet)", async () => {
    const pending = await createVerifiedPlayerAccount(handle.db, { username: "Pending", identity: await verified("Pending#OCE"), teamMember: true, createdByUserId: ownerId });
    // A member in setup is a member: the directory lists them, without a role and marked as in setup.
    expect((await listPlayers(handle.db, teamId)).find((p) => p.id === pending.playerId)).toMatchObject({ primaryRole: null, setupPending: true });
    // Admin's list is built from the stored rows, so the account is there with its state.
    const row = (await listProfilesForAdmin(handle.db, teamId)).find((p) => p.id === pending.playerId);
    expect(row).toMatchObject({ displayName: "Pending", primaryRole: null, teamMember: true, archived: false });
    const view = (await listAccountViews(handle.db)).find((a) => a.playerId === pending.playerId)!;
    expect(view).toMatchObject({ setupComplete: false, lastLoginAt: null, password: { state: "temporary" }, isActive: true });
  });

  it("team members created before Phase 10 stay members", async () => {
    const old = await createPlayer(handle.db, teamId, { displayName: "Veteran", primaryRole: "TOP", primaryPool: ["Gwen"] });
    expect((await listProfilesForAdmin(handle.db, teamId)).find((p) => p.id === old.id)?.teamMember).toBe(true);
    const member = await createVerifiedPlayerAccount(handle.db, { username: "Member", identity: await verified("Member#OCE"), createdByUserId: ownerId });
    expect((await listProfilesForAdmin(handle.db, teamId)).find((p) => p.id === member.playerId)?.teamMember).toBe(true);
  });

  it("the Owner stays the Owner, works only in Admin Mode, and is never a personal-use account", async () => {
    const s = await sessionOf(ownerId);
    expect(canUseAdminArea(s)).toBe(true);
    expect(isTeamMember(s)).toBe(true);
    expect(hasPermission(s, "manage-lineup")).toBe(true);
    expect(hasPermission(s, "manage-users")).toBe(true);
  });
});
