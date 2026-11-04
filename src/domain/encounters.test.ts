import { describe, expect, it } from "vitest";
import { ENCOUNTER_PAGE, encounterFocusParams, encounterGames, encounterInsights, encounterListChoice, encounterListParams, listEncounters, readEncounterFocus, recordFor, summariseEncounters, type EncounterRow } from "./encounters";

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
    expect(s.ally).toMatchObject({ games: 2, wins: 1, losses: 1 });
    expect(s.opponent).toMatchObject({ games: 1, wins: 1, losses: 0 });
  });

  it("keeps each relation's latest game: against and alongside are two records", () => {
    const s = one([row({ matchId: "G1", key: "x", relation: "ally", gameCreation: T }), row({ matchId: "G2", key: "x", relation: "opponent", gameCreation: T + 50 }), row({ matchId: "G3", key: "x", relation: "ally", gameCreation: T + 20 })], "x");
    expect(s.ally).toEqual({ games: 2, wins: 2, losses: 0, lastPlayedAt: T + 20 });
    expect(s.opponent).toEqual({ games: 1, wins: 1, losses: 0, lastPlayedAt: T + 50 });
    expect(s.lastPlayedAt).toBe(T + 50);
    // Never met one way: no date for that side.
    expect(one([row({ matchId: "G9", key: "y", relation: "opponent" })], "y").ally).toEqual({ games: 0, wins: 0, losses: 0, lastPlayedAt: null });
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
    expect(s.ally).toMatchObject({ games: 2, wins: 1, losses: 1 });
    expect(s.opponent).toMatchObject({ games: 1, wins: 0, losses: 1 });
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
    expect(s.ally).toMatchObject({ games: 2, wins: 1, losses: 0 });
  });

  it("lists by relation with a minimum, and sorts by games, the latest game or the win rate", () => {
    const rows = [
      // x: ally 3 times (2W 1L); y: opponent 3 times (1W 2L); z: opponent once.
      ...["G1", "G2", "G3"].map((m, i) => row({ matchId: m, key: "x", relation: "ally", win: i < 2 })),
      row({ matchId: "G4", key: "y", relation: "opponent", win: false }),
      row({ matchId: "G5", key: "y", relation: "opponent", win: false }),
      row({ matchId: "G6", key: "y", relation: "opponent", win: true }),
      row({ matchId: "G7", key: "z", relation: "opponent" }),
    ];
    const all = summariseEncounters(rows);
    expect(listEncounters(all, { relation: "alongside", min: 2, sort: "games" }).map((s) => s.key)).toEqual(["x"]);
    expect(listEncounters(all, { relation: "alongside", min: 5, sort: "games" })).toEqual([]);
    expect(listEncounters(all, { relation: "against", min: 2, sort: "games" }).map((s) => s.key)).toEqual(["y"]);
    expect(listEncounters(all, { relation: "all", min: 2, sort: "games" }).map((s) => s.key)).toEqual(["y", "x"]);
    expect(recordFor(all.find((s) => s.key === "y")!, "against")).toMatchObject({ games: 3, wins: 1, losses: 2 });
    expect(recordFor(all.find((s) => s.key === "x")!, "all")).toMatchObject({ games: 3, wins: 2, losses: 1 });
    expect(listEncounters(all, { relation: "against", min: 1, sort: "worst" }).map((s) => s.key)).toEqual(["y", "z"]);
    expect(listEncounters(all, { relation: "against", min: 1, sort: "best" }).map((s) => s.key)).toEqual(["z", "y"]);
    expect(listEncounters(all, { relation: "against", min: 1, sort: "games", query: "Z#" }).map((s) => s.key)).toEqual(["z"]);
    // The most recent game in the relation first: z (G7) after y's last game (G6).
    expect(listEncounters(all, { relation: "against", min: 1, sort: "recent" }).map((s) => s.key)).toEqual(["z", "y"]);
    // All ranks no win rates (two different records): a win-rate order reads as most games.
    expect(listEncounters(all, { relation: "all", min: 1, sort: "best" })).toEqual(listEncounters(all, { relation: "all", min: 1, sort: "games" }));
  });

  it("lists a player met both ways under Against and under Alongside, each with its own record", () => {
    const rows = [...["A1", "A2"].map((m) => row({ matchId: m, key: "w", relation: "opponent", win: false })), ...["B1", "B2", "B3"].map((m) => row({ matchId: m, key: "w", relation: "ally", win: true }))];
    const all = summariseEncounters(rows);
    expect(listEncounters(all, { relation: "against", min: 2, sort: "games" }).map((s) => recordFor(s, "against"))).toMatchObject([{ games: 2, wins: 0, losses: 2 }]);
    expect(listEncounters(all, { relation: "alongside", min: 2, sort: "games" }).map((s) => recordFor(s, "alongside"))).toMatchObject([{ games: 3, wins: 3, losses: 0 }]);
    expect(listEncounters(all, { relation: "all", min: 2, sort: "games" })).toHaveLength(1);
  });

  it("ranks win rates from enough games ahead of small samples", () => {
    // p: 1 win from 1 game (100%, a small sample); q: 4 wins from 5 games (80%); r: 1 win from 5 (20%).
    const rows = [
      row({ matchId: "P1", key: "p", relation: "opponent", win: true }),
      ...Array.from({ length: 5 }, (_, i) => row({ matchId: `Q${i}`, key: "q", relation: "opponent", win: i < 4 })),
      ...Array.from({ length: 5 }, (_, i) => row({ matchId: `R${i}`, key: "r", relation: "opponent", win: i < 1 })),
    ];
    const all = summariseEncounters(rows);
    expect(listEncounters(all, { relation: "against", min: 1, sort: "best" }).map((s) => s.key)).toEqual(["q", "r", "p"]);
    expect(listEncounters(all, { relation: "against", min: 1, sort: "worst" }).map((s) => s.key)).toEqual(["r", "q", "p"]);
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

  it("highlights the toughest record against from 5 decided games, ties going to more games against: the first of the worst-record list", () => {
    const rows = [
      // a: lost all 5 games against, and was an ally in 10 more (15 games together in all).
      ...Array.from({ length: 5 }, (_, i) => row({ matchId: `A${i}`, key: "a", relation: "opponent", win: false })),
      ...Array.from({ length: 10 }, (_, i) => row({ matchId: `AA${i}`, key: "a", relation: "ally", win: true })),
      // b: lost all 8 games against: the same record over more games against.
      ...Array.from({ length: 8 }, (_, i) => row({ matchId: `B${i}`, key: "b", relation: "opponent", win: false })),
      // c: lost 4 of 4 decided games against, plus one without a recorded result: not 5 decided games.
      ...Array.from({ length: 4 }, (_, i) => row({ matchId: `C${i}`, key: "c", relation: "opponent", win: false })),
      row({ matchId: "C9", key: "c", relation: "opponent", win: null }),
    ];
    const all = summariseEncounters(rows);
    const toughest = encounterInsights(all).find((i) => i.kind === "toughest-opponent")!;
    expect(toughest.summary.key).toBe("b");
    expect(toughest.record).toMatchObject({ games: 8, wins: 0, losses: 8 });
    expect(listEncounters(all, { relation: "against", min: 5, sort: "worst" })[0]!.key).toBe("b");
    // The most faced opponent is b too (8 games against, not a's 15 together); the most frequent ally is a.
    expect(encounterInsights(all).find((i) => i.kind === "frequent-opponent")!.summary.key).toBe("b");
    expect(encounterInsights(all).find((i) => i.kind === "frequent-ally")!.summary.key).toBe("a");
  });

  it("calls a record toughest only when it is a losing one, and best only when it is a winning one", () => {
    // d: beaten 8–4 as an opponent (the lowest win rate against anyone, but a winning record); e: 2–4 as an ally.
    const rows = [
      ...Array.from({ length: 12 }, (_, i) => row({ matchId: `D${i}`, key: "d", relation: "opponent", win: i < 8 })),
      ...Array.from({ length: 6 }, (_, i) => row({ matchId: `E${i}`, key: "e", relation: "ally", win: i < 2 })),
    ];
    const kinds = encounterInsights(summariseEncounters(rows)).map((i) => [i.kind, i.summary.key]);
    expect(kinds).toEqual([
      ["frequent-opponent", "d"],
      ["frequent-ally", "e"],
    ]);
    // An even record is neither: 3–3 against is not a toughest record.
    const even = Array.from({ length: 6 }, (_, i) => row({ matchId: `F${i}`, key: "f", relation: "opponent", win: i < 3 }));
    expect(encounterInsights(summariseEncounters(even)).map((i) => i.kind)).toEqual(["frequent-opponent"]);
  });

  it("lists one player's games newest first, each game once (its first record decides the side)", () => {
    const rows = [row({ matchId: "G1", key: "x", relation: "ally", gameCreation: T }), row({ matchId: "G2", key: "x", relation: "opponent", gameCreation: T + 20 }), row({ matchId: "G2", key: "x", relation: "ally", gameCreation: T + 20 }), row({ matchId: "G3", key: "y", relation: "ally" })];
    expect(encounterGames(rows, "x").map((g) => [g.matchId, g.relation])).toEqual([
      ["G2", "opponent"],
      ["G1", "ally"],
    ]);
  });

  it("reads the list's choices from an address and writes them back, defaults left out", () => {
    // Every player met by default, both records side by side.
    expect(encounterListChoice({})).toEqual({ relation: "all", min: 2, sort: "games", q: "", limit: ENCOUNTER_PAGE });
    // The earlier names still open the same lists; All has no win-rate order.
    expect(encounterListChoice({ rel: "opponents" }).relation).toBe("against");
    expect(encounterListChoice({ rel: "allies", sort: "best" })).toMatchObject({ relation: "alongside", sort: "best" });
    expect(encounterListChoice({ rel: "everyone", sort: "worst" })).toMatchObject({ relation: "all", sort: "games" });
    expect(encounterListChoice({ rel: "all", sort: "recent" }).sort).toBe("recent");
    // Searching shows players met once too, unless a minimum is chosen.
    expect(encounterListChoice({ q: "  Kestrel " })).toMatchObject({ q: "Kestrel", min: 1 });
    expect(encounterListChoice({ q: "Kestrel", min: "3" })).toMatchObject({ min: 3 });
    // Unknown values fall back to the defaults; the list never grows past 500 players.
    expect(encounterListChoice({ rel: "friends", min: "4", sort: "random", limit: "-3" })).toEqual({ relation: "all", min: 2, sort: "games", q: "", limit: ENCOUNTER_PAGE });
    expect(encounterListChoice({ limit: "100000" }).limit).toBe(500);
    expect(encounterListChoice({ q: "x".repeat(80) }).q).toHaveLength(32);
    for (const sp of [{}, { rel: "alongside", min: "5", sort: "worst", q: "Moon", limit: "50" }, { rel: "against" }, { rel: "all", q: "Moon", sort: "recent" }, { min: "1" }, { rel: "allies" }]) {
      const choice = encounterListChoice(sp);
      expect(encounterListChoice(encounterListParams(choice))).toEqual(choice);
    }
    expect(encounterListParams(encounterListChoice({}))).toEqual({});
    expect(encounterListParams(encounterListChoice({ rel: "against" }))).toEqual({ rel: "against" });
  });

  it("reads the player a Match History address opens (their key, and a side) and writes it back", () => {
    expect(readEncounterFocus({})).toBeNull();
    // Only an opaque key: never an account or anything longer.
    expect(readEncounterFocus({ met: "short" })).toBeNull();
    expect(readEncounterFocus({ met: "abc$efghijklmnop" })).toBeNull();
    expect(readEncounterFocus({ met: "AbC-def_ghijklmn" })).toEqual({ key: "AbC-def_ghijklmn", side: "all" });
    expect(readEncounterFocus({ met: "AbC-def_ghijklmn", side: "against" })).toEqual({ key: "AbC-def_ghijklmn", side: "against" });
    expect(readEncounterFocus({ met: "AbC-def_ghijklmn", side: "friends" })!.side).toBe("all");
    for (const side of ["all", "against", "alongside"] as const) {
      const focus = { key: "AbC-def_ghijklmn", side };
      expect(readEncounterFocus(encounterFocusParams(focus))).toEqual(focus);
    }
    expect(encounterFocusParams({ key: "AbC-def_ghijklmn", side: "all" })).toEqual({ met: "AbC-def_ghijklmn" });
  });
});
