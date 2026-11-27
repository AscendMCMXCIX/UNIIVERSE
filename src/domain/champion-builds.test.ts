import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BUILD_QUEUE_IDS,
  BUILD_QUEUE_KEYS,
  BUILDS_FORMAT,
  DEFAULT_BUILD_QUEUE,
  FIRM_WIN_RATE_GAMES,
  MIN_CHOICE_GAMES,
  MIN_CHOICE_SHARE,
  MIN_PERFORMER_GAMES,
  MIN_PERFORMER_SHARE,
  MIN_SECTION_GAMES,
  PERFORMER_MARGIN,
  PERFORMER_MAX_ONE_PLAYER,
  PERFORMER_Z,
  buildQueueKey,
  championBuildsView,
  championBuildsViews,
  choosePart,
  coreFamily,
  differenceInterval,
  effectiveGames,
  hasPerformer,
  itemClasses,
  laneWindow,
  otherQueueOffer,
  parseRunePage,
  previousPatch,
  roleBuilds,
  runeFamily,
  shownRole,
  skillFamily,
  skillMaxOrder,
  startingSet,
  tallyOf,
  validBuildValue,
  wilsonInterval,
  type BuildCountRow,
  type BuildItemInfo,
  type BuildQueueId,
  type IconResolver,
  type Tally,
} from "./champion-builds";
import { patchTip, patchWords, sourceWords } from "./champion-builds-words";

/*
  Champion Intel's builds and runes (docs/CHAMPION_INTEL.md, "Builds and runes"): the item rules on
  Data Dragon's own item.json (16.22.1, every Summoner's Rift item), the skill order with each
  ability's own ranks, the Wilson bound and Newcombe's difference interval, the choice of the most
  common and the highest win rate (D6: never from fewer than 30 games, only where the difference is
  99% clear and no one player carries it; near-identical builds count as one; one build where they
  agree), weighted counts, each queue on its own (D5, never pooled), the patch window and the
  honest empty state.
*/

const fixture = JSON.parse(readFileSync(join(__dirname, "..", "..", "tests", "fixtures", "ddragon-16.22.1-item-builds.json"), "utf8")) as { version: string; items: Record<string, BuildItemInfo & { name: string }> };

const icons: IconResolver = {
  item: (id) => ({ url: `item/${id}`, name: `Item ${id}` }),
  rune: (id) => ({ url: `rune/${id}`, name: `Rune ${id}` }),
  spell: (key) => ({ url: `spell/${key}`, name: `Spell ${key}` }),
  shard: (id, row) => ({ url: `shard/${id}`, name: `Shard ${row}` }),
};

/** A part's values as tallies: [value, games, wins, the most games one player has with it]. */
const values = (entries: Array<[string, number, number, number?]>): Map<string, Tally> => new Map(entries.map(([v, n, w, top]) => [v, tallyOf({ n, w, nm: 0, top: top ?? 0 })]));

describe("the item rules on Data Dragon 16.22.1's items", () => {
  const classes = itemClasses(fixture.items);
  const completed = new Set(classes.completed);
  const boots = new Set(classes.boots);
  const name = (id: string) => fixture.items[id]!.name;

  it("count an item that only turns into another as completed when bought", () => {
    for (const id of ["3004", "3003", "3119", "2526"]) expect(completed.has(id), name(id)).toBe(true); // Manamune, Archangel's Staff, Winter's Approach, Whispering Circlet
    for (const id of ["3042", "3040", "3121", "2530"]) expect(completed.has(id), name(id)).toBe(false); // what they turn into: never bought
  });

  it("count legendary items, never their components, starters, consumables, trinkets or the support item", () => {
    for (const id of ["3078", "3031", "3089", "6672", "3157", "3071", "3190", "3041"]) expect(completed.has(id), name(id)).toBe(true);
    for (const id of ["3070", "1036", "1038", "1058", "3133", "3044", "2421", "1054", "1055", "1056", "1082", "1101", "1102", "1103", "3865", "3869", "3877", "2003", "2031", "2055", "3340", "3363", "3364"]) expect(completed.has(id), name(id)).toBe(false);
  });

  it("sort boots of the second tier and later apart, Gunmetal Greaves (no Boots tag) among them; Boots itself is a component", () => {
    for (const id of ["3006", "3047", "3111", "3020", "3158", "3009", "3008", "3172", "3174"]) expect(boots.has(id), name(id)).toBe(true);
    expect(boots.has("1001")).toBe(false);
    for (const id of boots) expect(completed.has(id), name(id)).toBe(false);
  });

  it("know every Rift item, and nothing else", () => {
    expect(classes.known).toHaveLength(Object.keys(fixture.items).length);
    expect(classes.known).toContain("1001");
    expect(classes.known).not.toContain("3042999");
  });
});

