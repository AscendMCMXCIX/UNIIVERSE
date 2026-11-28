import { expect, test, type Page } from "./test";
import { expectEveryRecord, fits, measureWorkspace, pageSizes, regionSizes, type RegionPage } from "./workspace";

/*
  The one-screen checks themselves (e2e/workspace.ts), held to what they must catch and what they
  must let pass, on small pages drawn here (page.setContent: no server, inline styles), so a check
  that weakens fails here before a page's spec passes on broken code. The review of 28 Nov 2026
  found three gaps, each held below: a grid with a divider slot has more pages than ceil(total/per)
  (a correct page failed fits()); content spilling out of its card passed; a text's own lines cut by a
  fixed height or a line clamp passed. CI's run 46125624658 found a fourth: a cumulative list (rows of
  several heights in groups) whose pages are uneven, cut by their lines' own heights, which the checks
  read from its data-starts; until then they assumed pages of one size. Nothing here names a person.
*/

test.beforeEach(({ browserName }, info) => {
  void browserName;
  test.skip(info.project.name !== "desktop", "the desktop checks' own tests (desktop project only)");
});

/** A page of the shell's shape: #content, its padding, and `body` inside it. */
const draw = (page: Page, body: string) =>
  page.setContent(`<!doctype html><html><head><style>html,body{margin:0;font:16px/1.5 sans-serif}#content{padding:16px}</style></head><body><main id="content">${body}</main></body></html>`);

test.describe("a grid's pages with a divider slot (usePagedGrid's divider)", () => {
  test("are the pages its rows and its divider make, not ceil(total / per)", () => {
    // The review's pure case: 7 rows, a divider before row 4, 4 slots a page: 3, 3 and 1 rows.
    expect(pageSizes(7, 4, 3)).toEqual([3, 3, 1]);
    // The real page (All Champions' opponents in a win-rate order): 40 opponents, 10 a page, 5 pages, not 4.
    expect(pageSizes(40, 10, 9)).toHaveLength(5);
    expect(pageSizes(40, 10, null)).toHaveLength(4);
    // No divider, an empty list, a page of one slot (no divider drawn: slotPages').
    expect(pageSizes(30, 7)).toEqual([7, 7, 7, 7, 2]);
    expect(pageSizes(0, 7)).toEqual([0]);
    expect(pageSizes(3, 1, 1)).toEqual([1, 1, 1]);
  });

  test("fits() takes a correct divided grid's pages (data-divider), and still fails a region whose pages lose a row", async ({ page }) => {
    const region = (pages: number) => `<ul data-ws-region="opponents" data-per="10" data-page="1" data-pages="${pages}" data-total="40" data-divider="9" style="margin:0"><li>a row</li></ul>`;
    await draw(page, region(5));
    await fits(page, "a divided grid, 5 pages");
    await draw(page, region(4));
    await expect(fits(page, "a divided grid, 4 pages")).rejects.toThrow(/pages hold every row/);
  });

  test("expectEveryRecord() takes its walk (a page may end a slot early before the divider), and fails a lost or a doubled record", () => {
    const meta: RegionPage[] = [{ region: "grid", per: 4, page: 1, pages: 3, total: 7, divider: 3, starts: null, drawn: 3 }];
    expectEveryRecord({ pages: [["a", "b", "c"], ["d", "e", "f"], ["g"]], meta }, 7, "divided");
    expect(() => expectEveryRecord({ pages: [["a", "b", "c", "d"], ["e", "f", "g"]], meta }, 7, "divided")).toThrow();
    expect(() => expectEveryRecord({ pages: [["a", "b", "c"], ["d", "e", "e"], ["g"]], meta }, 7, "doubled")).toThrow(/every record once/);
    expect(() => expectEveryRecord({ pages: [["a", "b", "c"], ["d", "e", "f"]], meta }, 7, "lost")).toThrow(/every record/);
    // A list without a divider: pages of `per`, the last the rest.
    expectEveryRecord({ pages: [["a", "b"], ["c", "d"], ["e"]], meta: [{ region: "list", per: 2, page: 1, pages: 3, total: 5, divider: null, starts: null, drawn: 2 }] }, 5, "plain");
  });
});

test.describe("everything inside its card", () => {
  test("a line wider than its card is reported, as All Champions' own check reports it: an element's box, or a block's own text", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    const line = "A long cell that runs past its card ".repeat(2);
    // The review's probe: a 300px card holding a 600px line that does not wrap (an element as wide as its text).
    await draw(page, `<div data-ws-card style="width:300px;border:1px solid"><span style="display:inline-block;white-space:nowrap" data-testid="cell">${line}</span></div>`);
    let m = await measureWorkspace(page);
    expect(m.outside).toEqual(["div.: span[cell]."]);
    expect(m.clipped).toEqual([]);
    expect(m.offscreen).toEqual([]);
    await expect(fits(page, "a spilling card")).rejects.toThrow(/everything inside its card/);
    // A block's text that does not wrap: the block keeps the card's width, its text runs past it.
    await draw(page, `<div data-ws-card style="width:300px;border:1px solid"><p style="white-space:nowrap;margin:0" data-testid="label">${line}</p></div>`);
    m = await measureWorkspace(page);
    expect(m.outside).toEqual(["div.: p[label]."]);
  });

  test("a card whose content stays inside passes; read-out-only text and a fixed layer (a window, a popover) are not its box's", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    const srOnly = "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap";
    await draw(page, `<div data-ws-card style="width:300px;border:1px solid;position:relative"><p style="margin:0">A cell that wraps inside its card as it should</p><span style="${srOnly}">${"read out only ".repeat(10)}</span><div style="position:fixed;left:600px;top:20px;width:200px"><p style="margin:0">a layer above the page</p></div></div>`);
    const m = await measureWorkspace(page);
    expect(m.outside).toEqual([]);
    await fits(page, "a tidy card");
  });
});

