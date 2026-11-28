import { describe, expect, it } from "vitest";
import { listKeyTarget } from "./paged-list";
import { pageHeight, pageStarts, pagedListNext, startsPageOf, startsRange, startsSizes, type GroupBox, type LineBox, type PagedInputs, type PagedState } from "./row-budget";

/*
  A cumulative list's pages (usePagedRows' mode "cumulative"; useRowBreaks in fit-rows.tsx measures
  the lines, these are its pure parts): the lines cut once over the whole list by their own heights as
  a page draws them, so the pages hold still as the list is walked. Until 28 Nov 2026 the list took
  one count of lines measured on the page drawn, and a page drawing more group headings than the
  first measured fewer: the list moved to the page holding its first line at that count, and a walk
  drew lines twice (CI run 46125624658, Accounts: 16 lines, page 2 began with page 1's last two).

  The lists here are drawn as a model of the page's own layout (heading blocks, rows with a divider
  under each but a group's last, a gap between groups), so a page's height can be worked out both
  from the whole list's boxes (pageHeight, what the measure reads) and by drawing the page itself.
*/

interface ModelGroup {
  /** The heading block above the group's first row (its title and note, and the gap to the rows). */
  head: number;
  rows: number[];
  /** Under the rows, inside the group (a padding). */
  under?: number;
}

const DIVIDER = 1;

/** The whole list drawn at once, as the measure reads it: each line's box, its divider and group, and each group's box. */
function drawAll(model: readonly ModelGroup[], groupGap: number): { lines: LineBox[]; groups: GroupBox[] } {
  const lines: LineBox[] = [];
  const groups: GroupBox[] = [];
  let y = 0;
  model.forEach((g, gi) => {
    const top = y;
    y += g.head;
    g.rows.forEach((h, j) => {
      const divided = j < g.rows.length - 1;
      lines.push({ top: y, bottom: y + h + (divided ? DIVIDER : 0), divided, group: gi });
      y += h + (divided ? DIVIDER : 0);
    });
    y += g.under ?? 0;
    groups.push({ top, bottom: y });
    if (gi < model.length - 1) y += groupGap;
  });
  return { lines, groups };
}

/** A page of lines `from`..`to` drawn on its own: each group it holds with its heading (again where the page starts inside it). */
function drawPage(model: readonly ModelGroup[], groupGap: number, from: number, to: number): number {
  const flat = model.flatMap((g, gi) => g.rows.map((h) => ({ h, gi })));
  const onPage = flat.slice(from, to + 1);
  let height = 0;
  let i = 0;
  let first = true;
  while (i < onPage.length) {
    const gi = onPage[i]!.gi;
    const run = [];
    while (i < onPage.length && onPage[i]!.gi === gi) run.push(onPage[i++]!.h);
    if (!first) height += groupGap;
    first = false;
    height += model[gi]!.head + run.reduce((s, h, j) => s + h + (j < run.length - 1 ? DIVIDER : 0), 0) + (model[gi]!.under ?? 0);
  }
  return height;
}

/** Accounts at 1366 × 657 with CI's 16 lines: team members (6), Personal use empty, Accounts without a profile (a note), Profiles without an account, Kept automatically. */
const ACCOUNTS: ModelGroup[] = [
  { head: 24, rows: [52, 52, 52, 52, 52, 52] },
  { head: 24, rows: [20] },
  { head: 44, rows: [52, 52] },
  { head: 44, rows: [52, 52, 52, 52, 52, 52] },
  { head: 44, rows: [52] },
];
const GROUP_GAP = 12;

/** Every line once, in order: the pages' sizes add up, each page starts where the last ended. */
function expectEveryLineOnce(starts: readonly number[], total: number) {
  expect(starts[0]).toBe(0);
  for (let p = 1; p < starts.length; p++) expect(starts[p]!).toBeGreaterThan(starts[p - 1]!);
  expect(starts[starts.length - 1]!).toBeLessThan(Math.max(1, total));
  expect(startsSizes(starts, total).reduce((s, n) => s + n, 0)).toBe(total);
}