describe("the starting set", () => {
  it("is what was bought in the first minute less what was sold in it, repeats kept, ascending", () => {
    expect(startingSet([[1000, 1055], [1400, 2003], [1800, 2003], [61_000, 1036]])).toEqual([1055, 2003, 2003]);
    expect(startingSet([[1000, 1055], [2000, 2003], [9000, 1056]], [[8000, 1055]])).toEqual([1056, 2003]);
    // A sale after the first minute is not the start's.
    expect(startingSet([[1000, 1055]], [[70_000, 1055]])).toEqual([1055]);
  });
});

describe("the skill order", () => {
  const usual = { 1: 5, 2: 5, 3: 5, 4: 3 } as const;
  // Q, W, E, then Q at every chance, R at 6, 11 and 16 (a game to level 13).
  const qew = [1, 2, 3, 1, 1, 4, 1, 3, 1, 3, 4, 3, 3];

  it("names the skills in the order they reached their last rank, then the rest by points, with the first three points", () => {
    expect(skillMaxOrder(qew, usual)).toEqual({ order: ["Q", "E", "W"], first: ["Q", "W", "E"] });
  });

  it("reads each ability's own last rank: six ranks are not maxed at five", () => {
    const six = { 1: 6, 2: 6, 3: 6, 4: 3 } as const; // Aphelios-like
    // Q at 5 points is not maxed with 6 ranks; W reaches 6 first.
    const skills = [1, 2, 2, 1, 2, 4, 2, 1, 2, 1, 4, 2, 1, 3];
    expect(skillMaxOrder(skills, six)?.order).toEqual(["W", "Q", "E"]);
    expect(skillMaxOrder(skills, usual)?.order).toEqual(["W", "Q", "E"]);
    expect(skillMaxOrder([1, 2, 1, 3, 1, 4, 1, 2, 1, 2, 4], six)).toBeNull(); // Q at 5 of 6: nothing maxed yet
  });

  it("counts R with the others only where it is levelled like them (Udyr), never an ultimate", () => {
    const udyr = { 1: 6, 2: 6, 3: 6, 4: 6 } as const;
    const skills = [4, 1, 4, 2, 4, 3, 4, 4, 4, 1, 1, 1, 1, 1, 2];
    expect(skillMaxOrder(skills, udyr)?.order).toEqual(["R", "Q", "W", "E"]);
    expect(skillMaxOrder(qew, usual)?.order).not.toContain("R");
  });

  it("says nothing when no skill was maxed, when two unmaxed skills are level, or with fewer than three points", () => {
    expect(skillMaxOrder([1, 2, 3, 1, 1, 4, 1], usual)).toBeNull();
    expect(skillMaxOrder([1, 2, 3, 1, 1, 4, 1, 1, 2, 3], usual)).toBeNull(); // Q maxed, W and E at 2 each
    expect(skillMaxOrder([1, 2], usual)).toBeNull();
  });
});

