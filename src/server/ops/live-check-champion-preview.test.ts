import { describe, expect, it } from "vitest";
import { championPreviewVerdicts, firstWithGames, targetRow, type ChampionPreviewRead } from "../../../scripts/champion-preview-facts.mjs";

/*
  The Production check's All Champions preview facts (scripts/champion-preview-facts.mjs): the
  reading below is the demo's first champion with 3+ games as the live check's own reader sees it
  (25 Nov 2026: a pane beside the list, the position it shows one of the row's position icons, every
  lane opponent in one table, and the page the one thing that scrolls). The facts pass on it, fail the regressions they exist for, and only
  warn when a member's data has no such item.
*/

const DEMO: ChampionPreviewRead = {
  open: true,
  sameChampion: true,
  rowGames: 14,
  portrait: true,
  named: true,
  role: "TOP",
  position: { chosen: true, icon: true, first: true, icons: 1 },
  roleGames: 14,
  record: "14 games · 4W 10L",
  winRate: "29%",
  pane: { pane: true, window: false, within: true, besideList: true, nameClear: true },
  scrolling: { scrollBox: false, scrollers: 0, head: true },
  loading: false,
  noOpponents: false,
  answered: true,
  opponents: [
    { games: 7, says: true, rate: true, small: false },
    { games: 4, says: true, rate: true, small: false },
    { games: 2, says: true, rate: true, small: true },
    { games: 1, says: true, rate: true, small: true },
  ],
  folded: 0,
  lookup: 1,
  lookupPage: true,
  lookupChampion: true,
  lookupLane: true,
  address: { champion: true, role: true },
};
const STEP = { next: true, address: true, replaced: true };
const ESC = { closed: true, address: true };
const KEPT = { scrolled: 412, open: 0, closed: 0 };
const run = (at: ChampionPreviewRead, step: typeof STEP | null = STEP, escaped = ESC, kept = KEPT) => championPreviewVerdicts({ kind: "desktop", at, step, escaped, kept });
const failed = (at: ChampionPreviewRead, step: typeof STEP | null = STEP, escaped = ESC) => run(at, step, escaped).filter((v) => v.status === "FAIL").map((v) => v.name);

