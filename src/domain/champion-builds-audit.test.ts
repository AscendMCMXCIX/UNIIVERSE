import { describe, expect, it } from "vitest";
import { championBuildsViews, type BuildCountRow, type BuildQueueId, type ChampionBuildsViews, type IconResolver } from "./champion-builds";
import { auditChampion, auditTotals, auditedChampions, buildCandidates, probeChampions, rederivePart, type CandidateCount } from "./champion-builds-audit";

/*
  The builds audit's rules (server/jobs/builds-audit; docs/LIVE_VALIDATION.md, "The builds audit"):
  the candidates and the champions audited, the probe's champions, and R1–R10 re-derived from raw
  counts, on hand-made counts: a clean champion passes; each kind of mistake is named by its label
  only, never a champion's name.
*/

const icons: IconResolver = {
  item: (id) => ({ url: `item/${id}`, name: `Item ${id}` }),
  rune: (id) => ({ url: `rune/${id}`, name: `Rune ${id}` }),
  spell: (key) => ({ url: `spell/${key}`, name: `Spell ${key}` }),
  shard: (id, row) => ({ url: `shard/${id}`, name: `Shard ${row}` }),
};
const window = { current: "16.22", previous: "16.21" };

/** One lane's rows in one queue and patch: [dim, value, games, wins, top]. */
function rows(lane: BuildCountRow["lane"], patch: string, queue: BuildQueueId, parts: Array<[BuildCountRow["dim"], string, number, number, number?]>): BuildCountRow[] {
  return parts.map(([dim, value, n, w, top]) => ({ dim, patch, lane, queue, value, n, w, nm: 0, top: top ?? 1 }));
}

const SUPPORT: BuildCountRow[] = rows("UTILITY", "16.22", 420, [
  ["games", "", 120, 60, 4],
  ["timeline", "", 110, 55],
  ["runes", "8400:8439,8463,8473,8242|8300:8304,8347", 70, 30],
  ["runes", "8400:8465,8463,8473,8242|8300:8304,8347", 50, 38, 6],
  ["spells", "4,14", 120, 60],
  ["shards", "5007,5008,5001", 120, 60],
  ["skills", "QEW|QWE", 100, 50],
  ["start", "2003,3865", 110, 55],
  ["boots", "3158", 90, 45],
  ["core", "3190>3107>3109", 60, 30],
  ["core", "3107>3190>3109", 20, 10],
  ["fourth", "3107,3109,3190|3222", 40, 20],
]);
const FLEX: BuildCountRow[] = rows("UTILITY", "16.22", 440, [["games", "", 12, 6]]);

const counted = (r: BuildCountRow[]) => championBuildsViews("Pyke", r, window, icons) as Extract<ChampionBuildsViews, { status: "counted" }>;
const candidates = (r: BuildCountRow[]) => buildCandidates(r.filter((x) => x.dim === "games").map((x) => ({ champion: "Pyke", lane: x.lane, queue: x.queue, patch: x.patch, n: x.n })), window);

describe("the builds audit's choice of champions", () => {
  const counts: CandidateCount[] = [
    { champion: "Thresh", lane: "UTILITY", queue: 420, patch: "16.22", n: 50 },
    { champion: "Thresh", lane: "UTILITY", queue: 440, patch: "16.22", n: 18 },
    { champion: "Leona", lane: "UTILITY", queue: 420, patch: "16.22", n: 8 },
    { champion: "Leona", lane: "UTILITY", queue: 420, patch: "16.21", n: 23 },
    { champion: "Nasus", lane: "TOP", queue: 420, patch: "16.22", n: 30 },
    { champion: "Ahri", lane: "MIDDLE", queue: 420, patch: "16.22", n: 4 },
    { champion: "Jinx", lane: "BOTTOM", queue: 440, patch: "16.22", n: 22 },
    { champion: "Zed", lane: "MIDDLE", queue: 420, patch: "16.20", n: 90 },
    { champion: "Lux", lane: "MIDDLE", queue: 450, patch: "16.22", n: 90 },
  ];

  it("lists each champion-role-queue with enough games on its own window, never pooling queues, never an older patch or another queue", () => {
    const c = buildCandidates(counts, window);
    expect(c.map((x) => `${x.champion} ${x.role} ${x.queue} ${x.games} ${x.window.join("+")}`)).toEqual(["Thresh SUPPORT solo 50 16.22", "Leona SUPPORT solo 31 16.22+16.21", "Nasus TOP solo 30 16.22", "Jinx ADC flex 22 16.22"]);
  });

  it("audits the most played first, then others in turn by the day, at most six", () => {
    const c = buildCandidates(counts, window);
    expect(auditedChampions(c, 0, 2, 1)).toEqual(["Thresh", "Leona", "Nasus"]);
    expect(auditedChampions(c, 1, 2, 1)).toEqual(["Thresh", "Leona", "Jinx"]);
    expect(auditedChampions(c, 0)).toEqual(["Thresh", "Leona", "Nasus", "Jinx"]);
    expect(auditedChampions([], 5)).toEqual([]);
  });

  it("opens two champions with builds in Ranked Solo/Duo for the Production check, another queue's only where Solo/Duo has fewer", () => {
    const c = buildCandidates(counts, window);
    expect(probeChampions(c)).toEqual([{ champion: "Thresh", queue: "solo" }, { champion: "Leona", queue: "solo" }]);
    expect(probeChampions(c.filter((x) => x.champion !== "Leona" && x.champion !== "Nasus"))).toEqual([{ champion: "Thresh", queue: "solo" }, { champion: "Jinx", queue: "flex" }]);
    expect(probeChampions([])).toEqual([]);
  });
});

