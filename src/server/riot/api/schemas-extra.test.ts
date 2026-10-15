import { describe, expect, it } from "vitest";
import { matchParticipantSchema } from "./schemas";

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
