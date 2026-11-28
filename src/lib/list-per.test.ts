import { describe, expect, it } from "vitest";
import { cumulativeRows, type DrawnRow } from "@/components/ui/row-budget";
import { LIST_PER_COOKIES, LIST_PER_MAX, budgetPageOf, listPerCookie, pageHolding, readListPer } from "./list-per";

describe("a server-paged list's kept page size (the one-screen workspace's last row budget)", () => {
  it("reads a whole number from 1 to 25, and nothing else", () => {
    expect(readListPer("4")).toBe(4);
    expect(readListPer("1")).toBe(1);
    expect(readListPer(String(LIST_PER_MAX))).toBe(LIST_PER_MAX);
    for (const v of [undefined, null, "", "0", "26", "-3", "4.5", "4px", "100", " 4"]) expect(readListPer(v), String(v)).toBeNull();
  });

  it("writes a cookie of the list's own, clamped, for the whole site, a year, sent to the site only", () => {
    expect(listPerCookie("games", 4)).toBe(`${LIST_PER_COOKIES.games}=4; path=/; max-age=31536000; samesite=lax`);
    expect(listPerCookie("together", 40)).toContain(`${LIST_PER_COOKIES.together}=25;`);
    expect(listPerCookie("encounters", 0)).toContain(`${LIST_PER_COOKIES.encounters}=1;`);
    // One cookie per list: each list's room differs.
    expect(new Set(Object.values(LIST_PER_COOKIES)).size).toBe(Object.keys(LIST_PER_COOKIES).length);
  });
});

describe("a link to a row opens on its page (pageHolding)", () => {
  const ids = Array.from({ length: 12 }, (_, i) => `g${i + 1}`);

  it("is the page of `per` rows holding the row: the 7th game at 3 a page is on page 3, the 12th at 2 on page 6", () => {
    expect(pageHolding(ids, "g7", 3)).toBe(3);
    expect(pageHolding(ids, "g12", 2)).toBe(6);
    expect(pageHolding(ids, "g1", 5)).toBe(1);
    expect(pageHolding(ids, "g6", 6)).toBe(1);
  });

  it("keeps a page asked for that holds the row, and replaces one that does not", () => {
    expect(pageHolding(ids, "g7", 3, 3)).toBe(3);
    expect(pageHolding(ids, "g7", 3, 1)).toBe(3);
    // A game listed once per side (Team Matches): the page a step across a page's end asked for holds its second place.
    const twice = ["a", "b", "c", "c", "d"];
    expect(pageHolding(twice, "c", 3, 2)).toBe(2);
    expect(pageHolding(twice, "c", 3)).toBe(1);
  });

  it("is null for no row, a row not listed, or no page size", () => {
    expect(pageHolding(ids, null, 3)).toBeNull();
    expect(pageHolding(ids, "", 3)).toBeNull();
    expect(pageHolding(ids, "elsewhere", 3, 2)).toBeNull();
    expect(pageHolding(ids, "g3", 0)).toBeNull();
  });
});

describe("the page a new page size shows (budgetPageOf)", () => {
  const shown = { offset: 6, ids: ["g7", "g8", "g9", "g10", "g11", "g12"] };

  it("holds the row open: a link copied at 6 a page (page 2, the 12th game open) read at 2 a page is page 6, not page 4", () => {
    expect(budgetPageOf(shown, "g12", 2)).toBe(6);
    expect(budgetPageOf(shown, "g7", 4)).toBe(2);
  });

  it("holds the page's first row where no row is open", () => {
    expect(budgetPageOf(shown, null, 2)).toBe(4);
    expect(budgetPageOf({ offset: 0, ids: shown.ids }, null, 4)).toBe(1);
  });

  it("is null while the row open is not on the page shown: the server finds its page", () => {
    expect(budgetPageOf(shown, "g2", 2)).toBeNull();
  });
});

