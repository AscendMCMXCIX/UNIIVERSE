import { describe, expect, it } from "vitest";
import { WORKSPACE_MARGIN, walkSummary, workspaceVerdicts, type WorkspacePage, type WorkspaceRead } from "../../../scripts/all-champions-workspace-facts.mjs";

/*
  The Production check's All Champions workspace facts (scripts/all-champions-workspace-facts.mjs; the
  owner's request of 27 Nov 2026): the reading below is the wide-champion demo at 1440 × 900 as the
  live check's own reader sees it (30 champions in pages of 9, Ambessa's 40 lane opponents in pages
  of 18, Darius's 9 games on one page). The facts pass on it, fail the regressions they exist for,
  and warn (never fail) on 0–11px of room or where a member's data has nothing to open.
*/

const READ: WorkspaceRead = {
  window: 900,
  height: 900,
  pad: 28,
  workspace: true,
  cards: [
    { card: "list", bottom: 872, margin: 65 },
    { card: "preview", bottom: 872, margin: 35 },
  ],
  scrollers: 0,
  regions: { list: { per: 9, page: 1, pages: 4, total: 30 }, opponents: { per: 18, page: 1, pages: 3, total: 40 } },
  scope: 30,
};

/** Pages of `total` rows at `per` a page, ids 0…, games as `games(i)`. */
function pages(total: number, per: number, games = (i: number) => Math.max(1, 9 - Math.floor(i / 4))): WorkspacePage[] {
  return Array.from({ length: Math.ceil(total / per) }, (_, p) => ({
    page: p + 1,
    pages: Math.ceil(total / per),
    per,
    total,
    rows: Array.from({ length: Math.min(per, total - p * per) }, (_, k) => {
      const i = p * per + k;
      return { id: `h${i}`, games: games(i), small: games(i) < 3 };
    }),
    dividers: [],
    slots: Math.min(per, total - p * per),
  }));
}

const LIST = { ...walkSummary(pages(30, 9)), total: 30, per: 9 };
const OPPONENTS = { ...walkSummary(pages(40, 18)), total: 40, count: 40 };
const GAMES = { ...walkSummary(pages(9, 18, () => 1)), record: 9 };
const STEPS = {
  opened: { heightBefore: 900, heightAfter: 900, beside: true, rowsKept: true },
  detail: { heightBefore: 900, heightAfter: 900, steps: true },
  escaped: { opponentsPageBefore: 1, opponentsPage: 1, laterPageBefore: 2, laterPage: 2, closed: true, listPageBefore: 1, listPage: 1 },
};
const run = (over: Partial<Parameters<typeof workspaceVerdicts>[0]> = {}) => workspaceVerdicts({ size: "1440 × 900", read: READ, list: LIST, opponents: OPPONENTS, games: GAMES, steps: STEPS, ...over });
const failed = (over: Partial<Parameters<typeof workspaceVerdicts>[0]> = {}) => run(over).filter((v) => v.status === "FAIL").map((v) => v.name.replace(/^1440 × 900: /, ""));