test.describe("a text's own lines cut", () => {
  test("by a fixed height or a line clamp is reported; one that fits its box, a truncation and an aria-hidden decoration are not clipped's", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await draw(
      page,
      [
        `<p data-testid="fixed" style="height:20px;overflow:hidden;width:200px;margin:0">A description long enough to take two lines in its box</p>`,
        `<span data-testid="clamp" style="display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;width:200px">A note long enough to take three lines or more when it wraps in a box this narrow</span>`,
        `<p data-testid="room" style="height:48px;overflow:hidden;width:400px;margin:0">One line with room</p>`,
        `<div aria-hidden="true" style="height:10px;overflow:hidden;width:100px">a decoration's text</div>`,
      ].join(""),
    );
    const m = await measureWorkspace(page);
    expect(m.clipped.map((c) => c.split(" ")[0])).toEqual(["p[fixed].", "span[clamp]."]);
  });

  test("a truncation that cuts its text is reported anywhere in #content, not only in a row", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await draw(page, `<p class="truncate" data-testid="cut" style="width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0">A name too long for its place</p><p class="truncate" data-testid="whole" style="width:400px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0">A name</p>`);
    const m = await measureWorkspace(page);
    expect(m.cut).toEqual(["p[cut].truncate"]);
    await expect(fits(page, "a cut name")).rejects.toThrow(/every truncated text whole/);
  });
});

test.describe("a cumulative list's uneven pages (usePagedRows' mode \"cumulative\": data-starts)", () => {
  /** A walk's figures for a cumulative list of 16 lines whose pages start at lines 1, 8 and 14. */
  const meta = (pages: number[] = [1, 2, 3], starts: number[] = [0, 7, 13]): RegionPage[] => pages.map((page) => ({ region: "list", per: 7, page, pages: starts.length, total: 16, divider: null, starts, drawn: 0 }));
  const keys = Array.from({ length: 16 }, (_, i) => `k${i}`);

  test("are the pages its starts say, not ceil(total / per)", () => {
    expect(regionSizes({ total: 16, per: 7, divider: null, starts: [0, 7, 13] })).toEqual([7, 6, 3]);
    expect(regionSizes({ total: 16, per: 7, divider: null, starts: null })).toEqual([7, 7, 2]);
  });

  test("expectEveryRecord() takes a walk of uneven pages, and fails a repeated line (CI's case), a page of the wrong size and pages cut again mid-walk", () => {
    expectEveryRecord({ pages: [keys.slice(0, 7), keys.slice(7, 13), keys.slice(13)], meta: meta() }, 16, "uneven");
    // CI's walk: page 2 drew page 1's last two lines again (the list re-cut at another count, run 46125624658).
    expect(() => expectEveryRecord({ pages: [keys.slice(0, 7), keys.slice(5, 10), keys.slice(10, 15), keys.slice(15)], meta: meta([1, 2, 3, 4]) }, 16, "repeated")).toThrow(/every record/);
    // Every line once, but the pages are not the ones the region says.
    expect(() => expectEveryRecord({ pages: [keys.slice(0, 6), keys.slice(6, 13), keys.slice(13)], meta: meta() }, 16, "sizes")).toThrow(/page 1 holds 7 rows/);
    // Every line once and the sizes right for the first page's figures, but the pages were cut again as the list was walked.
    const recut = [...meta([1, 2]), { ...meta([3], [0, 7, 12])[0]! }];
    expect(() => expectEveryRecord({ pages: [keys.slice(0, 7), keys.slice(7, 13), keys.slice(13)], meta: recut }, 16, "re-cut")).toThrow(/pages are the ones the walk began with/);
  });

  test("fits() takes a correct uneven region, and fails one whose pages disagree with its starts or whose page draws another page's rows", async ({ page }) => {
    const region = (o: { pages?: number; starts?: string; drawn?: number }) =>
      `<ul data-ws-region="list" data-per="7" data-page="2" data-pages="${o.pages ?? 3}" data-total="16" data-starts="${o.starts ?? "0,7,13"}" style="margin:0">${Array.from({ length: o.drawn ?? 6 }, () => "<li data-ws-row>a line</li>").join("")}</ul>`;
    await draw(page, region({}));
    await fits(page, "an uneven list, page 2 of 3");
    await draw(page, region({ pages: 4 }));
    await expect(fits(page, "pages that disagree")).rejects.toThrow(/pages hold every row/);
    await draw(page, region({ drawn: 5 }));
    await expect(fits(page, "a page short of its rows")).rejects.toThrow(/draws its own rows/);
    await draw(page, region({ starts: "0,7,7" }));
    await expect(fits(page, "pages out of order")).rejects.toThrow(/pages in order/);
  });
});
