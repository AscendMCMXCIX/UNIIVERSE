/*
  ONE SCREEN in the Production check (scripts/live-check.mjs, oneScreenFacts; docs/LIVE_VALIDATION.md,
  "What it checks"): Release 16's promise that Leaderboards' four boards and a profile's Overview end
  within the window at 1440 × 900, 1920 × 950 (the owner's browser on a 1920 × 1080 screen) and 1920 ×
  1080, read in the page and judged apart from the browser
  so a unit test can hand it any state (src/server/ops/live-check-one-screen.test.ts).

  Read in the page only: positions in px, counts, true or false and the Show all's own words with
  their counts ("Show all 9 · 6 more"). No name, no address and no id leaves it.
*/

/** The sections each page promises on its first screen, in reading order: [test id, what the report calls it]. */
export const ONE_SCREEN_SECTIONS = {
  leaderboards: [
    ["form-board", "Recent form"],
    ["records-book", "Season records"],
    ["records-multikills", "Multikills"],
    ["records-milestones", "Milestones"],
  ],
  profile: [
    ["season-figures", "Season performance"],
    ["ranked-progress", "Ranked progress"],
    ["recent-form", "Recent form"],
    ["champion-pools", "Roles & champion pools"],
  ],
};

/** The boards that show an overview with the rest behind a Show all: [board, its rows, its Show all]. */
const OVERVIEWS = {
  leaderboards: [
    ["records-multikills", "multikill-row", "multikill-show-all"],
    ["records-milestones", "milestone-member", "milestones-show-all"],
  ],
  profile: [["primary-pool", "pool-item", "primary-pool-fold"]],
};

/** The page as it is drawn (self-contained, for evaluate): each section's box, and each overview's rows shown and in all. */
export function readOneScreen(input) {
  const { sections, overviews } = input;
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
  return { window: innerHeight, width: innerWidth, height: document.documentElement.scrollHeight, boxes, folds };
}

/** The input readOneScreen takes for a page. */
export const oneScreenInput = (page) => ({ sections: ONE_SCREEN_SECTIONS[page], overviews: OVERVIEWS[page] });

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
  return out;
}
