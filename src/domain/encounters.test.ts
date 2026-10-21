import { describe, expect, it } from "vitest";
import { ENCOUNTER_PAGE, encounterGames, encounterInsights, encounterListChoice, encounterListParams, listEncounters, recordFor, summariseEncounters, type EncounterRow } from "./encounters";

const T = Date.UTC(2026, 9, 1);
let n = 0;
/** The player in one game with one other player. */
function row(p: Partial<EncounterRow> & Pick<EncounterRow, "matchId" | "key" | "relation">): EncounterRow {
  return { gameCreation: T + n++ * 1000, queueId: 420, win: true, memberChampion: "Ahri", name: `${p.key}#OCE`, otherChampion: "Zed", ...p };
}
const one = (rows: EncounterRow[], key: string) => summariseEncounters(rows).find((s) => s.key === key)!;

describe("encounters of one player", () => {
  it("classifies allies and opponents, with the player's own result", () => {
    const s = one(
      [
        row({ matchId: "G1", key: "x", relation: "ally", win: true }),
        row({ matchId: "G2", key: "x", relation: "ally", win: false }),
        row({ matchId: "G3", key: "x", relation: "opponent", win: true }),
      ],
      "x",
    );
    expect(s.games).toBe(3);
    expect(s.ally).toEqual({ games: 2, wins: 1, losses: 1 });
    expect(s.opponent).toEqual({ games: 1, wins: 1, losses: 0 });
  });

  it("counts a game once however many records it has, and a game with records on both sides once in each relation", () => {
    const s = one(
      [
        row({ matchId: "G1", key: "x", relation: "ally", win: true }),
        row({ matchId: "G1", key: "x", relation: "ally", win: true }),
        row({ matchId: "G2", key: "x", relation: "ally", win: false }),
        row({ matchId: "G2", key: "x", relation: "opponent", win: false }),
      ],
      "x",
    );
    expect(s.games).toBe(2);
    expect(s.ally).toEqual({ games: 2, wins: 1, losses: 1 });
    expect(s.opponent).toEqual({ games: 1, wins: 0, losses: 1 });
  });

  it("identifies players by account: a rename keeps one player with the latest name; one name on two accounts stays two players", () => {
    const rows = [
      row({ matchId: "G1", key: "x", relation: "opponent", name: "Old Name#OCE", gameCreation: T }),
      row({ matchId: "G2", key: "x", relation: "opponent", name: "New Name#OCE", gameCreation: T + 10 }),
      row({ matchId: "G3", key: "y", relation: "opponent", name: "New Name#OCE", gameCreation: T + 5 }),
    ];
    const all = summariseEncounters(rows);
    expect(all).toHaveLength(2);
    expect(all.find((s) => s.key === "x")).toMatchObject({ name: "New Name#OCE", games: 2, lastMatchId: "G2" });
  });

  it("does not count unknown results as wins or losses", () => {
    const s = one([row({ matchId: "G1", key: "x", relation: "ally", win: null }), row({ matchId: "G2", key: "x", relation: "ally", win: true })], "x");
    expect(s.ally).toEqual({ games: 2, wins: 1, losses: 0 });
  });

  it("lists by relation with a minimum, and records sort best or worst", () => {
    const rows = [
      // x: ally 3 times (2W 1L); y: opponent 3 times (1W 2L); z: opponent once.
      ...["G1", "G2", "G3"].map((m, i) => row({ matchId: m, key: "x", relation: "ally", win: i < 2 })),
      row({ matchId: "G4", key: "y", relation: "opponent", win: false }),
      row({ matchId: "G5", key: "y", relation: "opponent", win: false }),
      row({ matchId: "G6", key: "y", relation: "opponent", win: true }),
      row({ matchId: "G7", key: "z", relation: "opponent" }),
    ];
    const all = summariseEncounters(rows);
    expect(listEncounters(all, { relation: "allies", min: 2, sort: "games" }).map((s) => s.key)).toEqual(["x"]);
    expect(listEncounters(all, { relation: "allies", min: 5, sort: "games" })).toEqual([]);
    expect(listEncounters(all, { relation: "opponents", min: 2, sort: "games" }).map((s) => s.key)).toEqual(["y"]);
    expect(listEncounters(all, { relation: "everyone", min: 2, sort: "games" }).map((s) => s.key)).toEqual(["y", "x"]);
    expect(recordFor(all.find((s) => s.key === "y")!, "opponents")).toEqual({ games: 3, wins: 1, losses: 2 });
    expect(recordFor(all.find((s) => s.key === "x")!, "everyone")).toEqual({ games: 3, wins: 2, losses: 1 });
    expect(listEncounters(all, { relation: "opponents", min: 1, sort: "worst" }).map((s) => s.key)).toEqual(["y", "z"]);
    expect(listEncounters(all, { relation: "opponents", min: 1, sort: "best" }).map((s) => s.key)).toEqual(["z", "y"]);
    expect(listEncounters(all, { relation: "opponents", min: 1, sort: "games", query: "Z#" }).map((s) => s.key)).toEqual(["z"]);
  });

  it("gives highlights only with enough games behind them", () => {
    const few = summariseEncounters([row({ matchId: "G1", key: "x", relation: "opponent" }), row({ matchId: "G2", key: "x", relation: "opponent" })]);
    expect(encounterInsights(few)).toEqual([]);
    const many = summariseEncounters(Array.from({ length: 6 }, (_, i) => row({ matchId: `G${i}`, key: "x", relation: "opponent", win: i < 2 })));
    expect(encounterInsights(many).map((i) => [i.kind, i.record.games])).toEqual([
      ["frequent-opponent", 6],
      ["toughest-opponent", 6],
    ]);
  });

  it("lists one player's games newest first, each game once (its first record decides the side)", () => {
    const rows = [row({ matchId: "G1", key: "x", relation: "ally", gameCreation: T }), row({ matchId: "G2", key: "x", relation: "opponent", gameCreation: T + 20 }), row({ matchId: "G2", key: "x", relation: "ally", gameCreation: T + 20 }), row({ matchId: "G3", key: "y", relation: "ally" })];
    expect(encounterGames(rows, "x").map((g) => [g.matchId, g.relation])).toEqual([
      ["G2", "opponent"],
      ["G1", "ally"],
    ]);
  });

  it("reads the list's choices from an address and writes them back, defaults left out", () => {
    expect(encounterListChoice({})).toEqual({ relation: "opponents", min: 2, sort: "games", q: "", limit: ENCOUNTER_PAGE });
    // Searching shows players met once too, unless a minimum is chosen.
    expect(encounterListChoice({ q: "  Kestrel " })).toMatchObject({ q: "Kestrel", min: 1 });
    expect(encounterListChoice({ q: "Kestrel", min: "3" })).toMatchObject({ min: 3 });
    // Unknown values fall back to the defaults; the list never grows past 500 players.
    expect(encounterListChoice({ rel: "friends", min: "4", sort: "random", limit: "-3" })).toEqual({ relation: "opponents", min: 2, sort: "games", q: "", limit: ENCOUNTER_PAGE });
    expect(encounterListChoice({ limit: "100000" }).limit).toBe(500);
    expect(encounterListChoice({ q: "x".repeat(80) }).q).toHaveLength(32);
    for (const sp of [{}, { rel: "allies", min: "5", sort: "worst", q: "Moon", limit: "50" }, { rel: "everyone", q: "Moon" }, { min: "1" }]) {
      const choice = encounterListChoice(sp);
      expect(encounterListChoice(encounterListParams(choice))).toEqual(choice);
    }
    expect(encounterListParams(encounterListChoice({}))).toEqual({});
  });
});
