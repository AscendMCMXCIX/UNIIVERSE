import { describe, expect, it } from "vitest";
import { QUEUE_NAMES, championLookupVerdicts, hasted, type ChampionLookupRead, type ChampionWindowRead } from "../../../scripts/champion-lookup-facts.mjs";
import { QUEUE_LABELS } from "@/domain/champion-builds-words";

/* The Production check's Champion Intel facts (scripts/champion-lookup-facts.mjs), on states handed in. */

const AT: ChampionLookupRead = {
  size: "1440x900",
  innerHeight: 900,
  scrollHeight: 900,
  heading: "Champion Intel",
  champion: "Ahri",
  name: "Ahri",
  source: "Riot Data Dragon 16.23.1 · patch 26.23",
  slots: "PQWER",
  complete: 5,
  haste: 0,
  qKind: "per-rank",
  qBase: [7, 7, 7, 7, 7],
  qHasted: [],
  qOpen: false,
  qDescription: 0,
  passiveKind: "passive-not-in-ddragon",
  passiveDash: "—",
  passive: "No cooldown in Riot's data—",
  passiveHasted: false,
  rule: "iCooldowns at a haste use Riot's rule: base × 100 / (100 + haste), only where Riot's data gives one. Ultimate haste isn't counted.",
  limit: "AbilitiesiMechanics are named from the words of Riot's descriptions. Riot's data has no damage values or scaling, and no cooldown for passives (—).",
  range: "550",
  mechanics: 7,
  slotKeys: "PQWER",
  namesCut: 0,
  lastBottom: 460,
  hasteBottom: 130,
  panels: 1,
  sideBySide: false,
  rowsLevel: false,
  scrollers: 0,
  timerWords: false,
  url: "/lookup?champion=Ahri",
  secondChampion: null,
  buildsStatus: "shown",
  buildsQueue: "solo",
  buildsSource: "team",
  buildsQueueShown: "Ranked Solo/Duo",
  buildsAddressQueue: false,
  buildsMasterOffered: false,
  buildsLine: "From 143 games in the team's matches · patch 26.23 · all ranks",
  buildsFew: "",
  buildsParts: [
    { part: "runes", state: "shown", win: "54%", pick: "61%", pictures: 8, trees: 2, text: "" },
    { part: "shards", state: "shown", win: "52%", pick: "40%", pictures: 3, trees: 0, text: "" },
    { part: "spells", state: "shown", win: "53%", pick: "88%", pictures: 2, trees: 0, text: "" },
    { part: "skills", state: "shown", win: "55%", pick: "70%", pictures: 0, trees: 0, text: "" },
    { part: "start", state: "shown", win: "52%", pick: "64%", pictures: 2, trees: 0, text: "" },
    { part: "boots", state: "shown", win: "51%", pick: "45%", pictures: 1, trees: 0, text: "" },
    { part: "core", state: "few", win: "", pick: "", pictures: 0, trees: 0, text: "Too few recorded yet (18 games)" },
  ],
  buildsLevel: null,
  buildsIdentity: false,
};
const WIDE: ChampionLookupRead = { ...AT, size: "1920x1080", innerHeight: 1080, scrollHeight: 1080 };
const HASTED: ChampionLookupRead = { ...AT, haste: 20, qHasted: [5.83, 5.83, 5.83, 5.83, 5.83], qOpen: true, qDescription: 120, url: "/lookup?champion=Ahri&haste=20" };
const DUAL: ChampionLookupRead = { ...AT, panels: 2, sideBySide: true, rowsLevel: true, slotKeys: "PQWER", lastBottom: 690, url: "/lookup?champion=Ahri&haste=20&champion2=Jinx", secondChampion: "Jinx", buildsLevel: true };
const SWAPPED: ChampionLookupRead = { ...DUAL, champion: "Jinx", secondChampion: "Ahri", url: "/lookup?champion=Jinx&champion2=Ahri&haste2=20" };
const REMOVED: ChampionLookupRead = { ...AT, haste: 20, url: "/lookup?champion=Ahri&haste=20" };
const ALL: ChampionWindowRead = { open: true, shown: 173, counted: 173, first: "Aatrox", found: "" };
const SEARCH: ChampionWindowRead = { open: true, shown: 1, counted: 173, first: "Ahri", found: "1 champion found" };
const LEGACY = { url: "/lookup?champion=Mordekaiser", champion: "Mordekaiser", heading: "Champion Intel" };
const run = (over: Partial<Parameters<typeof championLookupVerdicts>[0]> = {}) => championLookupVerdicts({ kind: "desktop", champion: "Ahri", at: AT, wide: WIDE, hastedRead: HASTED, all: ALL, search: SEARCH, dual: DUAL, swapped: SWAPPED, removed: REMOVED, legacy: LEGACY, healthPatch: "16.23", healthHighElo: "off", ...over });
const failed = (over: Partial<Parameters<typeof championLookupVerdicts>[0]> = {}) => run(over).filter((v) => v.status === "FAIL").map((v) => v.name);

