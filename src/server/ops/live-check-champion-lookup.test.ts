import { describe, expect, it } from "vitest";
import { championLookupVerdicts, hasted, type ChampionLookupRead, type ChampionWindowRead } from "../../../scripts/champion-lookup-facts.mjs";

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
  rule: "iCooldowns at a haste use Riot's rule: base × 100 / (100 + haste). It applies only where Riot's data gives a cooldown. Ultimate haste isn't counted.",
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
};
const WIDE: ChampionLookupRead = { ...AT, size: "1920x1080", innerHeight: 1080, scrollHeight: 1080 };
const HASTED: ChampionLookupRead = { ...AT, haste: 20, qHasted: [5.83, 5.83, 5.83, 5.83, 5.83], qOpen: true, qDescription: 120, url: "/lookup?champion=Ahri&haste=20" };
const DUAL: ChampionLookupRead = { ...AT, panels: 2, sideBySide: true, rowsLevel: true, slotKeys: "PQWER", lastBottom: 690, url: "/lookup?champion=Ahri&haste=20&champion2=Jinx", secondChampion: "Jinx" };
const SWAPPED: ChampionLookupRead = { ...DUAL, champion: "Jinx", secondChampion: "Ahri", url: "/lookup?champion=Jinx&champion2=Ahri&haste2=20" };
const REMOVED: ChampionLookupRead = { ...AT, haste: 20, url: "/lookup?champion=Ahri&haste=20" };
const ALL: ChampionWindowRead = { open: true, shown: 173, counted: 173, first: "Aatrox", found: "" };
const SEARCH: ChampionWindowRead = { open: true, shown: 1, counted: 173, first: "Ahri", found: "1 champion found" };
const LEGACY = { url: "/lookup?champion=Mordekaiser", champion: "Mordekaiser", heading: "Champion Intel" };
const run = (over: Partial<Parameters<typeof championLookupVerdicts>[0]> = {}) => championLookupVerdicts({ kind: "desktop", champion: "Ahri", at: AT, wide: WIDE, hastedRead: HASTED, all: ALL, search: SEARCH, dual: DUAL, swapped: SWAPPED, removed: REMOVED, legacy: LEGACY, healthPatch: "16.23", ...over });
const failed = (over: Partial<Parameters<typeof championLookupVerdicts>[0]> = {}) => run(over).filter((v) => v.status === "FAIL").map((v) => v.name);

describe("Champion Intel's Production check facts", () => {
  it("pass the page as it should be, every fact", () => {
    const v = run();
    expect(v.filter((x) => x.status !== "PASS")).toEqual([]);
    expect(v.length).toBeGreaterThanOrEqual(17);
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
    expect(run({ swapped: undefined, removed: undefined }).some((v) => v.name.includes("Swap") || v.name.includes("first column"))).toBe(false);
  });

  it("hold the champion's name whole and the haste rule and Riot's limits in their ⓘ", () => {
    expect(failed({ at: { ...AT, namesCut: 1 } })).toEqual(["desktop: the champion's name is whole, on one line, at 1440 × 900 and 1920 × 1080"]);
    expect(failed({ wide: { ...WIDE, namesCut: 1 } })).toHaveLength(1);
    expect(failed({ at: { ...AT, limit: "Abilities" } })).toHaveLength(1);
    expect(failed({ at: { ...AT, rule: "" } })).toHaveLength(1);
    expect(failed({ at: { ...AT, slotKeys: "QWER" } })).toEqual(["desktop: each ability's slot key is a tile of its own, P to R"]);
  });

  it("compare the patch with /api/health's, and accept the line that says the game is ahead", () => {
    expect(failed({ healthPatch: "16.24" })).toHaveLength(1);
    expect(failed({ healthPatch: "16.24", at: { ...AT, source: "Riot Data Dragon 16.23.1 · patch 26.23 · the game is on patch 26.24" } })).toEqual([]);
    expect(run({ healthPatch: undefined }).some((v) => v.name.includes("/api/health"))).toBe(false);
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
