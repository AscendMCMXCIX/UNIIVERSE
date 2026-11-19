import { describe, expect, it } from "vitest";
import { matchParticipantSchema } from "@/server/riot/api/schemas";
import { participantDetail } from "./match-details";

/*
  What a stored match record keeps of each player from 20 Nov 2026 on, from the same match request:
  Riot's two readings of the position, the stat shards, the lane and jungle challenge figures, and
  the figures for supports and tanks. Older records keep their shape; a field Riot did not send is
  not stored (never as zero).
*/

const keyToId = new Map<number, string>([[103, "Ahri"]]);
const riot = (extra: Record<string, unknown> = {}) => matchParticipantSchema.parse({ puuid: "p1", teamId: 100, championId: 103, win: true, kills: 3, deaths: 1, assists: 4, ...extra });

describe("a stored player's record", () => {
  it("keeps both of Riot's positions apart, beside the merged one", () => {
    expect(participantDetail(riot({ teamPosition: "MIDDLE", individualPosition: "TOP" }), keyToId)).toMatchObject({ position: "MIDDLE", teamPosition: "MIDDLE", individualPosition: "TOP" });
    // No team position: the merged position is the individual one, and the empty team position is kept as sent.
    expect(participantDetail(riot({ teamPosition: "", individualPosition: "JUNGLE" }), keyToId)).toMatchObject({ position: "JUNGLE", teamPosition: "", individualPosition: "JUNGLE" });
    expect(participantDetail(riot(), keyToId)).toMatchObject({ position: null, teamPosition: "", individualPosition: "" });
  });

  it("keeps the stat shards with the rune page", () => {
    const perks = { statPerks: { offense: 5005, flex: 5008, defense: 5011 }, styles: [{ description: "primaryStyle", style: 8100, selections: [{ perk: 8112 }, { perk: 8139 }] }, { description: "subStyle", style: 8200, selections: [{ perk: 8226 }] }] };
    expect(participantDetail(riot({ perks }), keyToId).runes).toEqual({ keystone: 8112, primary: 8100, secondary: 8200, primaryPerks: [8112, 8139], secondaryPerks: [8226], shards: [5005, 5008, 5011] });
    // A page without shards keeps the page as before.
    expect(participantDetail(riot({ perks: { styles: perks.styles } }), keyToId).runes).not.toHaveProperty("shards");
  });

  it("keeps the ten lane and jungle figures under Riot's names, rounded to two decimals, and none it did not send", () => {
    const d = participantDetail(riot({ challenges: { jungleCsBefore10Minutes: 62.000003814697266, initialCrabCount: 1, scuttleCrabKills: 2, enemyJungleMonsterKills: 4.5, junglerKillsEarlyJungle: 0, killsOnLanersEarlyJungleAsJungler: 2, maxCsAdvantageOnLaneOpponent: -3.25, maxLevelLeadLaneOpponent: 2, laningPhaseGoldExpAdvantage: 1, playedChampSelectPosition: 1, soloKills: 1 } }), keyToId);
    expect(d.challenges).toEqual({ jungleCsBefore10Minutes: 62, initialCrabCount: 1, scuttleCrabKills: 2, enemyJungleMonsterKills: 4.5, junglerKillsEarlyJungle: 0, killsOnLanersEarlyJungleAsJungler: 2, maxCsAdvantageOnLaneOpponent: -3.25, maxLevelLeadLaneOpponent: 2, laningPhaseGoldExpAdvantage: 1, playedChampSelectPosition: 1 });
    // Solo kills stay with the leaderboard figures, as before.
    expect(d.stats?.soloKills).toBe(1);
    expect(participantDetail(riot({ challenges: { maxLevelLeadLaneOpponent: 1 } }), keyToId).challenges).toEqual({ maxLevelLeadLaneOpponent: 1 });
    expect(participantDetail(riot(), keyToId)).not.toHaveProperty("challenges");
    expect(participantDetail(riot({ challenges: { soloKills: 2 } }), keyToId)).not.toHaveProperty("challenges");
  });

  it("keeps the support and tank figures with the other extra figures, only those Riot sent", () => {
    const d = participantDetail(riot({ totalTimeSpentDead: 87, totalHealsOnTeammates: 4200, totalDamageShieldedOnTeammates: 3100, damageSelfMitigated: 21500, challenges: { turretPlatesTaken: 2 } }), keyToId);
    expect(d.stats).toMatchObject({ deadSeconds: 87, teamHealing: 4200, teamShielding: 3100, damageMitigated: 21500, platesTaken: 2 });
    expect(participantDetail(riot({ totalTimeSpentDead: 0 }), keyToId).stats).toEqual({ deadSeconds: 0 });
    expect(participantDetail(riot(), keyToId).stats).toEqual({});
  });
});