describe("All Champions' preview facts", () => {
  it("pass on the demo's preview", () => {
    expect(run(DEMO).map((v) => v.status)).toEqual(Array(11).fill("PASS"));
    // A champion played in several positions: the row's games are all of them, the record its most played position's.
    expect(run({ ...DEMO, rowGames: 29, roleGames: 22, record: "22 games · 11W 11L", winRate: "50%", position: { chosen: true, icon: true, first: true, icons: 5 } }).map((v) => v.status)).toEqual(Array(11).fill("PASS"));
  });
  it("choose the first row with 3 or more games, or none", () => {
    expect(firstWithGames([{ games: 2, open: false }, { games: 3, open: false }])).toBe(1);
    expect(firstWithGames([{ games: 1, open: false }])).toBe(-1);
  });
  it("fail a record that disagrees with the position's icon or the row, or does not add up", () => {
    expect(failed({ ...DEMO, roleGames: 13 })).toHaveLength(1);
    expect(failed({ ...DEMO, rowGames: 13 })).toHaveLength(1);
    expect(failed({ ...DEMO, record: "14 games · 4W 9L" })).toHaveLength(1);
    expect(failed({ ...DEMO, record: "14 games" })).toHaveLength(2);
  });
  it("fail a preview on a position the row does not lead with, or none chosen", () => {
    expect(failed({ ...DEMO, position: { chosen: true, icon: true, first: false, icons: 2 } })).toHaveLength(1);
    expect(failed({ ...DEMO, position: { chosen: false, icon: true, first: true, icons: 1 } })).toHaveLength(1);
    expect(failed({ ...DEMO, role: "" })).toHaveLength(1);
  });
  it("fail opponents folded away, out of order, or a small sample unmarked", () => {
    const one = "desktop: the lane opponents shown are most games first, the small samples (1–2 games) marked, none folded away (every opponent through the pages: the workspace's facts)";
    expect(failed({ ...DEMO, folded: 1 })).toEqual([one]);
    expect(failed({ ...DEMO, opponents: [...DEMO.opponents!].reverse() })).toEqual([one]);
    expect(failed({ ...DEMO, opponents: DEMO.opponents!.map((o) => ({ ...o, small: false })) })).toEqual([one]);
    expect(failed({ ...DEMO, opponents: DEMO.opponents!.map((o, i) => (i === 0 ? { ...o, rate: false } : o)) })).toHaveLength(1);
  });
  it("fail a win rate that is not the wins over the games", () => {
    expect(failed({ ...DEMO, winRate: "40%" })).toEqual(["desktop: the preview shows the win rate, the wins over the games"]);
    expect(failed({ ...DEMO, winRate: "—" })).toHaveLength(1);
  });
  it("fail a missing identity, an opponent row without its games and more than one Champion Intel link", () => {
    expect(failed({ ...DEMO, portrait: false })).toHaveLength(1);
    expect(failed({ ...DEMO, opponents: [{ games: 7, says: false, rate: true, small: false }] })).toHaveLength(1);
    expect(failed({ ...DEMO, lookup: 2 })).toHaveLength(1);
    expect(failed({ ...DEMO, lookupChampion: false })).toHaveLength(1);
    // The link carries the position as Matchup Intel's lane (since 27 Nov 2026).
    expect(failed({ ...DEMO, lookupLane: false })).toHaveLength(1);
  });
  it("fail a preview that is not a pane beside the list: a window, past the screen's edge, or laid over the list or the row's name", () => {
    const where = "desktop: the preview opens in a pane beside the list (no window), within the screen, the list and the row's name clear of it";
    const at = (pane: Partial<NonNullable<ChampionPreviewRead["pane"]>>) => failed({ ...DEMO, pane: { ...DEMO.pane!, ...pane } });
    expect(at({ pane: false })).toEqual([where]);
    expect(at({ window: true })).toEqual([where]);
    expect(at({ within: false })).toEqual([where]);
    expect(at({ besideList: false })).toEqual([where]);
    expect(at({ nameClear: false })).toEqual([where]);
  });
  it("fail a pane that scrolls on its own, anything else scrolling inside the page, or a header off the screen (the 25 Nov 2026 review: one scrolling surface)", () => {
    const one = "desktop: the page is the one thing that scrolls: the pane has no scroll box of its own, nothing inside the page's main area scrolls, and the pane's header (the champion, ‹ › and Close) is on screen";
    const at = (scrolling: Partial<NonNullable<ChampionPreviewRead["scrolling"]>>) => failed({ ...DEMO, scrolling: { ...DEMO.scrolling!, ...scrolling } });
    expect(at({ scrollBox: true })).toEqual([one]);
    expect(at({ scrollers: 1 })).toEqual([one]);
    expect(at({ head: false })).toEqual([one]);
    // A sheet (no pane) is not asked.
    expect(run({ ...DEMO, pane: undefined, scrolling: null }).filter((v) => v.name === one)).toEqual([]);
  });
  it("fail ↓ pushing a history entry, and Escape leaving it open", () => {
    expect(failed(DEMO, { ...STEP, replaced: false })).toHaveLength(1);
    expect(failed(DEMO, STEP, { closed: false, address: true })).toHaveLength(1);
  });
  it("warn, not fail, when the data has no opponent or no second row", () => {
    const v = run({ ...DEMO, opponents: [], noOpponents: true, lookup: 0 }, null);
    expect(v.filter((x) => x.status === "FAIL")).toEqual([]);
    expect(v.filter((x) => x.status === "WARN")).toHaveLength(2);
  });
  it("fail, not warn, a preview whose answer could not be loaded", () => {
    expect(failed({ ...DEMO, opponents: [], lookup: 0, answered: false })).toEqual(["desktop: the opponents loaded"]);
    expect(failed({ ...DEMO, opponents: [], lookup: 0 })).toHaveLength(2);
  });
  it("choose a row with 3+ games below the first screen when there is one", () => {
    const rows = [{ games: 9, open: false, top: 300, screen: 900 }, { games: 2, open: false, top: 1000, screen: 900 }, { games: 4, open: false, top: 1100, screen: 900 }];
    expect(targetRow(rows)).toBe(2);
    expect(targetRow(rows.slice(0, 2))).toBe(0);
  });
  it("fail a jump of the browsing position, and pass a list that cannot scroll as not applicable", () => {
    const pos = (kept: typeof KEPT) => run(DEMO, STEP, ESC, kept).at(-1)!;
    expect(pos({ scrolled: 412, open: 0, closed: 412 }).status).toBe("FAIL");
    expect(pos({ scrolled: 412, open: -40, closed: 0 }).status).toBe("FAIL");
    expect(pos({ scrolled: 412, open: 2, closed: -2 }).status).toBe("PASS");
    expect(pos({ scrolled: 0, open: 0, closed: 0 }).detail).toMatchObject({ notApplicable: expect.any(String) });
  });
  it("choose a row on the list's second page when the list has pages (the workspace), else the flow's rule", () => {
    const paged = [{ games: 3, open: false, page: 2, pages: 4 }, { games: 2, open: false, page: 2, pages: 4 }];
    expect(targetRow(paged)).toBe(0);
    // A second page with no row of 3+ games: the first with 3+ games (the check then reads the first page).
    expect(targetRow([{ games: 2, open: false, page: 2, pages: 4 }])).toBe(-1);
    expect(targetRow([{ games: 5, open: false, page: 1, pages: 1 }])).toBe(0);
  });
  it("the browsing position in the workspace: the list on its page, every row's top kept; a list of one page is not applicable", () => {
    const pos = (kept: Parameters<typeof championPreviewVerdicts>[0]["kept"]) => championPreviewVerdicts({ kind: "desktop", at: DEMO, step: STEP, escaped: ESC, kept }).at(-1)!;
    expect(pos({ pages: 4, pageBefore: 2, pageOpen: 2, pageClosed: 2, open: 0, closed: 1 }).status).toBe("PASS");
    expect(pos({ pages: 4, pageBefore: 2, pageOpen: 2, pageClosed: 1, open: 0, closed: 0 }).status).toBe("FAIL");
    expect(pos({ pages: 4, pageBefore: 2, pageOpen: 2, pageClosed: 2, open: 3, closed: 0 }).status).toBe("FAIL");
    expect(pos({ pages: 1, pageBefore: 1, pageOpen: 1, pageClosed: 1, open: 0, closed: 0 }).detail).toMatchObject({ notApplicable: "the list is one page" });
  });
  it("read the workspace's merged games cell as its games: \"7 games · 4W 3L…\" passes as \"7 games\" does", () => {
    // (readChampionPreview reads it in the page; the verdict takes its `says`.)
    expect(failed({ ...DEMO, opponents: DEMO.opponents!.map((o) => ({ ...o, says: true })) })).toEqual([]);
  });
  it("fail a preview that never opened", () => {
    expect(failed({ open: false })).toHaveLength(1);
  });
});
