/*
  ONE SCREEN in the Production check (scripts/live-check.mjs, oneScreenFacts; docs/LIVE_VALIDATION.md,
  "What it checks"): Release 16's promise that Leaderboards' four boards and a profile's Overview end
  within the window at 1440 × 900, 1920 × 950 (the owner's browser on a 1920 × 1080 screen) and 1920 ×
  1080, read in the page and judged apart from the browser
  so a unit test can hand it any state (src/server/ops/live-check-one-screen.test.ts).

  Leaderboards' names whole as well (the review's M4, with the team's real names): no word drawn
  across two lines. Since 25 Nov 2026 nothing on Leaderboards folds: the multikills' rows and the
  milestones' cells are all shown, with no Show all (the profile's pool keeps its fold).

  Since the review of 25 Nov 2026 the boards of a grid row leave no blank band: the shorter board's
  rows share its spare room, each up to 3.5rem (board-fill.ts), the rest under its last line, and the
  multikills' legend stays right under their last row.

  Read in the page only: positions in px, counts, true or false and the Show all's own words with
  their counts ("Show all 9 · 6 more"). No name, no address and no id leaves it: a broken word is
  counted, never quoted.
*/

/** The sections each page promises on its first screen, in reading order: [test id, what the report calls it]. */
export const ONE_SCREEN_SECTIONS = {
  leaderboards: [
    ["form-board", "Recent form"],
    ["records-multikills", "Multikills"],
    ["records-book", "Season records"],
    ["records-milestones", "Milestones"],
  ],
  profile: [
    ["season-figures", "Season performance"],
    ["ranked-progress", "Ranked progress"],
    ["recent-form", "Recent form"],
    ["champion-pools", "Roles & champion pools"],
  ],
};

/**
 * The boards whose rows are checked as all shown, or shown in part behind a Show all that says so: [board, its rows, its
 * Show all]. Leaderboards' boards fold nothing (25 Nov 2026): every row shown and no Show all is what passes there.
 */
const OVERVIEWS = {
  leaderboards: [
    ["records-multikills", "multikill-row", "multikill-show-all"],
    ["records-milestones", "milestone", "milestones-show-all"],
  ],
  profile: [["primary-pool", "pool-item", "primary-pool-fold"]],
};

/**
 * The boards whose rows share their spare room when they are the shorter of their grid row (25 Nov 2026,
 * the review: one blank band of up to 95px under the multikills at 1920 × 1080): [board, its rows, its
 * foot (a line right under the last row) or null]. Each row grows up to FILL_ROW_MAX_REM
 * (src/components/leaderboards/board-fill.ts); what is left beyond that goes under the last line.
 */
const FILLS = {
  leaderboards: [
    ["form-board", "[data-testid=form-row]", null],
    ["records-multikills", "[data-testid=multikill-row]", "[data-testid=multikill-score-legend]"],
    ["records-book", "[data-testid=season-records] > li", null],
    ["records-milestones", "[data-testid=milestone]", null],
  ],
  profile: null,
};
/** A row's most height when it grows into its board's spare room, in rem (board-fill.ts, FILL_ROW_MAX_REM). */
export const FILL_ROW_MAX_REM = 3.5;
/** The most room a board may leave under its last line while its rows could still grow, in px. */
export const FILL_SPARE_MAX = 24;

/** Where the names are read whole (the words of every text drawn in it): leaderboards only (its most-of-each tiles, held to one line, went on 25 Nov 2026). */
const WHOLE = {
  leaderboards: { root: "leaderboards", tiles: null },
  profile: null,
};

/** The page as it is drawn (self-contained, for evaluate): each section's box, and each overview's rows shown and in all. */
export function readOneScreen(input) {
  const { sections, overviews, whole, fills } = input;
  const shown = (el) => !!el && el.getBoundingClientRect().height > 0 && getComputedStyle(el).visibility !== "hidden";
  const boxes = sections.map(([id]) => {
    const el = document.querySelector(`[data-testid=${id}]`);
    if (!el) return { id, present: false };
    const b = el.getBoundingClientRect();
    return { id, present: true, top: Math.round(b.top + scrollY), bottom: Math.round(b.bottom + scrollY) };
  });
  const folds = overviews.map(([board, row, button]) => {
    const el = document.querySelector(`[data-testid=${board}]`);
    if (!el) return { board, present: false };
    const rows = [...el.querySelectorAll(`[data-testid=${row}]`)];
    const toggle = document.querySelector(`[data-testid=${button}]`);
    return { board, present: true, total: rows.length, shown: rows.filter(shown).length, button: shown(toggle), words: shown(toggle) ? (toggle.innerText ?? "").replace(/\s+/g, " ").trim() : null };
  });
  let words = null;
  const root = whole && document.querySelector(`[data-testid=${whole.root}]`);
  if (root) {
    // Each word of every text node, by the lines its boxes take (truncated text takes one).
    let broken = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      for (const m of (n.textContent ?? "").matchAll(/\S+/g)) {
        range.setStart(n, m.index);
        range.setEnd(n, m.index + m[0].length);
        if (new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size > 1) broken++;
      }
    }
    const tiles = whole.tiles ? [...document.querySelectorAll(whole.tiles)].filter(shown) : [];
    const oneLine = tiles.filter((t) => Math.round(t.getBoundingClientRect().height / parseFloat(getComputedStyle(t).lineHeight)) <= 1 && t.getAttribute("title") === t.textContent).length;
    words = { broken, tiles: tiles.length, oneLine };
  }
  // Each board's room under its last line (its foot's, where it has one), the gap between its last row and its foot, and whether
  // its rows have grown as far as they may: their list at its cap (FILL_ROW_MAX_REM a row on average, the hairlines between them
  // included) or held taller by its content. Positions in px and counts only.
  const round = (n) => Math.round(n * 10) / 10;
  const spare = (fills ?? []).map(([board, row, foot]) => {
    const el = document.querySelector(`[data-testid=${board}]`);
    if (!el) return { board, present: false };
    const items = [...el.querySelectorAll(row)].filter(shown);
    if (!items.length) return { board, present: true, rows: 0 };
    const rows = items.map((r) => r.getBoundingClientRect());
    const last = Math.max(...rows.map((r) => r.bottom));
    const f = foot ? el.querySelector(foot) : null;
    const end = el.getBoundingClientRect().bottom - (parseFloat(getComputedStyle(el).borderBottomWidth) || 0);
    const list = items[0].parentElement;
    const cap = list ? parseFloat(getComputedStyle(list).maxHeight) : NaN;
    return { board, present: true, rows: rows.length, spare: round(end - (f ? f.getBoundingClientRect().bottom : last)), footGap: f ? round(f.getBoundingClientRect().top - last) : null, grown: !!list && Number.isFinite(cap) && list.getBoundingClientRect().height >= cap - 1 };
  });
  return { window: innerHeight, width: innerWidth, height: document.documentElement.scrollHeight, boxes, folds, words, ...(fills ? { spare } : {}) };
}

