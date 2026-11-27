import { describe, expect, it } from "vitest";
import { BUILD_RULES, buildsVerdicts, highestProblems, newcombe, probeFrom, probePath, sectionProblems, wilson, type BuildsColumnRead, type BuildsPartRead, type BuildsRead } from "../../../scripts/builds-facts.mjs";
import { FIRM_WIN_RATE_GAMES, MIN_CHOICE_GAMES, MIN_CHOICE_SHARE, MIN_PART_GAMES, MIN_PERFORMER_GAMES, MIN_PERFORMER_SHARE, MIN_SECTION_GAMES, PERFORMER_MARGIN, PERFORMER_Z, differenceInterval, wilsonInterval } from "@/domain/champion-builds";

/*
  The Production check's populated builds facts (scripts/builds-facts.mjs; docs/LIVE_VALIDATION.md,
  "What it checks"): the rules are the page's, the intervals the domain's, and each fact passes on a
  page that keeps the rules and fails, naming what, on one that does not: a choice under its
  thresholds, a figure that is not its count, a missing likely range, a small sample not greyed, a
  "Highest win rate" that is not 99% clear, a queue mixed or not followed, Compare's rows not level.
  No champion's name in any fact.
*/

const part = (over: Partial<BuildsPartRead> & { part: string }): BuildsPartRead => ({
  state: "shown",
  choice: "common",
  games: 60,
  wins: 33,
  total: 100,
  key: "k",
  commonGames: null,
  commonWins: null,
  commonKey: null,
  fourth: null,
  fifth: null,
  win: "55%",
  pick: "60%",
  tip: "Won 55% of 60 games with these summoner spells, likely 42–67%. 60% of 100 games with summoner spells recorded made it.",
  firm: true,
  greyed: false,
  pictures: 2,
  top: 500,
  ...over,
});
const PARTS: BuildsPartRead[] = [
  ...["runes", "shards", "spells", "skills", "start", "boots", "core"].map((p, i) => part({ part: p, top: 500 + i * 30, pictures: p === "skills" ? 0 : 2 })),
  part({ part: "full", games: null, wins: null, total: null, key: null, win: "", pick: "", tip: "", firm: null, greyed: null, fourth: { games: 20, total: 50 }, fifth: null, top: 710 }),
];
const column = (n: number, over: Partial<BuildsColumnRead> = {}): BuildsColumnRead => ({
  n,
  status: "shown",
  queue: "solo",
  source: "team",
  queueShown: "Ranked Solo/Duo",
  role: "SUPPORT",
  roles: [{ role: "SUPPORT", games: 120 }],
  mode: "common",
  offersHighest: false,
  line: "From 120 games in the team's matches · patch 26.23 · all ranks",
  games: 120,
  patches: ["26.23"],
  currentGames: 120,
  timelineGames: 110,
  few: "",
  offer: null,
  top: 480,
  parts: PARTS,
  identity: false,
  scrollers: 0,
  ...over,
});
const read = (over: Partial<BuildsRead> = {}, cols: BuildsColumnRead[] = [column(1), column(2)]): BuildsRead => ({ url: "/lookup?champion=x&champion2=y", queueInAddress: null, loads: 1, mark: true, columns: cols, ...over });
const probe = [
  { champion: "Thresh", queue: "solo" as const },
  { champion: "Leona", queue: "solo" as const },
];
const FLEX = read({ queueInAddress: "flex" }, [column(1, { queue: "flex", queueShown: "Ranked Flex", status: "few", few: "Not enough Ranked Flex games on patch 26.23 in the team's matches yet", parts: [], offer: { queue: "solo", text: "Show Ranked Solo/Duo (120 games as Support)" } }), column(2, { queue: "flex", queueShown: "Ranked Flex", status: "few", few: "Not enough Ranked Flex games on patch 26.23 in the team's matches yet", parts: [], offer: null })]);
const OFFERED = read({ queueInAddress: null });
const SWAPPED = read({ queueInAddress: "flex" }, [column(1, { queue: "flex", status: "few", parts: [] }), column(2, { queue: "flex", status: "few", parts: [] })]);
const base = { kind: "desktop", probe, at: read(), flex: FLEX, offered: OFFERED, back: read(), swapped: SWAPPED, healthPatch: "16.23" };
const run = (over: Partial<Parameters<typeof buildsVerdicts>[0]> = {}) => buildsVerdicts({ ...base, ...over });
const failed = (over: Partial<Parameters<typeof buildsVerdicts>[0]> = {}) => run(over).filter((v) => v.status === "FAIL").map((v) => v.name);