describe("the Wilson bound and the difference interval", () => {
  it("gives the published values and a sample's width", () => {
    const low = (w: number, n: number) => Math.round(wilsonInterval(w, n)!.low * 1000) / 1000;
    expect(low(14, 20)).toBe(0.481);
    expect(low(33, 60)).toBe(0.425);
    expect(low(9, 10)).toBe(0.596);
    expect(low(55, 100)).toBe(0.452);
    expect(wilsonInterval(0, 0)).toBeNull();
    const all = wilsonInterval(10, 10)!;
    expect(all.high).toBeCloseTo(1, 12);
    expect(all.low).toBeGreaterThan(0.6);
    expect(wilsonInterval(0, 10)!.low).toBe(0);
    // How wide a win rate is at 50%: 30 games is still about ±17 points.
    const at = (n: number) => wilsonInterval(n / 2, n)!;
    expect(Math.round(at(30).low * 100)).toBe(33);
    expect(Math.round(at(30).high * 100)).toBe(67);
  });

  it("gives Newcombe's (1998) published intervals of a difference of two rates (method 10)", () => {
    const r = (a: [number, number], b: [number, number]) => {
      const d = differenceInterval({ wins: a[0], games: a[1] }, { wins: b[0], games: b[1] })!;
      return [Math.round(d.low * 10_000) / 10_000, Math.round(d.high * 10_000) / 10_000];
    };
    expect(r([56, 70], [48, 80])).toEqual([0.0524, 0.3339]);
    expect(r([9, 10], [3, 10])).toEqual([0.1705, 0.809]);
    expect(r([6, 7], [2, 7])).toEqual([0.0582, 0.8062]);
    expect(r([5, 56], [0, 29])).toEqual([-0.0381, 0.1926]);
    expect(differenceInterval({ wins: 0, games: 0 }, { wins: 3, games: 10 })).toBeNull();
    expect(PERFORMER_Z).toBeCloseTo(2.5758, 4);
  });
});

/** Today's rule before D6 (two Wilson lower bounds compared, 20 games), to show what D6 stops. */
function oldRule(values: Array<[string, number, number]>): string | null {
  const total = values.reduce((s, [, n]) => s + n, 0);
  const all = values.map(([key, n, w]) => ({ key, n, rate: w / n, low: wilsonInterval(w, n)!.low, share: n / total })).filter((c) => c.n >= 10 && c.share >= 0.1);
  const standard = [...all].sort((a, b) => b.n - a.n)[0]!;
  const best = all.filter((c) => c.n >= 20 && c.share >= 0.15).sort((a, b) => b.low - a.low)[0];
  return best && best.key !== standard.key && best.low > standard.low && best.rate - standard.rate >= 0.02 ? best.key : null;
}

