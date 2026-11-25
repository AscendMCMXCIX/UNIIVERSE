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
  passive: "No cooldown in Riot's data",
  passiveHasted: false,
  rule: "At a haste: base × 100 / (100 + haste), Riot's general rule, applied only where Riot's data gives the cooldown. Ultimate haste isn't counted. Riot's published data has no damage values or scaling for abilities, so none are shown: a description names the damage type where Riot's words do.",
  range: "550",
  mechanics: 7,
  lastBottom: 460,
  hasteBottom: 130,
  panels: 1,
  sideBySide: false,
  scrollers: 0,
  timerWords: false,
  url: "/lookup?champion=Ahri",
};
const WIDE: ChampionLookupRead = { ...AT, size: "1920x1080", innerHeight: 1080, scrollHeight: 1080 };
const HASTED: ChampionLookupRead = { ...AT, haste: 20, qHasted: [5.83, 5.83, 5.83, 5.83, 5.83], qOpen: true, qDescription: 120, url: "/lookup?champion=Ahri&haste=20" };
const DUAL: ChampionLookupRead = { ...AT, panels: 2, sideBySide: true, lastBottom: 690, url: "/lookup?champion=Ahri&haste=20&champion2=Jinx" };
const ALL: ChampionWindowRead = { open: true, shown: 173, counted: 173, first: "Aatrox", found: "" };
const SEARCH: ChampionWindowRead = { open: true, shown: 1, counted: 173, first: "Ahri", found: "1 champion found" };
const LEGACY = { url: "/lookup?champion=Mordekaiser", champion: "Mordekaiser", heading: "Champion Intel" };
const run = (over: Partial<Parameters<typeof championLookupVerdicts>[0]> = {}) => championLookupVerdicts({ kind: "desktop", champion: "Ahri", at: AT, wide: WIDE, hastedRead: HASTED, all: ALL, search: SEARCH, dual: DUAL, legacy: LEGACY, healthPatch: "16.23", ...over });
const failed = (over: Partial<Parameters<typeof championLookupVerdicts>[0]> = {}) => run(over).filter((v) => v.status === "FAIL").map((v) => v.name);

describe("Champion Intel's Production check facts", () => {
  it("pass the page as it should be, every fact", () => {
    const v = run();
    expect(v.filter((x) => x.status !== "PASS")).toEqual([]);
    expect(v.length).toBeGreaterThanOrEqual(12);
  });

  it("hold the haste to Riot's rule on an ordinary ability", () => {
    expect(hasted(7, 20)).toBe(5.83);
    expect(failed({ hastedRead: { ...HASTED, qHasted: [5.8, 5.8, 5.8, 5.8, 5.8] } })).toHaveLength(1);
    expect(failed({ hastedRead: { ...HASTED, url: "/lookup?champion=Ahri" } })).toHaveLength(1);
    // A passive that gets a hasted line fails its own fact.
    expect(failed({ hastedRead: { ...HASTED, passiveHasted: true } })).toEqual(["desktop: the passive says Riot's data gives it no cooldown, and gets no haste"]);
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

  it("hold two champions side by side, both in the address, each one's rows on the screen; judge them only when read", () => {
    expect(failed({ dual: { ...DUAL, sideBySide: false } })).toHaveLength(1);
    expect(failed({ dual: { ...DUAL, lastBottom: 950 } })).toHaveLength(1);
    expect(failed({ dual: { ...DUAL, url: "/lookup?champion=Ahri" } })).toHaveLength(1);
    expect(run({ dual: undefined }).some((v) => v.name.includes("second champion"))).toBe(false);
  });

  it("compare the patch with /api/health's, and accept the line that says the game is ahead", () => {
    expect(failed({ healthPatch: "16.24" })).toHaveLength(1);
    expect(failed({ healthPatch: "16.24", at: { ...AT, source: "Riot Data Dragon 16.23.1 · patch 26.23 · the game is on patch 26.24" } })).toEqual([]);
    expect(run({ healthPatch: undefined }).some((v) => v.name.includes("/api/health"))).toBe(false);
  });

  it("warn, not fail, where the abilities are not stored, the Q has no number on a later patch, or the stored record predates the facts", () => {
    expect(run({ at: { ...AT, range: "" } }).find((v) => v.name.includes("attack range"))?.status).toBe("WARN");
    expect(run({ at: { ...AT, mechanics: 0 } }).find((v) => v.name.includes("key mechanics"))?.status).toBe("WARN");
    const missing = run({ at: { ...AT, slots: "", complete: 0 } });
    expect(missing.find((v) => v.name.includes("not on the page"))?.status).toBe("WARN");
    const special = run({ at: { ...AT, qKind: "charges-in-ddragon" } });
    expect(special.find((v) => v.name.includes("not judged"))?.status).toBe("WARN");
    expect(special.filter((v) => v.status === "FAIL")).toEqual([]);
  });
});
