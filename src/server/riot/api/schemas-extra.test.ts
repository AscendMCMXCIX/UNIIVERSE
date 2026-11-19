import { describe, expect, it } from "vitest";
import { LANE_CHALLENGE_KEYS, matchParticipantSchema } from "./schemas";

describe("leaderboard extras in the match participant schema", () => {
  it("keeps the figures Riot sends", () => {
    const p = matchParticipantSchema.parse({ puuid: "x", teamId: 100, championId: 1, win: true, pentaKills: 1, firstBloodKill: true, challenges: { soloKills: 3, other: 9 } });
    expect(p).toMatchObject({ pentaKills: 1, firstBloodKill: true, challenges: { soloKills: 3 } });
  });

  it("never fails a match over an unexpected extra value", () => {
    const p = matchParticipantSchema.parse({ puuid: "x", teamId: 100, championId: 1, win: true, pentaKills: "1", firstBloodKill: null, challenges: null });
    expect(p.pentaKills).toBeUndefined();
    expect(p.firstBloodKill).toBeUndefined();
    expect(p.challenges).toBeUndefined();
    expect(matchParticipantSchema.parse({ puuid: "x", teamId: 100, championId: 1, win: true, challenges: { soloKills: "lots" } }).challenges).toEqual({ soloKills: undefined });
  });
});

describe("the lane and jungle figures, shards and support figures (kept from 20 Nov 2026 on)", () => {
  const base = { puuid: "x", teamId: 100, championId: 1, win: true };
  const ten = {
    jungleCsBefore10Minutes: 62.000003814697266,
    initialCrabCount: 1,
    scuttleCrabKills: 2,
    enemyJungleMonsterKills: 4.5,
    junglerKillsEarlyJungle: 1,
    killsOnLanersEarlyJungleAsJungler: 2,
    maxCsAdvantageOnLaneOpponent: 23.5,
    maxLevelLeadLaneOpponent: 2,
    laningPhaseGoldExpAdvantage: 1,
    playedChampSelectPosition: 1,
  };

  it("keeps the ten figures and the plates, and drops the rest of Riot's challenges", () => {
    const p = matchParticipantSchema.parse({ ...base, challenges: { ...ten, soloKills: 1, turretPlatesTaken: 3, kda: 4.2, controlWardTimeCoverageInRiverOrEnemyHalf: 0.57 } });
    expect(p.challenges).toEqual({ ...ten, soloKills: 1, turretPlatesTaken: 3 });
    for (const key of LANE_CHALLENGE_KEYS) expect(p.challenges).toHaveProperty(key);
  });

  it("parses a record without them, and an unexpected value reads as absent", () => {
    expect(matchParticipantSchema.parse(base).challenges).toBeUndefined();
    const odd = matchParticipantSchema.parse({ ...base, challenges: { maxCsAdvantageOnLaneOpponent: "lots", initialCrabCount: null }, totalTimeSpentDead: "1m" });
    expect(odd.challenges?.maxCsAdvantageOnLaneOpponent).toBeUndefined();
    expect(odd.challenges?.initialCrabCount).toBeUndefined();
    expect(odd.totalTimeSpentDead).toBeUndefined();
  });

  it("keeps the stat shards, and never fails a rune page whose shards are odd", () => {
    const styles = [{ description: "primaryStyle", style: 8100, selections: [{ perk: 8112 }] }];
    expect(matchParticipantSchema.parse({ ...base, perks: { statPerks: { offense: 5005, flex: 5008, defense: 5011 }, styles } }).perks?.statPerks).toEqual({ offense: 5005, flex: 5008, defense: 5011 });
    const odd = matchParticipantSchema.parse({ ...base, perks: { statPerks: { offense: "5005" }, styles } });
    expect(odd.perks?.statPerks).toBeUndefined();
    expect(odd.perks?.styles).toHaveLength(1);
  });
});