describe("the choice of each part", () => {
  const plain = (v: string) => v;
  const performer = (entries: Array<[string, number, number, number?]>) => {
    const part = choosePart(values(entries), plain, plain);
    return part.state === "shown" ? (part.performer?.key ?? null) : part.state;
  };

  it("holds the rule's numbers (D6)", () => {
    expect(BUILDS_FORMAT).toBe(2);
    expect([MIN_CHOICE_GAMES, MIN_CHOICE_SHARE, MIN_PERFORMER_GAMES, MIN_PERFORMER_SHARE, PERFORMER_MARGIN, PERFORMER_MAX_ONE_PLAYER, FIRM_WIN_RATE_GAMES]).toEqual([10, 0.1, 30, 0.15, 0.02, 1 / 3, 30]);
  });

  it("is the most common reliable family; a tiny sample with a high win rate never wins", () => {
    // 9 of 9 wins: too few to be a choice at all; 12 of 30 is the most common.
    const part = choosePart(values([["A", 30, 12], ["B", 9, 9], ["C", 21, 11]]), plain, plain);
    expect(part.state).toBe("shown");
    if (part.state !== "shown") return;
    expect(part.standard.key).toBe("A");
    expect(part.standard.share).toBeCloseTo(30 / 60);
    // 11 of 21 (52%) against 40%: fewer than 30 games, so never "Highest win rate" (D6; the old rule showed it).
    expect(part.performer).toBeNull();
    expect(oldRule([["A", 30, 12], ["B", 9, 9], ["C", 21, 11]])).toBe("C");
    // Each choice carries its likely range.
    const range = wilsonInterval(12, 30)!;
    expect(part.standard.range.low).toBeCloseTo(range.low, 12);
    expect(part.standard.range.high).toBeCloseTo(range.high, 12);
    expect(part.standard.low).toBe(part.standard.range.low);
  });

  it("never shows 16 wins of 20 (80%) as the highest win rate against a most common of 26 games at 50% (the D6 case)", () => {
    expect(performer([["A", 26, 13], ["B", 20, 16]])).toBeNull();
    // The rule before D6 did.
    expect(oldRule([["A", 26, 13], ["B", 20, 16]])).toBe("B");
  });

  it("from 30 games, only where the 99% interval of the difference is wholly above 0", () => {
    // Against 50 of 100: 23 of 30 is just clear (its difference's interval starts above 0); 22 of 30 is not.
    expect(differenceInterval({ wins: 23, games: 30 }, { wins: 50, games: 100 }, PERFORMER_Z)!.low).toBeGreaterThan(0);
    expect(differenceInterval({ wins: 22, games: 30 }, { wins: 50, games: 100 }, PERFORMER_Z)!.low).toBeLessThan(0);
    expect(performer([["A", 100, 50], ["B", 30, 23]])).toBe("B");
    expect(performer([["A", 100, 50], ["B", 30, 22]])).toBeNull();
    // 30 games and 15% of the part, more than 2 points above, but the interval reaches 0: not shown.
    expect(performer([["A", 170, 85], ["B", 30, 16]])).toBeNull();
    // A share under 15%: not read.
    expect(performer([["A", 180, 90], ["B", 30, 25]])).toBeNull();
  });

  it("not where one player holds more than a third of its games (a main's skill is not a build's)", () => {
    expect(performer([["A", 100, 50], ["B", 30, 23, 10]])).toBe("B");
    expect(performer([["A", 100, 50], ["B", 30, 23, 11]])).toBeNull();
    // The guard is the family's: its values' and patches' most games by one player, added (an upper bound).
    const split = choosePart(values([["1>2>3", 100, 50], ["4>5>6", 15, 12, 6], ["5>6>4", 15, 11, 6]]), coreFamily, plain);
    expect(split.state === "shown" && split.performer).toBeNull();
    const spread = choosePart(values([["1>2>3", 100, 50], ["4>5>6", 15, 12, 5], ["5>6>4", 15, 11, 5]]), coreFamily, plain);
    expect(spread.state === "shown" && spread.performer?.key).toBe("4,5,6");
  });

  it("shows the highest win rate only when it is another family and wins 2 points more", () => {
    // B wins slightly more but within 2 points: one build.
    const close = choosePart(values([["A", 500, 260], ["B", 400, 210]]), plain, plain);
    expect(close.state === "shown" && close.performer).toBeNull();
    // The most common also wins the most: one build.
    expect(performer([["A", 600, 400], ["B", 300, 150]])).toBeNull();
    // The best other family by its lower bound is the one tested, never the next one down.
    expect(performer([["A", 200, 100], ["B", 60, 46], ["C", 60, 50]])).toBe("C");
  });

  it("reads weighted counts on their effective size: team rows (every weight 1) give the plain counts", () => {
    const team = values([["A", 100, 50], ["B", 30, 23]]);
    const a = team.get("A")!;
    expect(effectiveGames(a)).toBe(100);
    // 1,000 games observed with uneven weights are worth fewer as a sample.
    const weighted = tallyOf({ n: 1000, w: 600, nm: 0, top: 0, weight: { w: 1000, w2: 2000, ww: 600 } });
    expect(effectiveGames(weighted)).toBe(500);
    const heavy = new Map<string, Tally>([
      ["A", tallyOf({ n: 3000, w: 1500, nm: 0, top: 0, weight: { w: 3000, w2: 6000, ww: 1500 } })],
      ["B", tallyOf({ n: 1000, w: 600, nm: 0, top: 0, weight: { w: 1000, w2: 2000, ww: 600 } })],
    ]);
    const part = choosePart(heavy, plain, plain);
    expect(part.state).toBe("shown");
    if (part.state !== "shown") return;
    expect(part.standard.games).toBe(1500);
    expect(part.performer?.key).toBe("B");
    expect(part.performer?.games).toBe(500);
    expect(part.performer?.winRate).toBeCloseTo(0.6, 12);
    expect(part.performer?.share).toBeCloseTo(0.25, 12);
    expect(part.total).toBeCloseTo(2000, 6);
  });

  it("counts near-identical builds as one: the same core items in another order, the same keystone and secondary tree", () => {
    // Three orders of one set (8 + 6 + 6 = 20) outnumber a single order of another (15).
    const core = choosePart(values([["3078>3053>3071", 8, 4], ["3053>3078>3071", 6, 3], ["3071>3078>3053", 6, 3], ["6692>3071>6333", 15, 8]]), coreFamily, plain);
    expect(core.state === "shown" && core.standard.key).toBe("3053,3071,3078");
    expect(core.state === "shown" && core.standard.value).toBe("3078>3053>3071"); // shown in its most common order
    expect(core.state === "shown" && core.standard.games).toBe(20);
    expect(runeFamily("8000:8010,9111,9104,8299|8400:8444,8451")).toBe(runeFamily("8000:8010,9111,9105,8014|8400:8429,8451"));
    expect(runeFamily("8000:8010,9111,9104,8299|8400:8444,8451")).not.toBe(runeFamily("8000:8010,9111,9104,8299|8300:8304,8347"));
    expect(skillFamily("QEW|QWE")).toBe(skillFamily("QEW|QEW"));
    expect(parseRunePage("8000:8010,9111|8400:8444,8451")).toBeNull();
  });

  it("says when too few games record a part, or no choice is common enough", () => {
    expect(choosePart(values([["A", 12, 6]]), plain, plain)).toEqual({ state: "few", total: 12 });
    // 25 games, ten different choices: none in 10 games.
    const varied = choosePart(values(Array.from({ length: 10 }, (_, i) => [`V${i}`, i < 5 ? 3 : 2, 1] as [string, number, number])), plain, plain);
    expect(varied).toEqual({ state: "varied", total: 25 });
  });

  it("knows each value's form, so no identifier can stand in a counted value", () => {
    expect(validBuildValue("runes", "8000:8010,9111,9104,8299|8400:8444,8451")).toBe(true);
    expect(validBuildValue("core", "3078>3053>3071")).toBe(true);
    expect(validBuildValue("fourth", "3053,3071,3078|6333")).toBe(true);
    expect(validBuildValue("boots", "none")).toBe(true);
    expect(validBuildValue("games", "")).toBe(true);
    for (const [dim, v] of [["runes", "demo-filler-1"], ["spells", "OC1_123,4"], ["games", "x"], ["start", "1".repeat(60)], ["skills", "QEW|QWEX"]] as const) expect(validBuildValue(dim, v), `${dim} ${v}`).toBe(false);
  });
});

