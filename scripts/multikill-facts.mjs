/*
  LEADERBOARDS' MULTIKILL BOARD in the Production check (scripts/live-check.mjs, multikillFacts;
  docs/LIVE_VALIDATION.md, "What it checks"; docs/TEAM_LEADERBOARDS.md, "The multikill score"): the
  board read in the page and what the check asserts about it, apart from the browser so a unit test
  can hand it any state (src/server/ops/live-check-multikills.test.ts).

  Read in the page only: counts, scores, places, true or false and the board's fixed words (the
  basis line, "21 doubles"). No member's name, no address and no id leaves it.
*/

/** The board as the page shows it (self-contained, for evaluate). */
export function readMultikillBoard() {
  const board = document.querySelector("[data-testid=records-multikills]");
  if (!board) return { present: false };
  const num = (v) => (v === null || v === undefined ? null : Number(v));
  const rows = [...board.querySelectorAll("[data-testid=multikill-row]")].map((r) => ({
    status: r.getAttribute("data-status"),
    place: num(r.getAttribute("data-place")),
    score: num(r.getAttribute("data-score")),
    shown: r.querySelector("[data-testid=multikill-score]")?.firstChild?.textContent?.trim() ?? null,
    counts: ["data-penta", "data-quadra", "data-triple", "data-double"].map((k) => Number(r.getAttribute(k) ?? "0")),
    kinds: [...r.querySelectorAll("[data-testid=multikill-kinds] [data-kind]")].map((k) => k.textContent?.trim() ?? ""),
    crown: !!r.querySelector("[aria-label='First place']"),
    height: Math.round(r.getBoundingClientRect().height),
  }));
  const tiles = [...board.querySelectorAll("[data-testid=multikill-most-kind]")].map((t) => ({ kind: t.getAttribute("data-kind"), count: num(t.getAttribute("data-count")) }));
  return {
    present: true,
    rows,
    tiles,
    basis: board.querySelector("[data-testid=multikill-basis]")?.textContent?.trim() ?? "",
    explained: !!board.querySelector("[data-testid=multikill-explain]"),
    empty: !!board.querySelector("[data-testid=multikills-empty]"),
  };
}

/** The board's two possible lines: compared with the other players in the same games, or with the team's own games. */
export const MULTIKILL_BASES = {
  "same-games": "Per game, against the same roles and champions · 100 is usual",
  team: "Per game, against the team's own games · 100 is the team's usual",
};

const KIND_WORDS = [["penta", "pentas"], ["quadra", "quadras"], ["triple", "triples"], ["double", "doubles"]];
/** A row's counts (penta, quadra, triple, double) in the words the board must show, rarest first. */
export const kindsInWords = (counts) => counts.flatMap((n, i) => (n > 0 ? [`${n} ${KIND_WORDS[i][n === 1 ? 0 : 1]}`] : []));

/**
 * What the check asserts about the board read by readMultikillBoard. Each verdict: its name, PASS,
 * FAIL or WARN, and what was found (counts only).
 */
export function multikillVerdicts({ kind, read }) {
  const out = [];
  const fact = (name, ok, detail) => out.push({ name: `${kind}: ${name}`, status: ok ? "PASS" : "FAIL", detail });
  if (!read?.present) {
    fact("the multikill board is on the page", false, { present: false });
    return out;
  }
  const source = Object.entries(MULTIKILL_BASES).find(([, line]) => line === read.basis)?.[0] ?? null;
  fact("the multikill board says what its score is compared with, and explains it behind its ⓘ", !!source && read.explained, { source, explained: read.explained });
  if (read.empty || read.rows.length === 0) {
    out.push({ name: `${kind}: skipped: no member has a game with multikill counts this season (the board's rows and tiles)`, status: "WARN", detail: { rows: 0 } });
    return out;
  }
  if (source === "team") out.push({ name: `${kind}: the multikill score compares with the team's own games (fewer than 1,000 games of other players stored this season), and says so`, status: "WARN", detail: { source } });
  const ranked = read.rows.filter((r) => r.status === "ranked");
  const order = ["ranked", "provisional", "not-enough"];
  const grouped = read.rows.every((r, i) => i === 0 || order.indexOf(r.status) >= order.indexOf(read.rows[i - 1].status));
  const byScore = ranked.every((r, i) => i === 0 || (r.score <= ranked[i - 1].score && (r.place === ranked[i - 1].place) === (r.score === ranked[i - 1].score)));
  const placesOk = ranked.length === 0 || (ranked[0].place === 1 && ranked[0].crown && ranked.filter((r) => r.crown).every((r) => r.place === 1));
  fact("the multikill ranking: ranked members by score, a place shared exactly on equal scores, the crown on first; provisional, then too few games, after them", grouped && byScore && placesOk, { ranked: ranked.length, provisional: read.rows.filter((r) => r.status === "provisional").length, tooFew: read.rows.filter((r) => r.status === "not-enough").length, grouped, byScore, placesOk });
  const scored = read.rows.filter((r) => r.status !== "not-enough");
  fact("every ranked or provisional row shows its score; a row with too few games shows none", scored.every((r) => r.shown === String(r.score)) && read.rows.filter((r) => r.status === "not-enough").every((r) => r.shown === null), { scored: scored.length, withoutScore: scored.filter((r) => r.shown !== String(r.score)).length });
  const words = read.rows.filter((r) => JSON.stringify(r.kinds) !== JSON.stringify(kindsInWords(r.counts))).length;
  fact("each row's kinds in words are its own counts, rarest first", words === 0, { rows: read.rows.length, different: words });
  const best = (i) => Math.max(0, ...read.rows.map((r) => r.counts[i]));
  const want = { penta: best(0), quadra: best(1), triple: best(2), double: best(3) };
  const tilesOk = read.tiles.length === 4 && read.tiles.every((t) => (want[t.kind] > 0 ? t.count === want[t.kind] : t.count === null));
  fact("the most of each kind: four tiles, each the highest count on the board (or none yet)", tilesOk, { tiles: read.tiles.length, want, shown: Object.fromEntries(read.tiles.map((t) => [t.kind, t.count])) });
  const tallest = Math.max(...read.rows.map((r) => r.height));
  fact("compact rows: none taller than 66px", tallest <= 66, { rows: read.rows.length, tallest });
  return out;
}