/** The input readOneScreen takes for a page. */
export const oneScreenInput = (page) => ({ sections: ONE_SCREEN_SECTIONS[page], overviews: OVERVIEWS[page], whole: WHOLE[page], fills: FILLS[page] });

/** The numbers a Show all's words carry ("Show all 9 · 6 more", "Show all 26"): [all, more], either null where it says none. */
export function showAllCounts(words) {
  const all = /Show all (\d+)/.exec(words ?? "");
  const more = /(\d+) more/.exec(words ?? "");
  return [all ? Number(all[1]) : null, more ? Number(more[1]) : null];
}

/**
 * What the check asserts about a page read by readOneScreen at one window size: every section it
 * draws ends within the window (the essential ones must be drawn), and every overview that shows
 * fewer rows than it has says so in its Show all, with the true numbers; one that shows all has none.
 * Each verdict: its name, PASS, FAIL or WARN, and what was found (positions and counts only).
 */
export function oneScreenVerdicts({ page, size, read }) {
  const out = [];
  const fact = (name, ok, detail) => out.push({ name: `${size}: ${name}`, status: ok ? "PASS" : "FAIL", detail });
  const names = Object.fromEntries(ONE_SCREEN_SECTIONS[page].map(([id, name]) => [id, name]));
  const drawn = read.boxes.filter((b) => b.present);
  // The profile draws Recent form from five games and Ranked progress with a linked account: the season's card and the pools always.
  const essential = page === "leaderboards" ? ONE_SCREEN_SECTIONS.leaderboards.map(([id]) => id) : ["season-figures", "champion-pools"];
  const missing = essential.filter((id) => !drawn.some((b) => b.id === id));
  const below = drawn.filter((b) => b.bottom > read.window);
  fact(
    page === "leaderboards" ? "Leaderboards' four boards end within the window" : "the Overview's sections end within the window",
    missing.length === 0 && below.length === 0,
    { window: read.window, page: read.height, sections: drawn.length, missing: missing.map((id) => names[id]), below: below.map((b) => `${names[b.id]} ${b.bottom}px`), bottoms: Object.fromEntries(drawn.map((b) => [names[b.id], b.bottom])) },
  );
  for (const f of read.folds) {
    if (!f.present) continue;
    const label = page === "leaderboards" ? names[f.board] : "the primary pool";
    const [all, more] = showAllCounts(f.words);
    // The pool's Show all says the pool's size; the boards' say how many more as well.
    const says = f.button && all === f.total && (page === "profile" || more === f.total - f.shown);
    const ok = f.shown === f.total ? !f.button : says;
    fact(`${label}: ${f.shown === f.total ? "every row shown, no Show all" : "the rows not shown are behind a Show all that says how many"}`, ok, { rows: f.total, shown: f.shown, button: f.button, says: f.words ? [all, more] : null });
  }
  if (read.words) {
    const w = read.words;
    fact("names whole: no word broken across two lines", w.broken === 0 && w.oneLine === w.tiles, { broken: w.broken, tiles: w.tiles, oneLine: w.oneLine });
  }
  if (read.spare) {
    // A board with rows (an empty one says so in a line): its last line within 24px of its end, unless its rows have grown as far as
    // they may (then the rest is under the last line, by design); a foot right under the last row (its hairline between them).
    const boards = read.spare.filter((b) => b.present && b.rows > 0);
    const banded = boards.filter((b) => b.spare > FILL_SPARE_MAX && !b.grown);
    const footApart = boards.filter((b) => b.footGap !== null && b.footGap !== undefined && (b.footGap > 4 || b.footGap < -1));
    fact(
      "no blank band in a board: the shorter board's rows share its spare room (its last line within 24px of its end, or its rows grown to 3.5rem on average), the multikills' legend right under their last row",
      banded.length === 0 && footApart.length === 0,
      { boards: boards.length, banded: banded.map((b) => `${names[b.board]} ${b.spare}px`), footApart: footApart.map((b) => `${names[b.board]} ${b.footGap}px`), spare: Object.fromEntries(boards.map((b) => [names[b.board], b.spare])) },
    );
  }
  return out;
}