/** Rows for one lane in one queue (Ranked Solo/Duo unless said): `games` on each patch, then the parts' values. */
function lane(lane: BuildCountRow["lane"], patch: string, games: number, parts: Array<[BuildCountRow["dim"], string, number, number]> = [], queue: BuildQueueId = 420): BuildCountRow[] {
  return [{ dim: "games", patch, lane, queue, value: "", n: games, w: Math.round(games / 2), nm: 2, top: 0 }, ...parts.map(([dim, value, n, w]) => ({ dim, patch, lane, queue, value, n, w, nm: 0, top: 0 }))];
}

describe("the patch window and the roles", () => {
  const window = { current: "16.22", previous: "16.21" };

  it("uses the current patch alone when it has enough games, and adds the previous one only when it has not, saying so", () => {
    const current = championBuildsView("Ahri", lane("MIDDLE", "16.22", 24), window, icons);
    expect(current.status === "shown" && current.builds.MID?.patches).toEqual(["26.22"]);
    const widened = championBuildsView("Ahri", [...lane("MIDDLE", "16.22", 8), ...lane("MIDDLE", "16.21", 15)], window, icons);
    expect(widened.status).toBe("shown");
    if (widened.status !== "shown") return;
    expect(widened.builds.MID).toMatchObject({ patches: ["26.22", "26.21"], widened: true, games: 23, currentGames: 8 });
  });

  it("with no game yet on the current patch (its first days), counts the previous patch alone and says so, never as a range that holds the current one", () => {
    const view = championBuildsView("Ahri", lane("MIDDLE", "16.21", 25), window, icons);
    expect(view.status).toBe("shown");
    if (view.status !== "shown") return;
    const b = view.builds.MID!;
    expect(b).toMatchObject({ patches: ["26.22", "26.21"], widened: true, games: 25, currentGames: 0 });
    expect(patchWords(b)).toBe("patch 26.21, none yet on 26.22");
    expect(sourceWords(b)).toContain("· patch 26.21, none yet on 26.22 ·");
    expect(patchTip(b)).toBe("Patch 26.22 has no games yet, so only the 25 games on 26.21 are counted.");
  });

  it("never shows an older patch's games when the two together have too few: the honest empty state", () => {
    const view = championBuildsView("Ahri", [...lane("MIDDLE", "16.22", 4), ...lane("MIDDLE", "16.21", 9), ...lane("MIDDLE", "16.20", 80)], window, icons);
    expect(view).toEqual({ status: "few", source: "team", queue: "solo", championName: "Ahri", currentPatch: "26.22", games: 13, role: "MID" });
    expect(championBuildsView("Ahri", [], window, icons)).toMatchObject({ status: "few", games: 0, role: null });
    // No previous patch known (a new season): the current one alone.
    expect(championBuildsView("Ahri", lane("MIDDLE", "16.21", 40), { current: "16.22", previous: null }, icons).status).toBe("few");
  });

  it("offers each role with enough games, the most played on the current patch first; the address may ask for another", () => {
    const view = championBuildsView("Pyke", [...lane("UTILITY", "16.22", 30), ...lane("MIDDLE", "16.22", 21), ...lane("TOP", "16.22", 5)], window, icons);
    expect(view.status).toBe("shown");
    if (view.status !== "shown") return;
    expect(view.roles.map((r) => r.role)).toEqual(["SUPPORT", "MID"]);
    expect(shownRole(view, "MID")).toBe("MID");
    expect(shownRole(view, "TOP")).toBe("SUPPORT"); // too few games as Top: the default
    expect(shownRole(view, null)).toBe("SUPPORT");
  });

  it("finds the previous patch among the known ones, never across a season", () => {
    expect(previousPatch("16.22", ["16.22", "16.21", "16.20"])).toBe("16.21");
    expect(previousPatch("16.22", ["16.22", "16.19"])).toBe("16.19");
    expect(previousPatch("16.22", [])).toBe("16.21");
    expect(previousPatch("17.1", ["17.1", "16.24"])).toBeNull();
    expect(previousPatch("17.1", [])).toBeNull();
  });

  it("at the 2027 season's first patch, never falls back on 2026's last: too few games on 17.1 show the honest line, not 16.24's builds", () => {
    const window = { current: "17.1", previous: previousPatch("17.1", ["17.1", "16.24", "16.23"]) };
    expect(window.previous).toBeNull();
    const view = championBuildsView("Pyke", [...lane("UTILITY", "16.24", 40), ...lane("UTILITY", "17.1", 6)], window, icons);
    expect(view.status).toBe("few");
    // With enough games on 17.1 the builds are 17.1's alone.
    const enough = championBuildsView("Pyke", [...lane("UTILITY", "16.24", 40), ...lane("UTILITY", "17.1", 25)], window, icons);
    expect(enough.status).toBe("shown");
    if (enough.status === "shown") expect([enough.currentPatch, enough.builds[enough.defaultRole]!.patches]).toEqual(["27.1", ["27.1"]]);
  });
});

