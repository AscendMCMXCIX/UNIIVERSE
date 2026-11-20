import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { archivePlayer, createPlayer, deletePlayer, getOrCreateTeam, setTeamMember } from "@/server/repositories/team";
import { addAccount, listAccountsForPlayer, removeAccount } from "@/server/accounts/repository";
import { changeAccountRiotId } from "@/server/accounts/change-riot-id";
import { RiotApiClient } from "@/server/riot/api/client";
import { RateLimiter } from "@/server/riot/api/rate-limiter";
import { deleteAccount, deleteProfile } from "@/server/auth/account-admin";
import { accountMatchPrep, accountMatches, matchDetails, matchTimelines, patches, players, users, type MatchParticipantDetail } from "@/server/db/schema";
import { loadMatchupEvidence } from "@/server/matchup-intel/evidence";
import { patchSortKey } from "@/domain/patch";
import type { Session } from "@/server/auth/permissions";
import { backfillMatchPrep } from "@/server/matchup-intel/prep-store";
import { eraseSubject, formerMemberSubject, previewErasure } from "@/server/privacy/erasure";
import { erasureLines } from "@/components/admin/erase-person";

/*
  Matchup Intel's evidence rows against the rest of the app's rules (S7b review): a permanent erasure
  of a lane opponent leaves no trace of them in a member's row, and a profile made personal-use or
  archived stops counting in the team's games at once, not an hour later.
*/

let handle: DbHandle;
const LANES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
function rec(): MatchParticipantDetail[] {
  return Array.from({ length: 10 }, (_, i) => ({
    puuid: i === 0 ? "me-puuid" : i === 5 ? "gone-puuid" : `x${i}`, name: i === 5 ? "GoneGuy#OCE" : null,
    teamId: i < 5 ? 100 : 200, championId: i === 0 ? "Riven" : i === 5 ? "Darius" : `F${i}`, championKey: 0, champLevel: 14,
    position: LANES[i % 5]!, teamPosition: LANES[i % 5]!, individualPosition: LANES[i % 5]!, win: i < 5,
    kills: 1, deaths: 1, assists: 1, cs: 1, gold: 1, damage: 1, damageTaken: 1, vision: 1, wardsPlaced: 1, items: null, spells: [4, 14],
    runes: { keystone: 8010, primary: 8000, secondary: 8400, primaryPerks: [8010, 9111, 9104, 8299], secondaryPerks: [8446, 8451] },
  })) as MatchParticipantDetail[];
}
beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  await handle.db.update(patches).set({ isCurrent: false });
  await handle.db.insert(patches).values({ id: "16.22", ddragonVersion: "16.22.1", isCurrent: true, sortKey: patchSortKey("16.22") }).onConflictDoUpdate({ target: patches.id, set: { isCurrent: true } });
}, 60_000);
afterAll(async () => { await handle.close(); });