describe("pageHeight: a page as it is drawn, from the whole list's boxes", () => {
  it("is the page drawn on its own, for every page of every list: its headings (again where it starts inside a group), its lines, the divider its last line loses", () => {
    for (const under of [0, 6])
      for (const gap of [0, 12]) {
        const model = ACCOUNTS.map((g) => ({ ...g, under }));
        const { lines, groups } = drawAll(model, gap);
        for (let from = 0; from < lines.length; from++)
          for (let to = from; to < lines.length; to++) expect(pageHeight(lines, groups, from, to, DIVIDER), `lines ${from}–${to}, under ${under}, gap ${gap}`).toBeCloseTo(drawPage(model, gap, from, to), 6);
      }
  });

  it("a heading at a page's start: a page starting at a group's first line draws its heading once; one starting inside it draws the same heading again", () => {
    const { lines, groups } = drawAll(ACCOUNTS, GROUP_GAP);
    // Lines 9 and 10 (0-based) are the fourth group's first and second: the same heading above either.
    expect(pageHeight(lines, groups, 9, 9, DIVIDER)).toBe(44 + 52);
    expect(pageHeight(lines, groups, 10, 10, DIVIDER)).toBe(44 + 52);
    expect(pageHeight(lines, groups, 10, 11, DIVIDER)).toBe(44 + 52 + 1 + 52);
  });

  it("an empty group's line is a line of its group: its heading and the line, as tall as they are", () => {
    const { lines, groups } = drawAll(ACCOUNTS, GROUP_GAP);
    expect(pageHeight(lines, groups, 6, 6, DIVIDER)).toBe(24 + 20);
    // From the team's last member, across to the empty group and the next group's first line.
    expect(pageHeight(lines, groups, 5, 7, DIVIDER)).toBe(24 + 52 + GROUP_GAP + 24 + 20 + GROUP_GAP + 44 + 52);
  });

  it("a list without groups: its lines and the gaps between them", () => {
    const lines: LineBox[] = [
      { top: 0, bottom: 40, divided: false },
      { top: 48, bottom: 100, divided: false },
      { top: 108, bottom: 130, divided: false },
    ];
    expect(pageHeight(lines, [], 0, 2)).toBe(130);
    expect(pageHeight(lines, [], 1, 2)).toBe(82);
    expect(pageHeight(lines, [], 2, 2)).toBe(22);
  });
});

describe("pageStarts: the lines cut once over the whole list", () => {
  it("CI's Accounts (16 lines at the floor's room): every line on exactly one page, each page fitting and as full as it can be", () => {
    const { lines, groups } = drawAll(ACCOUNTS, GROUP_GAP);
    const room = 400;
    const starts = pageStarts({ lines, groups, room, lastLess: DIVIDER });
    expectEveryLineOnce(starts, lines.length);
    const sizes = startsSizes(starts, lines.length);
    starts.forEach((s, p) => {
      const end = s + sizes[p]! - 1;
      expect(drawPage(ACCOUNTS, GROUP_GAP, s, end), `page ${p + 1} fits`).toBeLessThanOrEqual(room);
      // As full as it can be: its next line would not fit.
      if (end + 1 < lines.length) expect(drawPage(ACCOUNTS, GROUP_GAP, s, end + 1), `page ${p + 1} full`).toBeGreaterThan(room);
    });
    // The pages are uneven (a page with more headings holds fewer lines), where one count of lines repeated or skipped some.
    expect(new Set(sizes).size).toBeGreaterThan(1);
  });

  it("a group spanning pages: the next page starts inside it and draws its heading again (counted), never a heading without a line", () => {
    const model: ModelGroup[] = [{ head: 30, rows: Array.from({ length: 10 }, () => 50) }];
    const { lines, groups } = drawAll(model, 0);
    // 30 + 50 + (1 + 50) × 3 = 233, less the last line's divider: 4 lines a page within 240px.
    const starts = pageStarts({ lines, groups, room: 240, lastLess: DIVIDER });
    expect(starts).toEqual([0, 4, 8]);
    expect(drawPage(model, 0, 4, 7)).toBeLessThanOrEqual(240);
    expectEveryLineOnce(starts, 10);
  });

  it("a room that holds one line, or none: a line a page (the frame grows by the deficit, nothing hidden)", () => {
    const { lines, groups } = drawAll(ACCOUNTS, GROUP_GAP);
    expect(pageStarts({ lines, groups, room: 100, lastLess: DIVIDER })).toEqual(Array.from({ length: 16 }, (_, i) => i));
    expect(pageStarts({ lines, groups, room: 10, lastLess: DIVIDER })).toEqual(Array.from({ length: 16 }, (_, i) => i));
    expect(pageStarts({ lines, groups, room: Number.NaN, lastLess: DIVIDER })).toHaveLength(16);
  });

  it("every list and every room: every line on exactly one page, each page fitting (or a single line), each as full as it can be", () => {
    // A small pseudo-random generator: the same lists every run.
    let seed = 7;
    const next = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let n = 0; n < 200; n++) {
      const model: ModelGroup[] = Array.from({ length: 1 + Math.floor(next() * 5) }, () => ({ head: Math.floor(next() * 60), rows: Array.from({ length: 1 + Math.floor(next() * 8) }, () => 18 + Math.floor(next() * 60)), under: Math.floor(next() * 3) * 4 }));
      const gap = Math.floor(next() * 3) * 8;
      const { lines, groups } = drawAll(model, gap);
      const room = 40 + Math.floor(next() * 500);
      const max = next() < 0.2 ? 1 + Math.floor(next() * 4) : Infinity;
      const starts = pageStarts({ lines, groups, room, lastLess: DIVIDER, max });
      expectEveryLineOnce(starts, lines.length);
      const sizes = startsSizes(starts, lines.length);
      starts.forEach((s, p) => {
        const end = s + sizes[p]! - 1;
        expect(sizes[p]!).toBeLessThanOrEqual(max);
        if (sizes[p]! > 1) expect(drawPage(model, gap, s, end)).toBeLessThanOrEqual(room + 0.01);
        if (end + 1 < lines.length && sizes[p]! < max) expect(drawPage(model, gap, s, end + 1)).toBeGreaterThan(room);
      });
    }
  });

  it("a resize cuts them again, for the new room only; the same room cuts the same pages", () => {
    const { lines, groups } = drawAll(ACCOUNTS, GROUP_GAP);
    const short = pageStarts({ lines, groups, room: 400, lastLess: DIVIDER });
    const tall = pageStarts({ lines, groups, room: 620, lastLess: DIVIDER });
    expect(tall.length).toBeLessThan(short.length);
    expect(pageStarts({ lines, groups, room: 400, lastLess: DIVIDER })).toEqual(short);
    expectEveryLineOnce(tall, 16);
  });

  it("a test's cap: at most `max` lines a page; an empty list is one empty page", () => {
    const { lines, groups } = drawAll(ACCOUNTS, GROUP_GAP);
    expect(startsSizes(pageStarts({ lines, groups, room: 5000, lastLess: DIVIDER, max: 3 }), 16)).toEqual([3, 3, 3, 3, 3, 1]);
    expect(pageStarts({ lines: [], room: 400 })).toEqual([0]);
    expect(startsSizes([0], 0)).toEqual([0]);
  });
});