describe("the queues (D5): each its own counts, never pooled", () => {
  const window = { current: "16.22", previous: "16.21" };

  it("names the four queues, Ranked Solo/Duo first and by default", () => {
    expect(BUILD_QUEUE_KEYS).toEqual(["solo", "flex", "draft", "clash"]);
    expect(DEFAULT_BUILD_QUEUE).toBe("solo");
    expect(BUILD_QUEUE_IDS).toEqual({ solo: 420, flex: 440, draft: 400, clash: 700 });
    expect(buildQueueKey(440)).toBe("flex");
    expect(buildQueueKey(450)).toBeNull();
  });

  it("reads each queue's rows only: 15 Solo/Duo and 15 Flex games are two short samples, never one of 30", () => {
    const rows = [...lane("MIDDLE", "16.22", 15, [], 420), ...lane("MIDDLE", "16.22", 15, [], 440), ...lane("MIDDLE", "16.22", 30, [["spells", "4,14", 30, 15]], 700)];
    const views = championBuildsViews("Ahri", rows, window, icons);
    expect(views.queues.solo).toMatchObject({ status: "few", queue: "solo", games: 15, role: "MID" });
    expect(views.queues.flex).toMatchObject({ status: "few", queue: "flex", games: 15 });
    expect(views.queues.draft).toMatchObject({ status: "few", queue: "draft", games: 0, role: null });
    expect(views.queues.clash.status).toBe("shown");
    if (views.queues.clash.status !== "shown") return;
    expect(views.queues.clash.builds.MID).toMatchObject({ queue: "clash", games: 30 });
    expect(views.queues.clash.builds.MID!.spells.state === "shown" && views.queues.clash.builds.MID!.spells.standard.games).toBe(30);
    expect(views.master).toBeNull();
    // A queue's patch window is its own: Solo/Duo widened while Flex is current-only.
    const mixed = championBuildsViews("Ahri", [...lane("MIDDLE", "16.22", 8, [], 420), ...lane("MIDDLE", "16.21", 14, [], 420), ...lane("MIDDLE", "16.22", 22, [], 440)], window, icons);
    expect(mixed.queues.solo.status === "shown" && mixed.queues.solo.builds.MID?.patches).toEqual(["26.22", "26.21"]);
    expect(mixed.queues.flex.status === "shown" && mixed.queues.flex.builds.MID?.patches).toEqual(["26.22"]);
  });

  it("offers another queue that has builds where the chosen one has too few, in the role asked where it can, never on its own", () => {
    const rows = [...lane("UTILITY", "16.22", 12, [], 420), ...lane("UTILITY", "16.22", 34, [], 440), ...lane("BOTTOM", "16.22", 40, [], 400), ...lane("UTILITY", "16.22", 21, [], 400)];
    const views = championBuildsViews("Leona", rows, window, icons);
    expect(views.queues.solo.status).toBe("few");
    // As Support: Flex has 34, Draft 21 (its most played role is Bottom, 40).
    expect(otherQueueOffer(views.queues, "solo", "SUPPORT")).toEqual({ queue: "flex", role: "SUPPORT", games: 34 });
    // No role asked: each queue's most played role.
    expect(otherQueueOffer(views.queues, "solo", null)).toEqual({ queue: "draft", role: "ADC", games: 40 });
    // A role no other queue has builds in: each one's most played.
    expect(otherQueueOffer(views.queues, "solo", "TOP")).toEqual({ queue: "draft", role: "ADC", games: 40 });
    // Nothing anywhere else: no offer.
    const none = championBuildsViews("Leona", lane("UTILITY", "16.22", 12, [], 420), window, icons);
    expect(otherQueueOffer(none.queues, "solo", "SUPPORT")).toBeNull();
  });

  it("keeps the window rule in one place (the builds audit re-checks it)", () => {
    expect(laneWindow(20, 0, window)).toEqual(["16.22"]);
    expect(laneWindow(8, 12, window)).toEqual(["16.22", "16.21"]);
    expect(laneWindow(8, 11, window)).toBeNull();
    expect(laneWindow(8, 30, { current: "17.1", previous: null })).toBeNull();
  });

  it("builds a weighted (Master+) view through the same rules, on effective games", () => {
    const weighted = (dim: BuildCountRow["dim"], value: string, n: number, wins: number): BuildCountRow => ({ dim, patch: "16.22", lane: "MIDDLE", queue: 420, value, n, w: wins, nm: 0, top: 0, weight: { w: n, w2: n * 2, ww: wins } });
    const rows = [weighted("games", "", 80, 40), weighted("spells", "4,14", 80, 40)];
    const view = championBuildsView("Ahri", rows, window, icons, "solo", "master");
    expect(view).toMatchObject({ status: "shown", source: "master", queue: "solo" });
    if (view.status !== "shown") return;
    expect(view.builds.MID).toMatchObject({ games: 40, observed: 80 });
    // Under 20 effective games: few, whatever was observed.
    expect(championBuildsView("Ahri", [weighted("games", "", 38, 19)], window, icons, "solo", "master")).toMatchObject({ status: "few", games: 19 });
  });
});