/*
  Turning the pages of a server-paged list whose pages differ in height (Match History's sessions, a header before each;
  Team Matches' cards, as tall as their members): the client counts the cards on the page it draws (useRowBudget's
  cumulative mode) and, where that differs from the server's `per`, writes the new count with the page budgetPageOf gives
  (Match History, Team Matches and Encounters alike). The promise: turning pages never skips a record. A record may show
  twice, across the edge where the count changed: the page after the change starts at the page, at the new count, holding
  the first card of the page drawn when it changed, so its first cards may be the last ones the page before showed.
*/
describe("a walk across a server-paged list whose pages differ in height never skips a record (budgetPageOf)", () => {
  /** A page the walk settles on: its first row, its size, and the first row of the page drawn where the count changed on the way (null: Next alone). */
  interface Settled {
    offset: number;
    per: number;
    changedFrom: number | null;
    counts: number[];
  }

  /**
   * The walk by Next from page 1 at `first` rows a page: each page drawn (`offset`, `per`) is counted (`count`), and a
   * count that differs is written with budgetPageOf's page, the page drawn again at it; a page whose count stands is
   * settled, and Next goes on.
   */
  function walk(total: number, first: number, count: (offset: number, per: number) => number): Settled[] {
    const ids = Array.from({ length: total }, (_, i) => `r${i}`);
    const out: Settled[] = [];
    let per = first;
    let page = 1;
    let changedFrom: number | null = null;
    let counts: number[] = [];
    for (let step = 0; step < 20_000; step++) {
      const offset = (page - 1) * per;
      const c = count(offset, per);
      if (c !== per) {
        changedFrom ??= offset;
        counts.push(c);
        page = budgetPageOf({ offset, ids: ids.slice(offset, offset + per) }, null, c)!;
        per = c;
        continue;
      }
      out.push({ offset, per, changedFrom, counts });
      changedFrom = null;
      counts = [];
      if (offset + per >= total) return out;
      page += 1;
    }
    throw new Error("the walk did not reach the last page");
  }

  /**
   * Its promises, on any walk: every record on a settled page; no page starting past what the walk has shown (no record
   * skipped); a page reached by Next alone following on from the one before exactly; a page reached through a change of
   * count starting where budgetPageOf's rule puts it (the page holding the first card of the page drawn, at each new count
   * in turn), so the records it repeats are the ones from its start to that first card, and, for one change, fewer than
   * its own size.
   */
  function expectTheRule(w: Settled[], total: number) {
    let seen = 0;
    const shown = new Set<number>();
    for (const [i, p] of w.entries()) {
      expect(p.offset, `page ${i + 1} starts within what the walk has shown`).toBeLessThanOrEqual(seen);
      if (i > 0 && p.changedFrom === null) expect(p.offset, `page ${i + 1} follows on from page ${i}`).toBe(w[i - 1]!.offset + w[i - 1]!.per);
      if (p.changedFrom !== null) {
        const at = p.counts.reduce((s, c) => Math.floor(s / c) * c, p.changedFrom);
        expect(p.offset, `page ${i + 1}: the page holding the first card drawn, at each new count`).toBe(at);
        // The records it repeats of the page before: from its start to the first card of the page drawn (one change: fewer than its size).
        if (p.counts.length === 1) expect(p.changedFrom - p.offset, `page ${i + 1} repeats fewer than its own size`).toBeLessThan(p.per);
      }
      for (let r = p.offset; r < Math.min(total, p.offset + p.per); r++) shown.add(r);
      seen = Math.max(seen, p.offset + p.per);
    }
    expect(shown.size, "every record shown").toBe(total);
  }

  /** A seeded generator: the same lists every run. */
  const seeded = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

  /**
   * A list's cards as a page draws them: each card's box below the first card's top, a heading before a card that starts a
   * group and before the page's first card (a page that starts inside a session draws its heading again), so the room
   * below the list's top is less that heading.
   */
  function drawn(list: { heights: number[]; starts: boolean[] }, offset: number, per: number, o: { heading: number; gap: number; room: number }) {
    const rows: DrawnRow[] = [];
    let y = 0;
    for (let i = offset; i < Math.min(list.heights.length, offset + per); i++) {
      if (i > offset && list.starts[i]) y += o.heading;
      rows.push({ bottom: y + list.heights[i]!, height: list.heights[i]!, divided: false });
      y += list.heights[i]! + o.gap;
    }
    return { rows, room: o.room - o.heading };
  }

  /**
   * The client's count as Match History and Team Matches take it: measured on the first paint, then again only where a
   * page drawn overflows (its frame grows: useRowBudget's observer), so it only shrinks while the window keeps its size.
   */
  const measured = (list: { heights: number[]; starts: boolean[] }, o: { heading: number; gap: number; room: number }) => {
    let painted = false;
    return (offset: number, per: number) => {
      const { rows, room } = drawn(list, offset, per, o);
      const over = rows.length > 0 && rows[rows.length - 1]!.bottom > room + 0.01;
      if (painted && !over) return per;
      painted = true;
      return cumulativeRows({ room, rows, gap: o.gap });
    };
  };

  it("on lists like the demo's: sessions with their headers (cards of 100 and 120px), Team Matches' cards of 110 to 250px, at rooms from the floor's to 1920 × 1080's", () => {
    const next = seeded(11);
    let changed = 0;
    for (let n = 0; n < 300; n++) {
      const total = 1 + Math.floor(next() * 60);
      const sessions = n % 2 === 0;
      const heights = Array.from({ length: total }, () => (sessions ? (next() < 0.7 ? 100 : 120) : 110 + Math.floor(next() * 141)));
      const starts = Array.from({ length: total }, (_, i) => sessions && (i === 0 || next() < 0.35));
      const o = { heading: sessions ? 28 : 0, gap: sessions ? 8 : 12, room: 280 + Math.floor(next() * 520) };
      const w = walk(total, sessions ? 10 : 20, measured({ heights, starts }, o));
      expectTheRule(w, total);
      // The count only shrinks along the walk while the window keeps its size (lane C's rule): never back up.
      for (let i = 1; i < w.length; i++) expect(w[i]!.per).toBeLessThanOrEqual(w[i - 1]!.per);
      changed += w.filter((p, i) => i > 0 && p.changedFrom !== null).length;
    }
    // The walks do change their count on the way (so the repeats above were exercised).
    expect(changed).toBeGreaterThan(20);
  });

  it("whatever the count does on the way (it grows, shrinks, changes twice before a page settles): no record skipped", () => {
    const next = seeded(29);
    for (let n = 0; n < 300; n++) {
      const total = 1 + Math.floor(next() * 80);
      const w = walk(total, 1 + Math.floor(next() * 10), (_, per) => (next() < 0.3 ? 1 + Math.floor(next() * 12) : per));
      expectTheRule(w, total);
    }
  });

  it("the demo's walk at 1648 × 900 (sessions): 4 cards on page 1, then 3, so page 2 starts at the 4th game, shown on page 1 too", () => {
    // Page 2 drawn at 4 a page (games 5–8) counts 3: the page holding its first card at 3 a page is page 2 (games 4–6).
    expect(budgetPageOf({ offset: 4, ids: ["r4", "r5", "r6", "r7"] }, null, 3)).toBe(2);
    const w = walk(36, 4, (offset, per) => (offset === 4 && per === 4 ? 3 : per));
    expectTheRule(w, 36);
    expect(w.slice(0, 3).map((p) => [p.offset + 1, p.offset + p.per])).toEqual([
      [1, 4],
      [4, 6],
      [7, 9],
    ]);
  });
});