describe("the populated builds facts", () => {
  it("hold the page's rules and the domain's intervals", () => {
    expect(BUILD_RULES).toEqual({ section: MIN_SECTION_GAMES, part: MIN_PART_GAMES, choiceGames: MIN_CHOICE_GAMES, choiceShare: MIN_CHOICE_SHARE, performerGames: MIN_PERFORMER_GAMES, performerShare: MIN_PERFORMER_SHARE, performerZ: PERFORMER_Z, margin: PERFORMER_MARGIN, firmGames: FIRM_WIN_RATE_GAMES });
    for (const [w, n] of [[14, 20], [33, 60], [0, 10], [10, 10]]) expect(wilson(w!, n!)).toEqual(wilsonInterval(w!, n!));
    for (const [a, b] of [[[56, 70], [48, 80]], [[23, 30], [50, 100]], [[5, 56], [0, 29]]] as const) {
      const x = { wins: a[0], games: a[1] };
      const y = { wins: b[0], games: b[1] };
      expect(newcombe(x, y, PERFORMER_Z)).toEqual(differenceInterval(x, y, PERFORMER_Z));
    }
  });

  it("read the probe from the builds audit, or the demo's champions for a local run, and open them in one address", () => {
    expect(probeFrom("Thresh:solo,Leona:flex,Nasus:solo", false)).toEqual([{ champion: "Thresh", queue: "solo" }, { champion: "Leona", queue: "flex" }]);
    expect(probeFrom("", true)).toEqual(probe);
    expect(probeFrom(undefined, false)).toEqual([]);
    expect(probeFrom("<script>:solo", false)).toEqual([]);
    expect(probePath(probe)).toBe("/lookup?champion=Thresh&champion2=Leona");
    expect(probePath([{ champion: "Jinx", queue: "flex" }])).toBe("/lookup?champion=Jinx&queue=flex");
  });

  it("pass a page that keeps every rule, naming no champion", () => {
    const v = run();
    expect(v.filter((x) => x.status === "FAIL")).toEqual([]);
    expect(v.map((x) => x.name).join(" ")).not.toMatch(/Thresh|Leona/);
    expect(v.some((x) => x.name.includes("Swap keeps the page's queue") && x.status === "PASS")).toBe(true);
    expect(v.some((x) => x.name.includes("offer of another queue") && x.status === "PASS")).toBe(true);
  });

  it("warn, never fail, with no probe", () => {
    const v = run({ probe: [] });
    expect(v).toHaveLength(1);
    expect(v[0]!.status).toBe("WARN");
    expect(v[0]!.name).toContain("not applicable");
  });

  it("fail a section that is not shown, or a choice under its thresholds, figures not its counts, no likely range, a small sample not greyed", () => {
    const rules = "desktop: builds champion: every part shown with its thresholds kept (10 games and a tenth of its part), its win and pick rates as counted, its likely range in its ⓘ, small samples greyed, items and skills within the games with a timeline";
    const shown = "desktop: builds champion: the champions the team's data has builds for show them";
    const withPart = (p: Partial<BuildsPartRead>) => read({}, [column(1, { parts: PARTS.map((x) => (x.part === "spells" ? { ...x, ...p } : x)) }), column(2)]);
    expect(failed({ at: read({}, [column(1, { status: "few", parts: [] }), column(2)]) })).toEqual(expect.arrayContaining([shown]));
    // 9 games; 9.6% of its part (shown as "10%"); a win rate that is not its count; no likely range; under 30 games not greyed.
    expect(sectionProblems(withPart({ games: 9, wins: 5, win: "56%", pick: "9%", firm: false, greyed: true }).columns[0]!)).toContain("spells threshold");
    expect(sectionProblems(withPart({ games: 10, wins: 5, total: 104, win: "50%", pick: "10%", firm: false, greyed: true }).columns[0]!)).toEqual(["spells threshold"]);
    expect(failed({ at: withPart({ win: "56%" }) })).toEqual([rules]);
    expect(failed({ at: withPart({ tip: "Won 55% of 60 games." }) })).toEqual([rules]);
    expect(failed({ at: withPart({ games: 29, wins: 16, win: "55%", pick: "29%", firm: true, greyed: false }) })).toEqual([rules]);
    expect(failed({ at: withPart({ games: 29, wins: 16, win: "55%", pick: "29%", firm: false, greyed: true }) })).toEqual([]);
    // "few" with 20 games or more; a window holding the previous patch while the current has enough.
    expect(sectionProblems(column(1, { parts: PARTS.map((x) => (x.part === "core" ? { ...x, state: "few", total: 24 } : x)) }))).toContain("core state");
    expect(sectionProblems(column(1, { patches: ["26.23", "26.22"], currentGames: 40 }))).toContain("window");
    // A timeline part above the games with a timeline.
    expect(sectionProblems(column(1, { timelineGames: 50 }))).toContain("skills total");
  });

  it("re-compute every \"Highest win rate\" row from its counts: 30 games, 15%, 2 points, 99% clear", () => {
    const rule = 'desktop: builds champion: a "Highest win rate" choice comes from 30 games and 15% of its part, 2 points and 99% clearly above the most common (re-computed from its counts)';
    const highestRead = (p: Partial<BuildsPartRead>) => read({}, [column(1, { mode: "highest", parts: PARTS.map((x) => (x.part === "core" ? { ...x, choice: "highest", games: 30, wins: 23, total: 110, key: "b", commonGames: 100, commonWins: 50, commonKey: "a", win: "77%", pick: "27%", ...p } : x)) })]);
    const at = read({}, [column(1, { offersHighest: true }), column(2)]);
    expect(highestProblems(highestRead({}).columns[0]!)).toEqual([]);
    expect(failed({ at, highest: highestRead({}) })).toEqual([]);
    // 22 of 30 against 50 of 100: not 99% clear.
    expect(failed({ at, highest: highestRead({ wins: 22, win: "73%" }) })).toEqual([rule]);
    // 29 games; 14% of the part; the same family as the most common.
    expect(highestProblems(highestRead({ games: 29, wins: 23, win: "79%", pick: "22%" }).columns[0]!)).toEqual(["core rule"]);
    expect(highestProblems(highestRead({ total: 220, pick: "14%" }).columns[0]!)).toEqual(["core rule"]);
    expect(highestProblems(highestRead({ key: "a" }).columns[0]!)).toEqual(["core rule"]);
    // Offered with no row that differs.
    expect(highestProblems(read({}, [column(1)]).columns[0]!)).toEqual(["no row differs"]);
    // Not offered: every row the most common.
    expect(failed({ at: read({}, [column(1, { parts: PARTS.map((x) => (x.part === "core" ? { ...x, choice: "highest" } : x)) }), column(2)]) })).toEqual(['desktop: builds champion: no "Highest win rate" view without a choice that qualifies: every row the most common']);
  });

  it("hold each other role to its own games, the queue to the page (never mixed, followed by both columns, kept by Swap), and Compare's rows level", () => {
    const roles = "desktop: builds champion: each other role offered has 20 games or more, and choosing it shows that role's own counts under the same rules";
    const two = read({}, [column(1, { roles: [{ role: "SUPPORT", games: 120 }, { role: "MID", games: 34 }] }), column(2)]);
    const mid = read({}, [column(1, { role: "MID", games: 34, currentGames: 34, line: "From 34 games in the team's matches · patch 26.23 · all ranks", timelineGames: 34, parts: PARTS.map((x) => (x.total !== null ? { ...x, games: 20, wins: 11, total: 30, win: "55%", pick: "67%", firm: false, greyed: true } : x)) })]);
    expect(failed({ at: two, roles: [mid] })).toEqual([]);
    expect(failed({ at: two, roles: [] })).toEqual([roles]);
    expect(failed({ at: two, roles: [read({}, [column(1, { role: "MID", games: 30 })])] })).toEqual([roles]);
    // The queue: opened on Solo/Duo with no queue in the address; Ranked Flex chosen, both columns, no page load.
    const opened = "desktop: builds champion: the builds open on Ranked Solo/Duo, and the address names no queue";
    expect(failed({ at: read({ queueInAddress: "solo" }) })).toEqual([opened]);
    expect(failed({ at: read({}, [column(1, { queueShown: "Draft and Ranked" }), column(2)]) })).toEqual([opened]);
    const flexFact = "desktop: builds champion: Ranked Flex chosen in the page: both columns read it, with no page load, the address says queue=flex; its builds, or the honest line naming Ranked Flex";
    expect(failed({ flex: { ...FLEX, mark: false } })).toEqual([flexFact]);
    expect(failed({ flex: { ...FLEX, columns: [FLEX.columns[0]!, { ...FLEX.columns[1]!, queue: "solo" }] } })).toEqual([flexFact]);
    expect(failed({ flex: { ...FLEX, columns: [FLEX.columns[0]!, { ...FLEX.columns[1]!, few: "Not enough games on patch 26.23 in the team's matches yet" }] } })).toEqual([flexFact]);
    expect(failed({ flex: undefined, offered: undefined })).toEqual(["desktop: builds champion: Ranked Flex chosen in the page (the queue choice could not be used)"]);
    expect(failed({ back: read({ queueInAddress: "flex" }) })).toEqual(["desktop: builds champion: Ranked Solo/Duo chosen again: the address names no queue, both columns on it"]);
    expect(failed({ swapped: read({ queueInAddress: null }) })).toEqual(["desktop: builds champion: Swap keeps the page's queue in the address and both columns"]);
    // Compare's rows level; the patch /api/health names.
    expect(failed({ at: read({}, [column(1), column(2, { parts: PARTS.map((x) => (x.part === "boots" ? { ...x, top: x.top + 4 } : x)) })]) })).toEqual(["desktop: builds champion: Compare: each part's row level across the two champions' builds, nothing scrolling inside"]);
    expect(failed({ healthPatch: "16.24" })).toEqual(["desktop: builds champion: the source line's newest patch is /api/health's"]);
    // One champion: no Compare or Swap facts.
    const one = buildsVerdicts({ ...base, probe: [probe[0]!], at: read({}, [column(1)]), flex: { ...FLEX, columns: [FLEX.columns[0]!] }, offered: read({}, [column(1)]), back: read({}, [column(1)]), swapped: undefined });
    expect(one.filter((v) => v.status === "FAIL")).toEqual([]);
    expect(one.some((v) => /Compare|Swap/.test(v.name))).toBe(false);
  });
});
