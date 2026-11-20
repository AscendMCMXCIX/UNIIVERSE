import { describe, expect, it } from "vitest";
import { championPreviewVerdicts, firstWithGames, type ChampionPreviewRead } from "../../../scripts/champion-preview-facts.mjs";

/*
  The Production check's All Champions preview facts (scripts/champion-preview-facts.mjs): the
  reading below is the demo's first champion with 3+ games as the live check's own reader saw it
  (20 Nov 2026). The facts pass on it, fail the regressions they exist for, and only warn when a
  member's data has no such item.
*/

const DEMO: ChampionPreviewRead = {
  open: true,
  sameChampion: true,
  rowGames: 14,
  portrait: true,
  named: true,
  role: "Top · In pool",
  record: "14 games · 4W 10L",
  winRate: "29%",
  loading: false,
  noOpponents: false,
  answered: true,
  opponents: [{ games: 7, says: true }, { games: 4, says: true }],
  intel: 1,
  intelChampion: true,
  intelVs: true,
  address: { champion: true },
};
const STEP = { next: true, address: true, replaced: true };
const ESC = { closed: true, address: true };
const run = (at: ChampionPreviewRead, step: typeof STEP | null = STEP, escaped = ESC) => championPreviewVerdicts({ kind: "desktop", at, step, escaped });
const failed = (at: ChampionPreviewRead, step: typeof STEP | null = STEP, escaped = ESC) => run(at, step, escaped).filter((v) => v.status === "FAIL").map((v) => v.name);

describe("All Champions' preview facts", () => {
  it("pass on the demo's preview", () => {
    expect(run(DEMO).map((v) => v.status)).toEqual(Array(7).fill("PASS"));
  });
  it("choose the first row with 3 or more games, or none", () => {
    expect(firstWithGames([{ games: 2, open: false }, { games: 3, open: false }])).toBe(1);
    expect(firstWithGames([{ games: 1, open: false }])).toBe(-1);
  });
  it("fail a record that disagrees with the row or does not add up", () => {
    expect(failed({ ...DEMO, rowGames: 13 })).toHaveLength(1);
    expect(failed({ ...DEMO, record: "14 games · 4W 9L" })).toHaveLength(1);
    expect(failed({ ...DEMO, record: "14 games" })).toHaveLength(2);
  });
  it("fail a win rate that is not the wins over the games", () => {
    expect(failed({ ...DEMO, winRate: "40%" })).toEqual(["desktop: the preview shows the win rate, the wins over the games"]);
    expect(failed({ ...DEMO, winRate: "—" })).toHaveLength(1);
  });
  it("fail a missing identity, an opponent row without its games and more than one Matchup Intel link", () => {
    expect(failed({ ...DEMO, portrait: false })).toHaveLength(1);
    expect(failed({ ...DEMO, role: "" })).toHaveLength(1);
    expect(failed({ ...DEMO, opponents: [{ games: 7, says: false }] })).toHaveLength(1);
    expect(failed({ ...DEMO, intel: 2 })).toHaveLength(1);
    expect(failed({ ...DEMO, intelVs: false })).toHaveLength(1);
  });
  it("fail ↓ pushing a history entry, and Escape leaving it open", () => {
    expect(failed(DEMO, { ...STEP, replaced: false })).toHaveLength(1);
    expect(failed(DEMO, STEP, { closed: false, address: true })).toHaveLength(1);
  });
  it("warn, not fail, when the data has no opponent or no second row", () => {
    const v = run({ ...DEMO, opponents: [], noOpponents: true, intel: 0 }, null);
    expect(v.filter((x) => x.status === "FAIL")).toEqual([]);
    expect(v.filter((x) => x.status === "WARN")).toHaveLength(2);
  });
  it("fail, not warn, a preview whose answer could not be loaded", () => {
    expect(failed({ ...DEMO, opponents: [], intel: 0, answered: false })).toEqual(["desktop: the opponents loaded"]);
    expect(failed({ ...DEMO, opponents: [], intel: 0 })).toHaveLength(2);
  });
  it("fail a preview that never opened", () => {
    expect(failed({ open: false })).toHaveLength(1);
  });
});