describe("a role's builds", () => {
  const rows = lane("UTILITY", "16.22", 60, [
    ["timeline", "", 50, 25],
    ["runes", "8400:8439,8463,8473,8242|8300:8304,8347", 30, 13],
    ["runes", "8400:8439,8463,8444,8242|8300:8304,8347", 6, 3],
    ["runes", "8300:8360,8306,8345,8347|8400:8444,8451", 24, 16],
    ["shards", "5007,5008,5001", 22, 11],
    ["spells", "4,14", 52, 26],
    ["spells", "3,4", 8, 4],
    ["skills", "QEW|QWE", 30, 15],
    ["skills", "QEW|QEW", 5, 3],
    ["skills", "WQE|WQE", 10, 6],
    ["start", "2003,3865", 48, 24],
    ["boots", "3047", 25, 12],
    ["boots", "none", 2, 1],
    ["core", "3190>3107>3109", 18, 9],
    ["core", "3107>3190>3109", 4, 2],
    ["fourth", "3107,3109,3190|3050", 12, 6],
    ["fourth", "3107,3109,3190|3222", 4, 2],
    ["fifth", "3107,3109,3190|3222", 9, 4],
  ]);
  const b = roleBuilds(rows, "UTILITY", ["16.22"], "16.22", icons);

  it("states each part's own sample and its choice", () => {
    expect(b).toMatchObject({ role: "SUPPORT", queue: "solo", games: 60, observed: 60, timelineGames: 50, teamGames: 2, widened: false });
    expect(b.runes.state === "shown" && b.runes.standard.games).toBe(36); // the two pages of one family
    expect(b.runes.state === "shown" && b.runes.standard.value.keystone?.name).toBe("Rune 8439");
    // 16 of 24 against 16 of 36: from fewer than 30 games, so not the highest win rate (D6).
    expect(b.runes.state === "shown" && b.runes.performer).toBeNull();
    expect(b.shards.state === "shown" && b.shards.standard.value.map((s) => s.name)).toEqual(["Shard 0", "Shard 1", "Shard 2"]);
    expect(b.spells.state === "shown" && b.spells.standard.share).toBeCloseTo(52 / 60);
    expect(b.skills.state === "shown" && b.skills.standard.value).toEqual({ order: ["Q", "E", "W"], first: ["Q", "W", "E"] });
    expect(b.start.state === "shown" && b.start.standard.value.map((s) => [s.icon.name, s.count])).toEqual([["Item 2003", 1], ["Item 3865", 1]]);
    expect(b.boots.state === "shown" && b.boots.standard.value).toMatchObject({ name: "Item 3047" });
    expect(b.core.state === "shown" && b.core.standard.value.map((i) => i.name)).toEqual(["Item 3190", "Item 3107", "Item 3109"]);
    expect(hasPerformer(b)).toBe(false);
  });

  it("builds the full build from the most common core with the fourth and fifth items most often bought after it, each common enough", () => {
    expect(b.full?.items.map((i) => i.name)).toEqual(["Item 3190", "Item 3107", "Item 3109", "Item 3050"]);
    expect(b.full?.fourth).toEqual({ games: 12, total: 16 });
    // The fifth: 9 games, under MIN_CHOICE_GAMES, so the full build stops at four.
    expect(9).toBeLessThan(MIN_CHOICE_GAMES);
    expect(b.full?.fifth).toBeNull();
    // No core with a higher win rate here: no full build after one.
    expect(b.fullHighest).toBeNull();
  });

  it("builds a full build after the core with the highest win rate too, where there is one", () => {
    const two = roleBuilds(
      lane("UTILITY", "16.22", 120, [
        ["core", "3190>3107>3109", 60, 20],
        ["core", "3190>3050>3109", 40, 30],
        ["fourth", "3107,3109,3190|3222", 30, 10],
        ["fourth", "3050,3109,3190|3107", 20, 14],
      ]),
      "UTILITY",
      ["16.22"],
      "16.22",
      icons,
    );
    expect(two.core.state === "shown" && two.core.performer?.key).toBe("3050,3109,3190");
    expect(hasPerformer(two)).toBe(true);
    expect(two.full?.items.map((i) => i.name)).toEqual(["Item 3190", "Item 3107", "Item 3109", "Item 3222"]);
    expect(two.fullHighest?.items.map((i) => i.name)).toEqual(["Item 3190", "Item 3050", "Item 3109", "Item 3107"]);
  });

  it("shows the boots part as 'none' only for games that completed three items without boots", () => {
    const none = roleBuilds(lane("MIDDLE", "16.22", 30, [["boots", "none", 25, 14]]), "MIDDLE", ["16.22"], "16.22", icons);
    expect(none.boots.state === "shown" && none.boots.standard.value).toBe("none");
  });

  it("needs MIN_SECTION_GAMES games for the section", () => {
    expect(MIN_SECTION_GAMES).toBe(20);
    expect(championBuildsView("Leona", lane("UTILITY", "16.22", 19), { current: "16.22", previous: null }, icons).status).toBe("few");
    expect(championBuildsView("Leona", lane("UTILITY", "16.22", 20), { current: "16.22", previous: null }, icons).status).toBe("shown");
  });
});
