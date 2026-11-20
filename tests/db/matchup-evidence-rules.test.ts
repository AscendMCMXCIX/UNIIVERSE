import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { archivePlayer, createPlayer, getOrCreateTeam, setTeamMember } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { accountMatchPrep, accountMatches, matchDetails, matchTimelines, patches, players, users, type MatchParticipantDetail } from "@/server/db/schema";
import { loadMatchupEvidence } from "@/server/matchup-intel/evidence";
import { patchSortKey } from "@/domain/patch";
import type { Session } from "@/server/auth/permissions";
import { backfillMatchPrep } from "@/server/matchup-intel/prep-store";
import { eraseSubject, formerMemberSubject } from "@/server/privacy/erasure";

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
    await eraseSubject(db, owner!.id, await formerMemberSubject(db, { puuid: "gone-puuid", riotId: "GoneGuy#OCE" }));
    expect(await db.select().from(accountMatchPrep)).toEqual([]);
    await backfillMatchPrep(db);
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
});