describe("Matchup Intel's evidence rows and the app's other rules", () => {
  it("an erased lane opponent's champion and positions leave the member's evidence row; the backfill makes it again from the de-identified record", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const p = await createPlayer(db, team.id, { displayName: "me", primaryRole: "TOP", primaryPool: ["Riven"] });
    const acc = await addAccount(db, { ownerType: "player", playerId: p.id, riotId: "me#OCE", platform: "oc1", puuid: "me-puuid" });
    const [owner] = await db.insert(users).values({ username: "boss", displayName: "B", role: "owner", passwordHash: "x" }).returning();
    await db.insert(accountMatches).values({ accountId: acc.id, matchId: "M1", gameCreation: 1, queueId: 420, championId: "Riven", role: "TOP", win: true, enemyChampionId: "Darius", patch: "16.22", gameDuration: 1800, teamId: 100 });
    await db.insert(matchDetails).values({ matchId: "M1", platform: "oc1", queueId: 420, gameCreation: 1, gameDuration: 1800, gameVersion: "16.22.1", teams: [], participants: rec() });
    await db.insert(matchTimelines).values({ matchId: "M1", platform: "oc1", participants: [{ puuid: "me-puuid", purchases: [], skills: [] }, { puuid: "gone-puuid", purchases: [], skills: [] }], frames: { t: [0, 60000], p: {} }, events: { objectives: [] } });
    await backfillMatchPrep(db);
    expect((await db.select().from(accountMatchPrep))[0]!.prep.vs).toBe("Darius");
    const subject = await formerMemberSubject(db, { puuid: "gone-puuid", riotId: "GoneGuy#OCE" });
    // The preview says what happens to the others' evidence rows of the shared games (R7 review B2).
    const preview = await previewErasure(db, subject);
    expect(preview.counts.evidenceRows).toBe(1);
    expect(erasureLines(preview.counts).join(" ")).toContain("1 Matchup Intel evidence row of those games is made again without them.");
    await eraseSubject(db, owner!.id, subject);
    // Made again from the de-identified record by the erasure itself, not left for a backfill run.
    expect(await backfillMatchPrep(db)).toMatchObject({ read: 0, inserted: 0 });
    const [again] = await db.select().from(accountMatchPrep);
    expect(again!.prep).toMatchObject({ lane: "TOP", rule: null, spells: "4,14" });
    expect(again!.prep.vs).toBeUndefined();
  });

  it("a teammate made personal-use, or archived, stops counting in the team's games at once", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const mate = await createPlayer(db, team.id, { displayName: "mate", primaryRole: "TOP", primaryPool: ["Riven"] });
    const acc = await addAccount(db, { ownerType: "player", playerId: mate.id, riotId: "mate#OCE", platform: "oc1", puuid: "mate-puuid" });
    for (let i = 0; i < 3; i++) {
      const matchId = `MATE${i}`;
      const parts = rec().map((x, k) => (k === 0 ? { ...x, puuid: "mate-puuid" } : x.puuid === "gone-puuid" ? { ...x, puuid: `other${i}` } : x));
      await db.insert(accountMatches).values({ accountId: acc.id, matchId, gameCreation: 10 + i, queueId: 420, championId: "Riven", role: "TOP", win: true, enemyChampionId: "Darius", patch: "16.22", gameDuration: 1800, teamId: 100 });
      await db.insert(matchDetails).values({ matchId, platform: "oc1", queueId: 420, gameCreation: 10 + i, gameDuration: 1800, gameVersion: "16.22.1", teams: [], participants: parts });
    }
    await backfillMatchPrep(db);
    const viewer = { userId: "u", role: "player", label: "v", playerId: null, username: null, hasPassword: true, mustChangePassword: false, setupComplete: true } as Session;
    const champ = (id: string) => ({ id, name: id, title: "", portrait: "" });
    const teamN = async () => (await loadMatchupEvidence(db, viewer, { role: "top", you: champ("Riven"), enemy: champ("Darius"), ally: null, enemy2: null }, [champ("Riven"), champ("Darius")]))!.sections.find((s) => s.scope === "team")!.n;
    expect(await teamN()).toBe(3);
    await setTeamMember(db, team.id, mate.id, false);
    expect(await teamN()).toBe(0);
    await setTeamMember(db, team.id, mate.id, true);
    expect(await teamN()).toBe(3);
    await archivePlayer(db, mate.id, true);
    expect(await teamN()).toBe(0);
    expect((await db.select({ id: players.id }).from(players).where(eq(players.id, mate.id))).length).toBe(1);
  });

  /*
    R7 review B1: the rows go by cascade when a Riot account or a profile is removed, and the cached
    team counts must go with them, not an hour later. Each way out: removing the account, deleting
    the profile (three paths), and deleting the member's account, which archives the profile.
  */
  it("a removed Riot account, a deleted profile or a deleted member's account stops counting in the team's games at once", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const viewer = { userId: "u", role: "player", label: "v", playerId: null, username: null, hasPassword: true, mustChangePassword: false, setupComplete: true } as Session;
    const champ = (id: string) => ({ id, name: id, title: "", portrait: "" });
    const teamN = async () => (await loadMatchupEvidence(db, viewer, { role: "top", you: champ("Riven"), enemy: champ("Darius"), ally: null, enemy2: null }, [champ("Riven"), champ("Darius")]))!.sections.find((s) => s.scope === "team")!.n;
    // Nothing of the earlier tests' teammate is counted from here on.
    await db.update(players).set({ teamMember: false });
    let k = 0;
    const member = async (label: string) => {
      const p = await createPlayer(db, team.id, { displayName: label, primaryRole: "TOP", primaryPool: ["Riven"] });
      const acc = await addAccount(db, { ownerType: "player", playerId: p.id, riotId: `${label}#OCE`, platform: "oc1", puuid: `${label}-puuid` });
      for (let i = 0; i < 3; i++) {
        const matchId = `GONE${k++}`;
        const parts = rec().map((x, j) => (j === 0 ? { ...x, puuid: `${label}-puuid` } : x.puuid === "gone-puuid" ? { ...x, puuid: `foe${matchId}` } : x));
        await db.insert(accountMatches).values({ accountId: acc.id, matchId, gameCreation: 10 + i, queueId: 420, championId: "Riven", role: "TOP", win: true, enemyChampionId: "Darius", patch: "16.22", gameDuration: 1800, teamId: 100 });
        await db.insert(matchDetails).values({ matchId, platform: "oc1", queueId: 420, gameCreation: 10 + i, gameDuration: 1800, gameVersion: "16.22.1", teams: [], participants: parts });
      }
      await backfillMatchPrep(db);
      expect(await teamN()).toBe(3);
      return { p, acc };
    };
    const a = await member("acct");
    await removeAccount(db, a.acc.id);
    expect(await teamN()).toBe(0);
    const b = await member("plain");
    await deletePlayer(db, b.p.id);
    expect(await teamN()).toBe(0);
    const c = await member("noaccount");
    await deleteProfile(db, c.p.id);
    expect(await teamN()).toBe(0);
    // Replacing a Riot ID with a different account deletes the old one (R7 refuter: the replace flow).
    const e = await member("replaced");
    const riot = async (input: string | URL | Request): Promise<Response> => {
      const url = String(input);
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (url.includes("/by-riot-id/")) return json({ puuid: "fresh-puuid", gameName: "Fresh", tagLine: "OCE" });
      if (url.includes("/region/by-game/")) return json({ puuid: "fresh-puuid", game: "lol", region: "oc1" });
      return json([]);
    };
    const client = new RiotApiClient({ apiKey: "k", fetchImpl: riot, limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {}, maxRetries: 0 });
    const old = (await listAccountsForPlayer(db, e.p.id)).find((x) => x.id === e.acc.id)!;
    expect((await changeAccountRiotId(db, client, old, "Fresh#OCE", { confirmReplace: true })).kind).toBe("replaced");
    expect(await teamN(), "after a replaced Riot ID").toBe(0);
    for (const eraseProfile of [true, false]) {
      const d = await member(`withuser${eraseProfile}`);
      const [u] = await db.insert(users).values({ username: `u${eraseProfile}`, displayName: "U", role: "player", passwordHash: "x", playerId: d.p.id }).returning();
      await deleteAccount(db, null, u!.id, { eraseProfile });
      expect(await teamN(), `eraseProfile ${eraseProfile}`).toBe(0);
    }
  });
});
