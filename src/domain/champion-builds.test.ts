import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MIN_CHOICE_GAMES,
  MIN_SECTION_GAMES,
  championBuildsView,
  choosePart,
  coreFamily,
  hasPerformer,
  itemClasses,
  parseRunePage,
  previousPatch,
  roleBuilds,
  runeFamily,
  shownRole,
  skillFamily,
  skillMaxOrder,
  startingSet,
  wilsonInterval,
  type BuildCountRow,
  type BuildItemInfo,
  type IconResolver,
  type Tally,
} from "./champion-builds";
import { patchTip, patchWords, sourceWords } from "./champion-builds-words";

/*
  Champion Intel's builds and runes (docs/CHAMPION_INTEL.md, "Builds and runes"): the item rules on
  Data Dragon's own item.json (16.22.1, every Summoner's Rift item), the skill order with each
  ability's own ranks, the Wilson bound, the choice of the most common and the highest win rate
  (a small sample never wins; near-identical builds count as one; one build where they agree), the
  patch window and the honest empty state.
*/

const fixture = JSON.parse(readFileSync(join(__dirname, "..", "..", "tests", "fixtures", "ddragon-16.22.1-item-builds.json"), "utf8")) as { version: string; items: Record<string, BuildItemInfo & { name: string }> };

const icons: IconResolver = {
  item: (id) => ({ url: `item/${id}`, name: `Item ${id}` }),
  rune: (id) => ({ url: `rune/${id}`, name: `Rune ${id}` }),
  spell: (key) => ({ url: `spell/${key}`, name: `Spell ${key}` }),
  shard: (id, row) => ({ url: `shard/${id}`, name: `Shard ${row}` }),
};

const values = (entries: Array<[string, number, number]>): Map<string, Tally> => new Map(entries.map(([v, n, w]) => [v, { n, w, nm: 0 }]));

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

describe("the Wilson bound", () => {
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
  });
});

describe("the choice of each part", () => {
  const plain = (v: string) => v;

  it("is the most common reliable family; a tiny sample with a high win rate never wins", () => {
    // 9 of 9 wins: too few to be a choice at all; 12 of 30 is the most common.
    const part = choosePart(values([["A", 30, 12], ["B", 9, 9], ["C", 21, 11]]), plain, plain);
    expect(part.state).toBe("shown");
    if (part.state !== "shown") return;
    expect(part.standard.key).toBe("A");
    expect(part.standard.share).toBeCloseTo(30 / 60);
    expect(part.performer?.key).toBe("C"); // 11 of 21 (52%) against 40%: 21 games, 35% of them
  });

  it("shows the highest win rate only when it is another family, its bound is higher and it wins 2 points more", () => {
    // B wins slightly more but within 2 points: one build.
    const close = choosePart(values([["A", 50, 26], ["B", 40, 21]]), plain, plain);
    expect(close.state === "shown" && close.performer).toBeNull();
    // B is far better but its share is under 15%: not read.
    const rare = choosePart(values([["A", 150, 75], ["B", 22, 18]]), plain, plain);
    expect(rare.state === "shown" && rare.performer).toBeNull();
    // The most common also wins the most: one build.
    const same = choosePart(values([["A", 60, 40], ["B", 30, 15]]), plain, plain);
    expect(same.state === "shown" && same.performer).toBeNull();
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
});

/** Rows for one lane: `games` on each patch, then the parts' values. */
function lane(lane: BuildCountRow["lane"], patch: string, games: number, parts: Array<[BuildCountRow["dim"], string, number, number]> = []): BuildCountRow[] {
  return [{ dim: "games", patch, lane, value: "", n: games, w: Math.round(games / 2), nm: 2 }, { dim: "queue", patch, lane, value: "420", n: games, w: Math.round(games / 2), nm: 2 }, ...parts.map(([dim, value, n, w]) => ({ dim, patch, lane, value, n, w, nm: 0 }))];
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
    expect(view).toEqual({ status: "few", championName: "Ahri", currentPatch: "26.22", games: 13, role: "MID" });
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
    expect(b).toMatchObject({ role: "SUPPORT", games: 60, timelineGames: 50, teamGames: 2, queues: [420], widened: false });
    expect(b.runes.state === "shown" && b.runes.standard.games).toBe(36); // the two pages of one family
    expect(b.runes.state === "shown" && b.runes.standard.value.keystone?.name).toBe("Rune 8439");
    expect(b.runes.state === "shown" && b.runes.performer?.value.keystone?.name).toBe("Rune 8360"); // 16 of 24 against 16 of 36
    expect(b.shards.state === "shown" && b.shards.standard.value.map((s) => s.name)).toEqual(["Shard 0", "Shard 1", "Shard 2"]);
    expect(b.spells.state === "shown" && b.spells.standard.share).toBeCloseTo(52 / 60);
    expect(b.skills.state === "shown" && b.skills.standard.value).toEqual({ order: ["Q", "E", "W"], first: ["Q", "W", "E"] });
    expect(b.start.state === "shown" && b.start.standard.value.map((s) => [s.icon.name, s.count])).toEqual([["Item 2003", 1], ["Item 3865", 1]]);
    expect(b.boots.state === "shown" && b.boots.standard.value).toMatchObject({ name: "Item 3047" });
    expect(b.core.state === "shown" && b.core.standard.value.map((i) => i.name)).toEqual(["Item 3190", "Item 3107", "Item 3109"]);
    expect(hasPerformer(b)).toBe(true);
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
      lane("UTILITY", "16.22", 80, [
        ["core", "3190>3107>3109", 45, 15],
        ["core", "3190>3050>3109", 25, 17],
        ["fourth", "3107,3109,3190|3222", 30, 10],
        ["fourth", "3050,3109,3190|3107", 20, 14],
      ]),
      "UTILITY",
      ["16.22"],
      "16.22",
      icons,
    );
    expect(two.core.state === "shown" && two.core.performer?.key).toBe("3050,3109,3190");
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
