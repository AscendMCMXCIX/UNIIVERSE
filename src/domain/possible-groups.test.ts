import { describe, expect, it } from "vitest";
import { analysePossibleGroups, partySizesFor, type Appearance, type MatchPlayer } from "./possible-groups";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 17);
const match = (queueId: number | null = 440) => ({ matchId: "OC1_900", gameCreation: NOW, queueId });

/** Blue 0–4 (keys a–e), red 5–9 (keys f–j). */
const players: MatchPlayer[] = "abcdefghij".split("").map((key, slot) => ({ slot, key, teamId: slot < 5 ? 100 : 200, named: true }));

/** One earlier game: each key on the side given (100 or 200). */
function game(id: number, daysAgo: number, sides: Record<string, number>, queueId: number | null = 440): Appearance[] {
  return Object.entries(sides).map(([key, teamId]) => ({ matchId: `OC1_${id}`, gameCreation: NOW - daysAgo * DAY, queueId, key, teamId, win: teamId === 100 }));
}

const blue = (a: ReturnType<typeof analysePossibleGroups>) => a.teams.find((t) => t.teamId === 100)!;
const red = (a: ReturnType<typeof analysePossibleGroups>) => a.teams.find((t) => t.teamId === 200)!;

describe("possible groups in a completed match", () => {
  it("needs three earlier games together; one or two shared games are not enough", () => {
    const two = [...game(1, 3, { a: 100, b: 100 }), ...game(2, 5, { a: 200, b: 200 })];
    expect(blue(analysePossibleGroups(match(), players, two)).groups).toEqual([]);
    const three = [...two, ...game(3, 9, { a: 100, b: 100, f: 200 })];
    const groups = blue(analysePossibleGroups(match(), players, three)).groups;
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ slots: [0, 1], label: "Possible duo", games: 3, opposed: 0 });
    // Newest first, with the side's result from each game.
    expect(groups[0]!.evidence.map((e) => [e.matchId, e.win])).toEqual([
      ["OC1_1", true],
      ["OC1_2", false],
      ["OC1_3", true],
    ]);
  });

  it("never counts the analysed match, later games or games outside the window", () => {
    const history = [...game(900, 0, { a: 100, b: 100 }), ...game(1, -2, { a: 100, b: 100 }), ...game(2, -5, { a: 100, b: 100 }), ...game(3, 200, { a: 100, b: 100 }), ...game(4, 4, { a: 100, b: 100 }), ...game(5, 6, { a: 100, b: 100 })];
    const a = analysePossibleGroups(match(), players, history);
    expect(blue(a).groups).toEqual([]);
    expect(a.gamesSearched).toBe(2);
  });

  it("verifies a trio from games with all three, not from separate pairs", () => {
    // a+b, b+c and a+c each three times together, but never all three in one game.
    const pairs = [1, 2, 3].flatMap((n) => [...game(10 + n, n, { a: 100, b: 100 }), ...game(20 + n, n, { b: 100, c: 100 }), ...game(30 + n, n, { a: 100, c: 100 })]);
    // No trio; and the three pairs are equally supported but share players, so none is shown.
    expect(blue(analysePossibleGroups(match(), players, pairs)).groups).toEqual([]);
    const trio = [...pairs, ...[4, 5, 6].flatMap((n) => game(40 + n, n, { a: 200, b: 200, c: 200 }))];
    const found = blue(analysePossibleGroups(match(), players, trio)).groups;
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ slots: [0, 1, 2], label: "Possible trio", games: 3 });
  });

  it("follows the queue's party sizes", () => {
    const four = [1, 2, 3, 4].flatMap((n) => game(n, n, { a: 100, b: 100, c: 100, d: 100 }));
    // Normal games allow any party size.
    expect(blue(analysePossibleGroups(match(400), players, four)).groups.map((g) => g.label)).toEqual(["Possible four-player group"]);
    // Flex has no party of four, and which three of the four queued together is unknown: no group.
    expect(blue(analysePossibleGroups(match(440), players, four)).groups).toEqual([]);
    // With a fifth player in two of the games the trio is clear, and the fourth player stays ungrouped.
    const trio = [...four, ...[5, 6, 7].flatMap((n) => game(n, n, { a: 100, b: 100, c: 100 }))];
    expect(blue(analysePossibleGroups(match(440), players, trio)).groups.map((g) => [g.slots, g.games])).toEqual([[[0, 1, 2], 7]]);
    // Solo/Duo allows duos only, and a player is in one duo at most: four players always together
    // fit two duos in several equal ways, so no duo is shown rather than an arbitrary one.
    expect(blue(analysePossibleGroups(match(420), players, four)).groups).toEqual([]);
    // With one pair clearly stronger, that pair is the duo (and the rest pair up if they qualify).
    const stronger = [...four, ...[5, 6].flatMap((n) => game(n, n, { a: 100, b: 100 }))];
    const solo = blue(analysePossibleGroups(match(420), players, stronger)).groups;
    expect(solo.map((g) => [g.slots, g.games])).toEqual([
      [[0, 1], 6],
      [[2, 3], 4],
    ]);
    const five = [1, 2, 3].flatMap((n) => game(n, n, { f: 200, g: 200, h: 200, i: 200, j: 200 }));
    expect(red(analysePossibleGroups(match(440), players, five)).groups[0]).toMatchObject({ label: "Possible five-player group", slots: [5, 6, 7, 8, 9] });
  });

  it("states Clash teams as a fact and leaves unknown queues unassessed", () => {
    expect(partySizesFor(700)).toBe("clash");
    const history = [1, 2, 3].flatMap((n) => game(n, n, { a: 100, b: 100 }));
    expect(blue(analysePossibleGroups(match(700), players, history))).toEqual({ teamId: 100, groups: [], note: "clash" });
    expect(blue(analysePossibleGroups(match(null), players, history))).toEqual({ teamId: 100, groups: [], note: "not-assessed" });
    expect(blue(analysePossibleGroups(match(0), players, history)).note).toBe("not-assessed");
  });

  it("does not group players who often meet as opponents", () => {
    // Four games as teammates, three as opponents: typical of two players who share a small ladder.
    const meet = [...[1, 2, 3, 4].flatMap((n) => game(n, n, { a: 100, b: 100 })), ...[5, 6, 7].flatMap((n) => game(n, n, { a: 100, b: 200 }))];
    expect(blue(analysePossibleGroups(match(420), players, meet)).groups).toEqual([]);
    // Six as teammates and two as opponents is still three times as often together.
    const often = [...[1, 2, 3, 4, 5, 6].flatMap((n) => game(n, n, { a: 100, b: 100 })), ...[7, 8].flatMap((n) => game(n, n, { a: 200, b: 100 }))];
    expect(blue(analysePossibleGroups(match(420), players, often)).groups[0]).toMatchObject({ games: 6, opposed: 2 });
  });

  it("leaves out players without a recorded Riot ID and only compares accounts, not names or champions", () => {
    const hidden = players.map((p) => (p.key === "b" ? { ...p, named: false } : p));
    const history = [1, 2, 3].flatMap((n) => game(n, n, { a: 100, b: 100 }));
    expect(blue(analysePossibleGroups(match(), hidden, history)).groups).toEqual([]);
    // A different account (another key) with the same history never stands in for b.
    expect(blue(analysePossibleGroups(match(), players, [1, 2, 3].flatMap((n) => game(n, n, { a: 100, x: 100 })))).groups).toEqual([]);
  });

  it("lists at most ten evidence games but counts all of them", () => {
    const many = Array.from({ length: 14 }, (_, n) => game(n + 1, n + 1, { f: 200, g: 200 })).flat();
    const g = red(analysePossibleGroups(match(), players, many)).groups[0]!;
    expect(g.games).toBe(14);
    expect(g.evidence).toHaveLength(10);
    expect(g.evidence[0]!.matchId).toBe("OC1_1");
  });
});
