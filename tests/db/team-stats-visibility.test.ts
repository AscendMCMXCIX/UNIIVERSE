import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountChampionHistory, accountMatches, patches, riotAccounts, users } from "@/server/db/schema";
import { patchSortKey } from "@/domain/patch";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam, setLineupSlot } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { getTeamRosterForViewer } from "@/server/team/roster";
import { invalidateProficiencyCache } from "@/server/proficiency/service";
import { STANDARD_PLAYER, type Capability, type Session } from "@/server/auth/permissions";

/*
  D5 (final UX review): an account without "view teammates' statistics" must not receive any
  teammate's numerical performance figures from Team Overview: not on the card, not in the detail
  panel, not hidden in the data sent to the browser. It still gets names, roles, lineup places and
  pool champions, and always its own figures. Authorised members are unaffected.
*/

let handle: DbHandle;
let teamId: string;
let fighter: string;
let newbie: string;

const session = (playerId: string | null, capabilities: readonly Capability[]): Session => ({ userId: "11111111-1111-4111-8111-111111111111", label: "Viewer", username: "viewer", hasPassword: true, mustChangePassword: false, setupComplete: true, role: "player", playerId, capabilities: [...capabilities], teamMember: true });
const RESTRICTED: Capability[] = STANDARD_PLAYER.filter((c) => c !== "view-teammate-stats");

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  const db = handle.db;
  teamId = (await getOrCreateTeam(db)).id;
  fighter = (await createPlayer(db, teamId, { displayName: "Fighter", primaryRole: "TOP", primaryPool: ["Riven", "Gwen"] })).id;
  newbie = (await createPlayer(db, teamId, { displayName: "Newbie", primaryRole: "JUNGLE", primaryPool: ["Viego"] })).id;
  // A registered substitute with a strong Mid record: the vacant Mid slot suggests them.
  const sub = (await createPlayer(db, teamId, { displayName: "Sub", primaryRole: "MID", primaryPool: ["Ahri"] })).id;
  await db.insert(users).values({ username: "sub", displayName: "Sub", role: "player", playerId: sub, setupCompletedAt: new Date() });
  await setLineupSlot(db, teamId, "TOP", fighter);
  await setLineupSlot(db, teamId, "JUNGLE", newbie);
  await db.update(patches).set({ isCurrent: false });
  await db.insert(patches).values({ id: "16.20", ddragonVersion: "16.20.1", isCurrent: true, sortKey: patchSortKey("16.20") });
  const recent = new Date(Date.now() - 2 * 86_400_000);
  const games = (accountId: string, prefix: string, championId: string, role: string) =>
    db.insert(accountMatches).values(Array.from({ length: 6 }, (_, i) => ({ accountId, matchId: `OC1_${prefix}${i}`, gameCreation: Date.now() - i * 3_600_000, queueId: 420, championId, role, win: i % 3 !== 0, patch: "16.20", kills: 7, deaths: 3, assists: 6, cs: 210, damage: 21000, visionScore: 23, gameDuration: 1800 })));
  for (const [playerId, riotId, championId, role, prefix] of [
    [fighter, "Fighter#OCE", "Riven", "TOP", "F"],
    [newbie, "Newbie#OCE", "Viego", "JUNGLE", "N"],
    [sub, "Sub#OCE", "Ahri", "MID", "S"],
  ] as const) {
    const account = await addAccount(db, { ownerType: "player", playerId, riotId, platform: "oc1" });
    await db.update(riotAccounts).set({ tier: "GOLD", division: "II", leaguePoints: 64, rankQueue: "solo" }).where(eq(riotAccounts.id, account.id));
    await db.insert(accountChampionHistory).values({ accountId: account.id, championId, role, queueGroup: "solo", patch: "16.20", games: 140, wins: 80, lastPlayedAt: recent });
    await games(account.id, prefix, championId, role);
  }
  invalidateProficiencyCache();
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("Team Overview statistics by permission", () => {
  it("a member without the statistics permission gets no numbers for teammates, only identity and pool", async () => {
    const roster = await getTeamRosterForViewer(handle.db, teamId, session(newbie, RESTRICTED));
    const top = roster.slots.find((s) => s.role === "TOP")!;
    expect(top.player).toMatchObject({ id: fighter, name: "Fighter", statsVisible: false, rank: null, season: null, rankChange: null });
    expect(top.champions.map((c) => c.championId)).toEqual(["Riven", "Gwen"]);
    for (const c of top.champions) {
      expect(c).toMatchObject({ games: 0, wins: 0, losses: 0, winRate: null, kdaRatio: null, csPerMinute: null, visionPerGame: null, masteryPoints: null, tierLabel: "", tierWhy: "", lastPlayedAt: null });
    }
    // Nothing of the teammate's record is anywhere in what the page would send.
    const sent = JSON.stringify(top);
    expect(sent).not.toMatch(/GOLD|"games":[1-9]|"winRate":0\.|Main|Comfortable/);
  });

  it("the same member still sees their own figures", async () => {
    const roster = await getTeamRosterForViewer(handle.db, teamId, session(newbie, RESTRICTED));
    const own = roster.slots.find((s) => s.role === "JUNGLE")!;
    expect(own.player).toMatchObject({ id: newbie, statsVisible: true });
    expect(own.player!.season?.games).toBeGreaterThan(0);
    expect(own.player!.rank?.tier).toBe("GOLD");
    expect(own.champions[0]!.games).toBeGreaterThan(0);
  });

  it("vacant-role suggestions do not cite a hidden player's games", async () => {
    const restricted = (await getTeamRosterForViewer(handle.db, teamId, session(newbie, RESTRICTED))).slots.find((s) => s.role === "MID")!;
    const allowed = (await getTeamRosterForViewer(handle.db, teamId, session(newbie, STANDARD_PLAYER))).slots.find((s) => s.role === "MID")!;
    expect(restricted.suggestions.map((s) => s.name)).toContain("Sub");
    expect(restricted.suggestions.flatMap((s) => s.reasons).join(" ")).not.toMatch(/\d+ games/);
    expect(allowed.suggestions.flatMap((s) => s.reasons).join(" ")).toMatch(/\d+ games/);
  });

  it("members with the permission see every teammate's figures, as before", async () => {
    const roster = await getTeamRosterForViewer(handle.db, teamId, session(newbie, STANDARD_PLAYER));
    const top = roster.slots.find((s) => s.role === "TOP")!;
    expect(top.player).toMatchObject({ statsVisible: true });
    expect(top.player!.season?.games).toBeGreaterThan(0);
    expect(top.player!.rank?.tier).toBe("GOLD");
    expect(top.champions.find((c) => c.championId === "Riven")!.games).toBeGreaterThan(0);
  });

  it("an account with no player profile and no permission sees no one's figures", async () => {
    const roster = await getTeamRosterForViewer(handle.db, teamId, session(null, RESTRICTED));
    expect(roster.slots.filter((s) => s.player).every((s) => !s.player!.statsVisible && s.player!.season === null && s.player!.rank === null)).toBe(true);
  });
});