describe("the builds audit's rules", () => {
  it("re-derives a part from raw counts as the D6 rule does", () => {
    const m = (e: Array<[string, number, number, number]>) => new Map(e.map(([v, n, w, top]) => [v, { n, w, top }]));
    expect(rederivePart(m([["A", 100, 50, 1], ["B", 30, 23, 1]]), (v) => v)).toMatchObject({ state: "shown", standard: "A", performer: "B" });
    expect(rederivePart(m([["A", 100, 50, 1], ["B", 30, 23, 11]]), (v) => v)).toMatchObject({ performer: null });
    expect(rederivePart(m([["A", 26, 13, 1], ["B", 20, 16, 1]]), (v) => v)).toMatchObject({ standard: "A", performer: null });
    expect(rederivePart(m([["A", 12, 6, 1]]), (v) => v)).toMatchObject({ state: "few", total: 12 });
  });

  it("passes a champion whose page keeps every rule, and counts what it saw", () => {
    const r = [...SUPPORT, ...FLEX];
    const a = auditChampion("c1", r, window, counted(r), candidates(r));
    expect(a.violations).toEqual([]);
    expect(a.roles).toBe(1);
    expect(a.performers).toBe(1); // the rune page of 50 games and 38 wins against 70 and 30
    expect(a.queues).toEqual({ "400": 0, "420": 120, "440": 12, "700": 0 });
    expect(a.parts.shown + a.parts.few + a.parts.varied).toBe(7);
  });

  it("names a view that differs from the counts, by label only", () => {
    const r = [...SUPPORT, ...FLEX];
    const views = counted(r);
    const solo = views.queues.solo;
    if (solo.status !== "shown") throw new Error("shown");
    const b = solo.builds.SUPPORT!;
    // A performer the rule does not find; a most common that is not the most common; games pooled with Flex.
    const wrong = structuredClone(views);
    const w = (wrong.queues.solo as typeof solo).builds.SUPPORT!;
    if (w.runes.state === "shown") w.runes.performer = null;
    if (w.core.state === "shown") w.core.standard.key = "1,2,3";
    w.games = b.games + 12;
    const a = auditChampion("c2", r, window, wrong, candidates(r));
    expect(a.violations).toEqual(expect.arrayContaining(["c2/SUPPORT/solo:games", "c2/SUPPORT/solo:role-games", "c2/SUPPORT/solo/runes:performer", "c2/SUPPORT/solo/core:standard"]));
    expect(a.violations.join(" ")).not.toContain("Pyke");
  });

  it("names a candidate the page does not show, a value of the wrong form and a player's count above the value's", () => {
    const r = [...SUPPORT, ...FLEX, { dim: "runes" as const, patch: "16.22", lane: "UTILITY" as const, queue: 420 as const, value: "demo-player-1234", n: 1, w: 0, nm: 0, top: 2 }];
    const views = counted(SUPPORT);
    const lost = { ...views, queues: { ...views.queues, solo: { status: "few" as const, source: "team" as const, queue: "solo" as const, championName: "Pyke", currentPatch: "26.22", games: 0, role: null } } };
    const a = auditChampion("c3", r, window, lost, candidates(r));
    expect(a.violations).toEqual(expect.arrayContaining(["c3/SUPPORT/solo:not-shown", "c3/rows/runes:value-form", "c3/rows/runes:top"]));
    expect(auditTotals([a, a]).violations).toHaveLength(a.violations.length * 2);
  });
});