describe("Champion Intel's Production check facts", () => {
  it("pass the page as it should be, every fact", () => {
    const v = run();
    expect(v.filter((x) => x.status !== "PASS")).toEqual([]);
    expect(v.length).toBeGreaterThanOrEqual(22);
  });

  it("hold the haste to Riot's rule on an ordinary ability", () => {
    expect(hasted(7, 20)).toBe(5.83);
    expect(failed({ hastedRead: { ...HASTED, qHasted: [5.8, 5.8, 5.8, 5.8, 5.8] } })).toHaveLength(1);
    expect(failed({ hastedRead: { ...HASTED, url: "/lookup?champion=Ahri" } })).toHaveLength(1);
    // A passive that gets a hasted line, or shows a number instead of its dash, fails its own fact.
    const passiveFact = "desktop: the passive shows a quiet dash for the cooldown Riot's data does not give (said in words to a screen reader), and gets no haste";
    expect(failed({ hastedRead: { ...HASTED, passiveHasted: true } })).toEqual([passiveFact]);
    expect(failed({ at: { ...AT, passiveDash: "" } })).toEqual([passiveFact]);
    expect(failed({ at: { ...AT, passiveKind: "per-rank" } })).toEqual([passiveFact]);
  });

  it("fail a page whose essentials leave the screen or scroll inside, a short roster, a missed search, and an old link that lands elsewhere", () => {
    expect(failed({ at: { ...AT, lastBottom: 940 } })).toHaveLength(1);
    expect(failed({ at: { ...AT, scrollers: 1 } })).toHaveLength(1);
    expect(failed({ hastedRead: { ...HASTED, qOpen: false } })).toHaveLength(1);
    expect(failed({ wide: { ...WIDE, scrollHeight: 1200 } })).toHaveLength(1);
    expect(failed({ all: { ...ALL, shown: 20 } })).toHaveLength(1);
    expect(failed({ search: { ...SEARCH, first: "Zed" } })).toHaveLength(1);
    expect(failed({ legacy: { ...LEGACY, url: "/lookup?champion=Riven", champion: "Riven" } })).toHaveLength(1);
    expect(failed({ at: { ...AT, timerWords: true } })).toHaveLength(1);
  });

  it("hold two champions side by side, both in the address, each one's rows on the screen and level with the other's; judge them only when read", () => {
    expect(failed({ dual: { ...DUAL, sideBySide: false } })).toHaveLength(1);
    expect(failed({ dual: { ...DUAL, lastBottom: 950 } })).toHaveLength(1);
    expect(failed({ dual: { ...DUAL, url: "/lookup?champion=Ahri" } })).toHaveLength(1);
    expect(failed({ dual: { ...DUAL, rowsLevel: false } })).toEqual(["desktop: Compare is one aligned board: each ability's row of the two champions level, the names whole, nothing scrolling inside"]);
    expect(failed({ dual: { ...DUAL, namesCut: 1 } })).toHaveLength(1);
    expect(run({ dual: undefined }).some((v) => v.name.includes("sits beside the first") || v.name.includes("aligned board"))).toBe(false);
  });

  it("hold Swap to exchanging the champions with their hastes, and the first column's ✕ to leaving the second alone; judge them only when read", () => {
    expect(failed({ swapped: { ...SWAPPED, url: "/lookup?champion=Jinx&champion2=Ahri" } })).toEqual(["desktop: Swap exchanges the two champions, each with its own haste, in the address"]);
    expect(failed({ swapped: { ...SWAPPED, champion: "Ahri", secondChampion: "Jinx" } })).toHaveLength(1);
    expect(failed({ removed: { ...REMOVED, panels: 2 } })).toEqual(["desktop: ✕ on the first column leaves the second champion alone, as the first, its haste with it"]);
    expect(failed({ removed: { ...REMOVED, url: "/lookup?champion=Ahri" } })).toHaveLength(1);
    expect(run({ swapped: undefined, removed: undefined }).some((v) => v.name.includes("Swap exchanges") || v.name.includes("✕ on the first column leaves"))).toBe(false);
  });

  it("name the step of Compare that did not finish, judge it on what the page showed, and never judge the steps after it", () => {
    const steps = "desktop: Compare, Swap and ✕ on the first column each finished (a step that did not is named; the steps after it are not judged)";
    const swapFact = "desktop: Swap exchanges the two champions, each with its own haste, in the address";
    const removeFact = "desktop: ✕ on the first column leaves the second champion alone, as the first, its haste with it";
    expect(run().find((v) => v.name === steps)?.status).toBe("PASS");
    // Compare never opened: the page is Ahri alone, at the very address ✕ would have left. Read as Compare's step (fails); Swap and ✕ not judged, never a PASS for a ✕ never pressed.
    const neverCompared = run({ dual: { ...REMOVED }, swapped: undefined, removed: undefined, stopped: "compare" });
    expect(neverCompared.find((v) => v.name === steps)).toMatchObject({ status: "FAIL", detail: { stopped: "compare" } });
    expect(neverCompared.some((v) => v.name === swapFact || v.name === removeFact)).toBe(false);
    expect(neverCompared.filter((v) => v.status === "FAIL").map((v) => v.name)).toContain("desktop: a second champion sits beside the first at 1440 × 900, both in the address, the five abilities of each on the screen");
    // Swap did not finish: Swap's own fact fails on the unswapped page; ✕ is not judged (no FAIL charged to it).
    const swapStuck = run({ swapped: { ...DUAL }, removed: undefined, stopped: "swap" });
    expect(swapStuck.filter((v) => v.status === "FAIL").map((v) => v.name).sort()).toEqual([steps, swapFact].sort());
    expect(swapStuck.some((v) => v.name === removeFact)).toBe(false);
    // ✕ did not finish: its own fact on the page as it was.
    expect(failed({ removed: { ...SWAPPED }, stopped: "remove" }).sort()).toEqual([steps, removeFact].sort());
  });

  it("hold the champion's name whole and the haste rule and Riot's limits in their ⓘ", () => {
    expect(failed({ at: { ...AT, namesCut: 1 } })).toEqual(["desktop: the champion's name is whole, on one line, at 1440 × 900 and 1920 × 1080"]);
    expect(failed({ wide: { ...WIDE, namesCut: 1 } })).toHaveLength(1);
    expect(failed({ at: { ...AT, limit: "Abilities" } })).toHaveLength(1);
    expect(failed({ at: { ...AT, rule: "" } })).toHaveLength(1);
    expect(failed({ at: { ...AT, slotKeys: "QWER" } })).toEqual(["desktop: each ability's slot key is a tile of its own, P to R"]);
  });

  it("hold the builds to a member's view: shown with their source line and every part, or the honest line naming the current patch; never a player's identity", () => {
    const shown = "desktop: the builds and runes are shown to a member who may see teammates' statistics: the builds, or the line that the patch has too few games yet";
    const line = "desktop: the builds' source line says the games, the team's matches, the current patch (the previous one added, or counted alone while the current has none, only where it says so) and all ranks";
    const solo = "desktop: the builds open on Ranked Solo/Duo, and the address names no queue";
    const one = "desktop: the builds name one queue's games, never several: the queue choice shows one of the four queues, the one the section counts";
    const trees = "desktop: the runes draw both trees: the primary's before its keystone, the secondary's before its runes";
    const parts = "desktop: each part of the builds shows its choice as icons with its win rate and pick rate, or says why there is none";
    const honest = "desktop: the builds' honest line names the queue and the current patch: no build made up from too few games";
    const identity = "desktop: the builds name no player: no Riot ID or account id in them, one champion or two";
    const level = "desktop: Compare: each champion's builds on one row after R, level in both columns";
    for (const name of [shown, line, parts, trees, identity, level, solo, one]) expect(run().find((v) => v.name === name)?.status, name).toBe("PASS");
    // D5: Ranked Solo/Duo by default, no queue in the address; one queue named, the one counted.
    expect(failed({ at: { ...AT, buildsAddressQueue: true } })).toEqual([solo]);
    expect(failed({ at: { ...AT, buildsQueue: "flex", buildsQueueShown: "Ranked Flex" } })).toEqual([solo]);
    expect(failed({ at: { ...AT, buildsQueueShown: "Ranked Flex" } })).toEqual([solo, one]);
    expect(failed({ at: { ...AT, buildsQueueShown: "Draft and Ranked" } })).toEqual([solo, one]);
    expect(failed({ at: { ...AT, buildsSource: "master" } })).toEqual([one]);
    // The queue left the source line (the queue choice beside it says it): a line still naming queues is not this one.
    expect(failed({ at: { ...AT, buildsLine: "From 143 games in the team's matches · patch 26.23 · all ranks · Draft and Ranked" } })).toEqual([line]);
    // The primary tree left out (or the secondary): the runes' trees fail; judged only where the runes are shown.
    expect(failed({ at: { ...AT, buildsParts: AT.buildsParts.map((r) => (r.part === "runes" ? { ...r, trees: 1 } : r)) } })).toEqual([trees]);
    expect(run({ at: { ...AT, buildsParts: AT.buildsParts.map((r) => (r.part === "runes" ? { ...r, state: "few", win: "", pick: "", pictures: 0, trees: 0, text: "Too few recorded yet (12 games)" } : r)) } }).some((v) => v.name === trees)).toBe(false);
    // No section, or one that could not be read.
    expect(failed({ at: { ...AT, buildsStatus: null } })).toEqual([shown]);
    expect(failed({ at: { ...AT, buildsStatus: "unavailable" } })).toEqual([shown]);
    // The previous patch added is said; an older patch alone, or another patch, is not this one.
    expect(failed({ at: { ...AT, buildsLine: "From 31 games in the team's matches · patches 26.22–26.23 · all ranks" } })).toEqual([]);
    expect(failed({ at: { ...AT, buildsLine: "From 31 games in the team's matches · patch 26.22 · all ranks" } })).toEqual([line]);
    // No game yet on the current patch: the previous patch alone, said as that, names the current one.
    expect(failed({ at: { ...AT, buildsLine: "From 31 games in the team's matches · patch 26.22, none yet on 26.23 · all ranks" } })).toEqual([]);
    expect(failed({ at: { ...AT, buildsLine: "From 31 games in the team's matches · patch 26.21, none yet on 26.22 · all ranks" } })).toEqual([line]);
    expect(failed({ at: { ...AT, buildsLine: "From 31 games · patch 26.23" } })).toEqual([line]);
    // A part with no figures, no icons, or missing.
    expect(failed({ at: { ...AT, buildsParts: AT.buildsParts.map((r) => (r.part === "runes" ? { ...r, win: "" } : r)) } })).toEqual([parts]);
    expect(failed({ at: { ...AT, buildsParts: AT.buildsParts.map((r) => (r.part === "spells" ? { ...r, pictures: 0 } : r)) } })).toEqual([parts]);
    expect(failed({ at: { ...AT, buildsParts: AT.buildsParts.filter((r) => r.part !== "boots") } })).toEqual([parts]);
    // Too few games: the honest line, naming this patch, with no part.
    const few = { ...AT, buildsStatus: "few", buildsLine: "", buildsParts: [], buildsFew: "Not enough Ranked Solo/Duo games on patch 26.23 in the team's matches yet" };
    expect(failed({ at: few })).toEqual([]);
    expect(run({ at: few }).find((v) => v.name === honest)?.status).toBe("PASS");
    expect(failed({ at: { ...few, buildsFew: "Not enough Ranked Solo/Duo games on patch 26.22 in the team's matches yet" } })).toEqual([honest]);
    // The line names the queue the section counts, never another, never none.
    expect(failed({ at: { ...few, buildsFew: "Not enough games on patch 26.23 in the team's matches yet" } })).toEqual([honest]);
    expect(failed({ at: { ...few, buildsFew: "Not enough Ranked Flex games on patch 26.23 in the team's matches yet" } })).toEqual([honest]);
    expect(failed({ at: { ...few, buildsParts: AT.buildsParts } })).toEqual([honest]);
    // Never a player's identity, in one champion's builds or in Compare's.
    expect(failed({ at: { ...AT, buildsIdentity: true } })).toEqual([identity]);
    expect(failed({ dual: { ...DUAL, buildsIdentity: true } })).toEqual([identity]);
    // Compare's two builds rows level, judged only with two.
    expect(failed({ dual: { ...DUAL, buildsLevel: false } })).toEqual([level]);
    expect(run({ dual: { ...DUAL, buildsLevel: null } }).some((v) => v.name === level)).toBe(false);
  });

  it("hold the Master+ source to /api/health: offered only while its collection is on", () => {
    const off = "desktop: /api/health says the Master+ builds' collection is off, and the builds offer no Master+ source";
    expect(run({ healthHighElo: "off" }).find((v) => v.name === off)?.status).toBe("PASS");
    expect(failed({ healthHighElo: "off", at: { ...AT, buildsMasterOffered: true } })).toEqual([off]);
    expect(failed({ healthHighElo: "on" })).toEqual(["desktop: /api/health says the Master+ builds' collection is on, and the builds offer Master+ source"]);
    expect(failed({ healthHighElo: "on", at: { ...AT, buildsMasterOffered: true } })).toEqual([]);
    expect(run({ healthHighElo: null }).find((v) => v.name.includes("does not say whether"))?.status).toBe("WARN");
  });

  it("name the queues as the page does", () => {
    expect(QUEUE_NAMES).toEqual(QUEUE_LABELS);
  });

  it("compare the patch with /api/health's, and accept the line that says the game is ahead", () => {
    // The abilities' patch, and the builds' (always counted on the game's current patch), both against it.
    expect(failed({ healthPatch: "16.24" })).toHaveLength(2);
    expect(failed({ healthPatch: "16.24", at: { ...AT, source: "Riot Data Dragon 16.23.1 · patch 26.23 · the game is on patch 26.24", buildsLine: "From 22 games in the team's matches · patches 26.23–26.24 · all ranks" } })).toEqual([]);
    expect(run({ healthPatch: undefined, healthHighElo: undefined }).some((v) => v.name.includes("/api/health"))).toBe(false);
  });

  it("warn, not fail, where the abilities are not stored, the Q has no number on a later patch, or the stored record predates the facts", () => {
    expect(run({ at: { ...AT, range: "" } }).find((v) => v.name.includes("attack range"))?.status).toBe("WARN");
    expect(run({ at: { ...AT, mechanics: 0 } }).find((v) => v.name.includes("mechanics"))?.status).toBe("WARN");
    const missing = run({ at: { ...AT, slots: "", complete: 0 } });
    expect(missing.find((v) => v.name.includes("not on the page"))?.status).toBe("WARN");
    const special = run({ at: { ...AT, qKind: "charges-in-ddragon" } });
    expect(special.find((v) => v.name.includes("not judged"))?.status).toBe("WARN");
    expect(special.filter((v) => v.status === "FAIL")).toEqual([]);
  });
});
