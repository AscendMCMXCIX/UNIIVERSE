import { describe, expect, it } from "vitest";
import { encounterInsights, filterEncounterRows, listEncounters, recordFor, summariseEncounters, type EncounterRow } from "./encounters";

const T = Date.UTC(2026, 9, 1);
let n = 0;
/** One member in one game with one other player. */
function row(p: Partial<EncounterRow> & Pick<EncounterRow, "matchId" | "playerId" | "key" | "relation">): EncounterRow {
  return { accountId: `${p.playerId}-acc`, gameCreation: T + n++ * 1000, queueId: 420, season: 16, win: true, memberChampion: "Ahri", name: `${p.key}#OCE`, otherChampion: "Zed", ...p };
}
const one = (rows: EncounterRow[], key: string) => summariseEncounters(rows).find((s) => s.key === key)!;

describe("repeated encounters", () => {
  it("classifies allies and opponents and keeps the member's perspective for results", () => {
    const s = one(
      [
        row({ matchId: "G1", playerId: "ace", key: "x", relation: "ally", win: true }),
        row({ matchId: "G2", playerId: "ace", key: "x", relation: "ally", win: false }),
        row({ matchId: "G3", playerId: "ace", key: "x", relation: "opponent", win: true }),
      ],
      "x",
    );
    expect(s.games).toBe(3);
    expect(s.ally).toEqual({ games: 2, wins: 1, losses: 1 });
    expect(s.opponent).toEqual({ games: 1, wins: 1, losses: 0 });
    expect(s.members).toEqual([{ playerId: "ace", ally: { games: 2, wins: 1, losses: 1 }, opponent: { games: 1, wins: 1, losses: 0 } }]);
  });

  it("counts a game with two or three members once at game level and once per member", () => {
    const rows = [
      row({ matchId: "G1", playerId: "ace", key: "x", relation: "opponent", win: true }),
      row({ matchId: "G1", playerId: "bea", key: "x", relation: "opponent", win: true }),
      row({ matchId: "G2", playerId: "ace", key: "x", relation: "opponent", win: false }),
      row({ matchId: "G2", playerId: "bea", key: "x", relation: "opponent", win: false }),
      row({ matchId: "G2", playerId: "cy", key: "x", relation: "opponent", win: false }),
    ];
    const s = one(rows, "x");
    expect(s.games).toBe(2);
    expect(s.opponent).toEqual({ games: 2, wins: 1, losses: 1 });
    expect(Object.fromEntries(s.members.map((m) => [m.playerId, m.opponent.games]))).toEqual({ ace: 2, bea: 2, cy: 1 });
  });

  it("members on both sides of one game: one ally game and one opponent game, each with its own result", () => {
    const s = one(
      [
        row({ matchId: "G1", playerId: "ace", key: "x", relation: "ally", win: true }),
        row({ matchId: "G1", playerId: "bea", key: "x", relation: "opponent", win: false }),
      ],
      "x",
    );
    expect(s.games).toBe(1);
    expect(s.ally).toEqual({ games: 1, wins: 1, losses: 0 });
    expect(s.opponent).toEqual({ games: 1, wins: 0, losses: 1 });
  });

  it("never counts a member's game twice (duplicate stored records, several linked accounts)", () => {
    const s = one(
      [
        row({ matchId: "G1", playerId: "ace", accountId: "ace-1", key: "x", relation: "ally" }),
        row({ matchId: "G1", playerId: "ace", accountId: "ace-2", key: "x", relation: "ally" }),
        row({ matchId: "G2", playerId: "ace", accountId: "ace-2", key: "x", relation: "ally" }),
      ],
      "x",
    );
    expect(s.games).toBe(2);
    expect(s.members[0]!.ally.games).toBe(2);
  });

  it("identifies players by account: a rename keeps one player with the latest name; one name on two accounts stays two players", () => {
    const rows = [
      row({ matchId: "G1", playerId: "ace", key: "x", relation: "opponent", name: "Old Name#OCE", gameCreation: T }),
      row({ matchId: "G2", playerId: "ace", key: "x", relation: "opponent", name: "New Name#OCE", gameCreation: T + 10 }),
      row({ matchId: "G3", playerId: "ace", key: "y", relation: "opponent", name: "New Name#OCE", gameCreation: T + 5 }),
    ];
    const all = summariseEncounters(rows);
    expect(all).toHaveLength(2);
    expect(all.find((s) => s.key === "x")).toMatchObject({ name: "New Name#OCE", games: 2 });
  });

  it("does not count unknown results as wins or losses", () => {
    const s = one([row({ matchId: "G1", playerId: "ace", key: "x", relation: "ally", win: null }), row({ matchId: "G2", playerId: "ace", key: "x", relation: "ally", win: true })], "x");
    expect(s.ally).toEqual({ games: 2, wins: 1, losses: 0 });
  });

  it("filters by season, game mode, member and account before counting", () => {
    const rows = [
      row({ matchId: "G1", playerId: "ace", accountId: "a1", key: "x", relation: "ally", season: 15 }),
      row({ matchId: "G2", playerId: "ace", accountId: "a1", key: "x", relation: "ally", queueId: 440 }),
      row({ matchId: "G3", playerId: "ace", accountId: "a2", key: "x", relation: "ally" }),
      row({ matchId: "G4", playerId: "bea", key: "x", relation: "ally" }),
    ];
    const f = (o: Partial<Parameters<typeof filterEncounterRows>[1]>) => filterEncounterRows(rows, { season: null, queues: null, playerId: null, accountId: null, ...o }).map((r) => r.matchId);
    expect(f({ season: 16 })).toEqual(["G2", "G3", "G4"]);
    expect(f({ queues: [420] })).toEqual(["G1", "G3", "G4"]);
    expect(f({ playerId: "ace" })).toEqual(["G1", "G2", "G3"]);
    expect(f({ playerId: "ace", accountId: "a1" })).toEqual(["G1", "G2"]);
  });

  it("lists by relation with a minimum, the shared view needs two members, and records sort best or worst", () => {
    const rows = [
      // x: ally 3 times (2W 1L) with ace; y: opponent twice with ace and once with bea; z: once.
      ...["G1", "G2", "G3"].map((m, i) => row({ matchId: m, playerId: "ace", key: "x", relation: "ally", win: i < 2 })),
      row({ matchId: "G4", playerId: "ace", key: "y", relation: "opponent", win: false }),
      row({ matchId: "G5", playerId: "ace", key: "y", relation: "opponent", win: false }),
      row({ matchId: "G6", playerId: "bea", key: "y", relation: "opponent", win: true }),
      row({ matchId: "G7", playerId: "ace", key: "z", relation: "opponent" }),
    ];
    const all = summariseEncounters(rows);
    expect(listEncounters(all, { view: "allies", min: 2, sort: "games" }).map((s) => s.key)).toEqual(["x"]);
    expect(listEncounters(all, { view: "allies", min: 5, sort: "games" })).toEqual([]);
    expect(listEncounters(all, { view: "opponents", min: 2, sort: "games" }).map((s) => s.key)).toEqual(["y"]);
    expect(listEncounters(all, { view: "shared", min: 2, sort: "games" }).map((s) => s.key)).toEqual(["y"]);
    expect(recordFor(all.find((s) => s.key === "y")!, "opponents")).toEqual({ games: 3, wins: 1, losses: 2 });
    expect(listEncounters(all, { view: "opponents", min: 1, sort: "worst" }).map((s) => s.key)).toEqual(["y", "z"]);
    expect(listEncounters(all, { view: "opponents", min: 1, sort: "best" }).map((s) => s.key)).toEqual(["z", "y"]);
    expect(listEncounters(all, { view: "opponents", min: 1, sort: "games", query: "Z#" }).map((s) => s.key)).toEqual(["z"]);
  });

  it("gives insights only with enough games behind them", () => {
    const few = summariseEncounters([row({ matchId: "G1", playerId: "ace", key: "x", relation: "opponent" }), row({ matchId: "G2", playerId: "ace", key: "x", relation: "opponent" })]);
    expect(encounterInsights(few).insights).toEqual([]);
    const many = summariseEncounters(Array.from({ length: 6 }, (_, i) => row({ matchId: `G${i}`, playerId: i % 2 ? "ace" : "bea", key: "x", relation: "opponent", win: i < 2 })));
    const { insights, sharedPlayers } = encounterInsights(many);
    expect(insights.map((i) => [i.kind, i.record.games])).toEqual([
      ["frequent-opponent", 6],
      ["toughest-opponent", 6],
    ]);
    expect(sharedPlayers).toBe(1);
  });
});
