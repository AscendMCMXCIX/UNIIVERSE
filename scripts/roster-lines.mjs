/*
  A Players roster row's lines, read from the page as a person reads them, for the live check's
  phone fact (scripts/live-check.mjs, playersFacts: every row of two lines at most 72px tall) and
  the browser tests (e2e/players-directory.spec.ts), so that both count one way. A row of two lines
  (the name's, then the role, rank and pool) is 64px; a tagline, a Riot state, a name on two lines or
  a status that wraps adds a line by design, so those rows are counted, not measured.

  A row's content is one wrapping line of parts (src/components/players/roster-row.tsx). The second
  line (roster-meta) and the status (roster-status) count by their own parts, which wrap. So does
  the name's column (roster-name-line, only with a tagline): from 24rem of row the name and the
  tagline share it, beside or under each other; on a narrower row (every phone held upright) the
  column steps aside (display: contents, a box of 0 × 0 that is never shown itself) and its tagline
  takes a line of its own under the second line. Parts whose centres are within 6px of each other
  are one line, and a name on more than one line adds its other lines.

  Until 17 Nov 2026 the live check kept its own copy of this count, which did not open the name's
  column: on a phone it never saw the name's line or the tagline of a row with a tagline, counted
  that row of three lines as one or two, and measured it (81.5px) against the 72px of two.

  It runs in the page, as Playwright's evaluateAll on the rows, so it is self-contained. Only
  heights and counts come back, never a name.
*/

/** Each roster row's height (px, to 0.1) and its lines (null for an element that is not a roster row). */
export function rosterRowLines(rows) {
  const box = (el) => el.getBoundingClientRect();
  const shown = (el) => !!el && box(el).width > 0 && box(el).height > 0 && getComputedStyle(el).display !== "none";
  const lines = (row) => {
    const meta = row.querySelector("[data-testid=roster-meta]");
    const name = row.querySelector("[data-testid=card-name]");
    if (!meta || !name) return null;
    const status = row.querySelector("[data-testid=roster-status]");
    const column = row.querySelector("[data-testid=roster-name-line]");
    const leaves = [...meta.parentElement.children].flatMap((c) => (c === meta || c === status || c === column ? [...c.children] : [c])).filter(shown);
    const centres = leaves.map((c) => box(c).top + box(c).height / 2).sort((a, b) => a - b);
    const nameLines = Math.round(box(name).height / parseFloat(getComputedStyle(name).lineHeight));
    return centres.filter((c, i) => i === 0 || c - centres[i - 1] > 6).length + nameLines - 1;
  };
  return rows.map((row) => ({ height: Math.round(box(row).height * 10) / 10, lines: lines(row) }));
}