describe("All Champions' workspace facts", () => {
  it("pass on the wide-champion demo at 1440 × 900", () => {
    const v = run();
    expect(v.map((x) => x.status)).toEqual(Array(7).fill("PASS"));
    expect(v.every((x) => x.name.startsWith("1440 × 900: "))).toBe(true);
  });

  it("fail where the workspace did not apply, the page scrolls, a card ends past the page's padding or something in main scrolls", () => {
    const one = "All Champions is one workspace: the page does not scroll, its cards end above the page's padding, nothing in main scrolls";
    expect(run({ read: { ...READ, workspace: false } })).toEqual([{ name: `1440 × 900: ${one}`, status: "FAIL", detail: { workspace: false, why: "the workspace did not apply" } }]);
    expect(failed({ read: { ...READ, height: 912 } })).toEqual([one]);
    expect(failed({ read: { ...READ, cards: [{ card: "list", bottom: 873, margin: 65 }] } })).toEqual([one]);
    expect(failed({ read: { ...READ, scrollers: 1 } })).toEqual([one]);
  });

  it(`warn on 0–${WORKSPACE_MARGIN - 1}px between a list's last row and its footer, fail on an overlap`, () => {
    const room = (margin: number) => run({ read: { ...READ, cards: [{ card: "list", bottom: 872, margin }] } }).find((v) => v.name.includes("room to spare"))!.status;
    expect(room(WORKSPACE_MARGIN)).toBe("PASS");
    expect(room(11)).toBe("WARN");
    expect(room(0)).toBe("WARN");
    expect(room(-1)).toBe("FAIL");
  });

  it("fail a page walk that loses or repeats a record, disagrees with the scope line, or has the wrong number of pages", () => {
    const one = "every champion is reachable through the list's pages";
    const lost = pages(30, 9);
    lost[3]!.rows.pop();
    expect(failed({ list: { ...walkSummary(lost), total: 30, per: 9 } })).toEqual([one]);
    const repeated = pages(30, 9);
    repeated[1]!.rows[0] = { ...repeated[0]!.rows[0]! };
    expect(failed({ list: { ...walkSummary(repeated), total: 30, per: 9 } })).toEqual([one]);
    expect(failed({ read: { ...READ, scope: 31 } })).toEqual([one]);
    expect(failed({ list: { ...walkSummary(pages(30, 9).slice(0, 3)), total: 30, per: 9 } })).toEqual([one]);
  });

  it("fail opening a champion that changes the page's height, leaves the list's side or moves a row", () => {
    const one = "the first champion with 3+ games opens beside the list without changing the page's height";
    expect(failed({ steps: { ...STEPS, opened: { ...STEPS.opened, heightAfter: 940 } } })).toEqual([one]);
    expect(failed({ steps: { ...STEPS, opened: { ...STEPS.opened, beside: false } } })).toEqual([one]);
    expect(failed({ steps: { ...STEPS, opened: { ...STEPS.opened, rowsKept: false } } })).toEqual([one]);
  });

  it("fail opponents lost through the pages, out of order across pages, or a small sample unmarked", () => {
    const one = "every lane opponent is reachable through its pages, most games first across pages, the small samples marked";
    expect(failed({ opponents: { ...OPPONENTS, count: 41 } })).toEqual([one]);
    expect(failed({ opponents: { ...OPPONENTS, games: [...OPPONENTS.games].reverse() } })).toEqual([one]);
    expect(failed({ opponents: { ...OPPONENTS, small: OPPONENTS.small.map(() => false) } })).toEqual([one]);
  });

  it("fail an opponent's games that change the page's height or lose a game, or no ‹ › with two opponents or more", () => {
    const one = "its most-met opponent's games open in place without changing the page's height, every game reachable";
    expect(failed({ steps: { ...STEPS, detail: { ...STEPS.detail, heightAfter: 1200 } } })).toEqual([one]);
    expect(failed({ games: { ...GAMES, record: 10 } })).toEqual([one]);
    expect(failed({ steps: { ...STEPS, detail: { ...STEPS.detail, steps: false } } })).toEqual([one]);
  });

  it("fail Escape that loses the opponents' page or the list's, or leaves the preview open", () => {
    const one = "Escape returns to the opponents on the same page, Escape again closes, the list on the page it was on";
    expect(failed({ steps: { ...STEPS, escaped: { ...STEPS.escaped, opponentsPage: 2 } } })).toEqual([one]);
    expect(failed({ steps: { ...STEPS, escaped: { ...STEPS.escaped, closed: false } } })).toEqual([one]);
    expect(failed({ steps: { ...STEPS, escaped: { ...STEPS.escaped, listPage: 2 } } })).toEqual([one]);
  });

  it("fail an opponent opened from the second page whose Escape lands on the first (the page it was opened from is kept); one page of opponents passes", () => {
    const one = "Escape returns to the opponents on the same page, Escape again closes, the list on the page it was on";
    expect(failed({ steps: { ...STEPS, escaped: { ...STEPS.escaped, laterPage: 1 } } })).toEqual([one]);
    // The second page never reached (a Next that did not turn): not the page-2 case it claims to be.
    expect(failed({ steps: { ...STEPS, escaped: { ...STEPS.escaped, laterPageBefore: 1, laterPage: 1 } } })).toEqual([one]);
    expect(failed({ steps: { ...STEPS, escaped: { ...STEPS.escaped, laterPageBefore: null, laterPage: null } } })).toEqual([]);
  });

  it("warn, not fail, where the member's data has no champion with 3+ games or no lane opponent known", () => {
    const none = run({ steps: { opened: null } });
    expect(none.filter((v) => v.status === "FAIL")).toEqual([]);
    expect(none.filter((v) => v.status === "WARN").map((v) => v.name)).toEqual(["1440 × 900: skipped: no champion on the list has 3 or more games, so its preview was not opened"]);
    const alone = run({ opponents: { ...walkSummary([]), total: 0, count: 0 }, games: null });
    expect(alone.filter((v) => v.status === "FAIL")).toEqual([]);
    expect(alone.filter((v) => v.status === "WARN")).toHaveLength(1);
  });
});
