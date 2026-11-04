import { describe, expect, it } from "vitest";
import { matchSchema } from "@/server/riot/api/schemas";
import { matchDetailRow } from "./match-details";
import { foldInputFromMatch, foldInputFromRecord, type FoldRecord } from "./fold-input";

/** The stored row as the database gives it back. */
const asStored = (row: ReturnType<typeof matchDetailRow>): FoldRecord => ({ matchId: row.matchId, gameCreation: Number(row.gameCreation), gameDuration: row.gameDuration, queueId: row.queueId ?? null, gameVersion: row.gameVersion ?? null, participants: row.participants });

/*
  A game folded from its stored record must be the game Riot returned: the record is built from
  Riot's answer by matchDetailRow, and foldInputFromRecord must read back exactly what
  foldInputFromMatch takes from the answer, for every kind of participant Riot sends.
*/

const keyToId = new Map<number, string>([
  [103, "Ahri"],
  [887, "Gwen"],
  [64, "LeeSin"],
]);

function riotMatch(over: { participants?: Array<Record<string, unknown>> } = {}) {
  const base = (i: number): Record<string, unknown> => ({
    puuid: `p-${i}`,
    teamId: i < 5 ? 100 : 200,
    championId: [103, 887, 64][i % 3],
    teamPosition: ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"][i % 5],
    win: i < 5,
    kills: i,
    deaths: 10 - i,
    assists: 2 * i,
    totalMinionsKilled: 100 + i,
    neutralMinionsKilled: i,
    totalDamageDealtToChampions: 10_000 + i,
    visionScore: 20 + i,
    riotIdGameName: `Player${i}`,
    riotIdTagline: "OCE",
  });
  return matchSchema.parse({
    metadata: { matchId: "OC1_42" },
    info: { gameCreation: 1_760_000_000_000, gameDuration: 1834, gameVersion: "16.21.700.1", queueId: 420, teams: [], participants: over.participants ?? Array.from({ length: 10 }, (_, i) => base(i)) },
  });
}

describe("folding a game from its stored record", () => {
  it("reads back exactly what Riot's answer gives, participant by participant", () => {
    const match = riotMatch();
    const record = matchDetailRow("oc1", match, keyToId);
    const fromRecord = foldInputFromRecord(asStored(record));
    expect(fromRecord).toEqual(foldInputFromMatch(match));
  });

  it("agrees on players with missing figures, no team position, and only an old summoner name", () => {
    const odd: Array<Record<string, unknown>> = [
      // Riot left out CS, damage and vision.
      { puuid: "a", teamId: 100, championId: 103, teamPosition: "TOP", win: true, kills: 1, deaths: 2, assists: 3 },
      // No team position: the individual position stands in, from both sources.
      { puuid: "b", teamId: 100, championId: 887, teamPosition: "", individualPosition: "JUNGLE", win: true, kills: 0, deaths: 0, assists: 0, neutralMinionsKilled: 120 },
      // No position at all.
      { puuid: "c", teamId: 200, championId: 64, win: false, kills: 5, deaths: 5, assists: 5, totalMinionsKilled: 0 },
      // An old record: a summoner name, no Riot ID.
      { puuid: "d", teamId: 200, championId: 103, teamPosition: "UTILITY", win: false, kills: 0, deaths: 3, assists: 9, summonerName: "OldName" },
    ];
    const match = riotMatch({ participants: odd });
    const record = matchDetailRow("oc1", match, keyToId);
    const fromMatch = foldInputFromMatch(match);
    expect(foldInputFromRecord(asStored(record))).toEqual(fromMatch);
    expect(fromMatch.participants.map((p) => p.position)).toEqual(["TOP", "JUNGLE", "", "UTILITY"]);
    expect(fromMatch.participants[0]).toMatchObject({ cs: null, damage: null, visionScore: null });
    expect(fromMatch.participants[3]!.riotId).toBe("OldName");
  });

  it("never lets an erased player be matched by a PUUID or a name", () => {
    const match = riotMatch();
    const record = matchDetailRow("oc1", match, keyToId, { participant: (p: { puuid: string }) => p.puuid === "p-3" } as never);
    const input = foldInputFromRecord(asStored(record))!;
    const removed = input.participants.filter((p) => p.removed);
    expect(removed).toHaveLength(1);
    expect(removed[0]).toMatchObject({ puuid: "", riotId: null, championKey: 0, position: "" });
    expect(input.participants.some((p) => p.puuid === "p-3")).toBe(false);
  });

  it("does not stand in for Riot when the record has no players or no duration", () => {
    expect(foldInputFromRecord({ matchId: "OC1_1", gameCreation: 1, gameDuration: 1800, queueId: 420, gameVersion: null, participants: [] })).toBeNull();
    expect(foldInputFromRecord({ matchId: "OC1_1", gameCreation: 1, gameDuration: 0, queueId: 420, gameVersion: null, participants: [{ puuid: "x", name: null, teamId: 100, championKey: 1, position: null, win: true, kills: 0, deaths: 0, assists: 0, cs: null, damage: null, vision: null }] })).toBeNull();
  });
});