describe("a cumulative list's pages: a line's page, a page's range, the keys", () => {
  const starts = [0, 7, 13];

  it("finds the page holding a line and the range each page holds", () => {
    expect([0, 6, 7, 12, 13, 15].map((i) => startsPageOf(starts, i))).toEqual([1, 1, 2, 2, 3, 3]);
    expect(startsRange(starts, 1, 16)).toEqual({ from: 1, to: 7 });
    expect(startsRange(starts, 2, 16)).toEqual({ from: 8, to: 13 });
    expect(startsRange(starts, 3, 16)).toEqual({ from: 14, to: 16 });
    // A page past the last is the last; an empty list is 0–0.
    expect(startsRange(starts, 9, 16)).toEqual({ from: 14, to: 16 });
    expect(startsRange([0], 1, 0)).toEqual({ from: 0, to: 0 });
    expect(startsSizes(starts, 16)).toEqual([7, 6, 3]);
  });

  it("PageDown goes to the next page's first line, PageUp to the previous page's last, by where the pages start", () => {
    const at = (index: number, page: number) => ({ index, page, pages: 3, perPage: 7, total: 16, starts });
    expect(listKeyTarget("PageDown", at(9, 2))).toBe(13);
    expect(listKeyTarget("PageUp", at(9, 2))).toBe(6);
    expect(listKeyTarget("PageUp", at(14, 3))).toBe(12);
    expect(listKeyTarget("PageDown", at(14, 3))).toBeNull();
    expect(listKeyTarget("PageUp", at(2, 1))).toBeNull();
  });
});

describe("pagedListNext with a cumulative list's layout", () => {
  const base: PagedInputs = { perPage: 7, total: 16, selected: null, selectedIndex: -1, search: "", order: null, data: null, layout: "0,7,13" };
  const state = (page: number, first: number, over: Partial<PagedInputs> = {}): PagedState => ({ ...base, ...over, page, first });
  const pageOfIn = (starts: number[]) => (i: number) => startsPageOf(starts, i);

  it("the same layout keeps the page (Next and Previous are the reader's: nothing moves the list under them)", () => {
    expect(pagedListNext(state(2, 7), base, pageOfIn([0, 7, 13]), 3)).toBe(2);
  });

  it("another layout (a resize, the sidebar): the page holding the first line shown, else the selected line's", () => {
    // Page 2 began at line 7; the pages cut again at a taller window start at 0 and 10: line 7 is on page 1.
    expect(pagedListNext(state(2, 7), { ...base, layout: "0,10" }, pageOfIn([0, 10]), 2)).toBe(1);
    // Page 3 began at line 13: on the new page 2.
    expect(pagedListNext(state(3, 13), { ...base, layout: "0,10" }, pageOfIn([0, 10]), 2)).toBe(2);
    // The selected line's page first.
    expect(pagedListNext(state(1, 0, { selected: "p", selectedIndex: 12 }), { ...base, layout: "0,10", selected: "p", selectedIndex: 12 }, pageOfIn([0, 10]), 2)).toBe(2);
  });

  it("a search still goes to page 1, and a uniform list (no layout) is as it was", () => {
    expect(pagedListNext(state(3, 13), { ...base, search: "a" }, pageOfIn([0, 7, 13]), 3)).toBe(1);
    const plain: PagedInputs = { perPage: 7, total: 30, selected: null, selectedIndex: -1, search: "", order: null, data: null };
    expect(pagedListNext({ ...plain, page: 3, first: 14 }, plain, (i) => Math.floor(i / 7) + 1, 5)).toBe(3);
    expect(pagedListNext({ ...plain, page: 3, first: 14 }, { ...plain, perPage: 5 }, (i) => Math.floor(i / 5) + 1, 6)).toBe(3);
  });
});
