/*
  LEADERBOARDS' MULTIKILL TABLE in the Production check (scripts/live-check.mjs, multikillFacts;
  docs/LIVE_VALIDATION.md, "What it checks"; docs/TEAM_LEADERBOARDS.md, "The multikill score"): the
  table read in the page, and its Score breakdown once opened, and what the check asserts about
  them, apart from the browser so a unit test can hand it any state
  (src/server/ops/live-check-multikills.test.ts).

  Read in the page only: counts, scores, places, true or false, the role icon's accessible label as a
  pattern (matched in the page, never sent: it could only name a position, but the check keeps to
  counts) and the board's fixed words (the basis line, the column headings). No player's name, no
  address and no id leaves it.
*/

/** The table as the page shows it (self-contained, for evaluate). */
export function readMultikillBoard() {
  const board = document.querySelector("[data-testid=records-multikills]");
  if (!board) return { present: false };
  const num = (v) => (v === null || v === undefined ? null : Number(v));
  const ROLE_LABEL = /^(Most played: (Top|Jungle|Mid|Bottom|Support), \d+% of \d+ games?|Split: .+, \d+% each|Role unknown: .+)$/;
  const rows = [...board.querySelectorAll("[data-testid=multikill-row]")].map((r) => {
    const role = r.querySelector("[data-testid=multikill-role]");
    const roleLabel = role ? (role.getAttribute("aria-label") ?? role.textContent ?? "").trim() : "";
    return {
      status: r.getAttribute("data-status"),
      place: num(r.getAttribute("data-place")),
      score: num(r.getAttribute("data-score")),
      shown: r.querySelector("[data-testid=multikill-score]")?.textContent?.trim() ?? null,
      // Penta, quadra, triple, double: each multikill once, at its largest (the row's own data).
      counts: ["data-penta", "data-quadra", "data-triple", "data-double"].map((k) => Number(r.getAttribute(k) ?? "0")),
      // The table's four kind cells, penta to double, as drawn (their first text: the count).
      cells: ["penta", "quadra", "triple", "double"].map((k) => num(r.querySelector(`[data-testid=multikill-kind][data-kind=${k}]`)?.firstChild?.textContent?.trim() ?? null)),
      counted: num(r.getAttribute("data-counted")),
      games: num(r.querySelector("[data-testid=multikill-games] [aria-hidden]")?.textContent?.replace(/,/g, "") ?? null),
      // Riot's own counters, double to penta (the board shows each multikill once, read from these).
      riot: (r.getAttribute("data-riot") ?? "").split(",").filter(Boolean).map(Number),
      leader: !!r.querySelector("[data-testid=multikill-place][data-leader]"),
      crown: !!r.querySelector("[aria-label='First place']"),
      // The role icon's accessible name says the most-played position (or that it is split or unknown): checked here, not sent.
      roleNamed: ROLE_LABEL.test(roleLabel),
      scoreButton: !!r.querySelector("button[data-testid=multikill-score-open][aria-haspopup=dialog]"),
      height: Math.round(r.getBoundingClientRect().height),
    };
  });
  const heads = board.querySelector("[data-testid=multikill-heads]");
  const legend = board.querySelector("[data-testid=multikill-score-legend]");
  return {
    present: true,
    rows,
    // The column headings where they are drawn (a 26rem table and wider; a phone's rows say the same in words).
    heads: heads && heads.getBoundingClientRect().height > 0 ? heads.innerText.split(/\s+/).filter(Boolean) : null,
    basis: board.querySelector("[data-testid=multikill-basis]")?.textContent?.trim() ?? "",
    explained: !!board.querySelector("[data-testid=multikill-explain]"),
    legend: legend ? /Below 100 below typical/.test(legend.textContent ?? "") && /\b100 typical/.test(legend.textContent ?? "") && /Above 100 above typical/.test(legend.textContent ?? "") : false,
    // How Riot's counters are read: the board states it as data (its words are in the breakdown, drawn only while open).
    rule: legend?.getAttribute("data-counting-rule") ?? null,
    empty: !!board.querySelector("[data-testid=multikills-empty]"),
    // Nothing scrolling inside the page's main area (no inner scrollbar: 25 Nov 2026).
    scrollers: [...document.querySelectorAll("main *")].filter((e) => {
      const st = getComputedStyle(e);
      return /(auto|scroll)/.test(st.overflowY + st.overflowX) && (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1);
    }).length,
    // Nothing folded on the page (25 Nov 2026): no Show all, no fold.
    folds: document.querySelectorAll("[data-testid=leaderboards] [data-fold], [data-testid=leaderboards] [data-testid$=show-all]").length + [...document.querySelectorAll("[data-testid=leaderboards] button")].filter((b) => /Show all/.test(b.textContent ?? "")).length,
  };
}

/** The open Score breakdown as the page shows it (self-contained, for evaluate): its figures only. */
export function readMultikillBreakdown() {
  const panel = document.querySelector("[data-testid=multikill-breakdown]");
  if (!panel) return { present: false };
  const calc = panel.querySelector("[data-testid=breakdown-calculation]");
  const n = (v) => (v === null || v === undefined ? null : Number(String(v).replace(/,/g, "")));
  const kinds = [...panel.querySelectorAll("[data-testid=breakdown-points] tbody tr")].map((tr) => {
    const [times, points] = [...tr.querySelectorAll("td")].map((td) => td.textContent ?? "");
    const [made, weight] = (times ?? "").split("×").map((x) => n(x.trim()));
    return { made, weight, points: n(points) };
  });
  // Scrolling inside the open panel (it should open whole at the check's sizes).
  const scrolls = [panel, ...panel.querySelectorAll("*")].filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1).length;
  return {
    present: true,
    score: n(panel.querySelector("[data-testid=breakdown-score]")?.firstChild?.textContent?.trim() ?? null),
    calc: calc ? { earned: n(calc.getAttribute("data-earned")), expected: n(calc.getAttribute("data-expected")), cushion: n(calc.getAttribute("data-cushion")), score: n(calc.getAttribute("data-score")) } : null,
    kinds,
    role: !!panel.querySelector("[data-testid=breakdown-role-label]"),
    comparison: !!panel.querySelector("[data-testid=breakdown-comparison]"),
    levels: panel.querySelectorAll("[data-testid=breakdown-levels] li").length,
    scrolls,
  };
}

/** The board's two possible lines under its heading: ranked against the champions and roles played, or (the fallback) the team's own games. */
export const MULTIKILL_BASES = {
  "same-games": "Ranked by multikill performance relative to the champions and roles played.",
  team: "Ranked by multikill performance relative to the team's own games.",
};

/** The table's column headings: short kinds under a 40rem table, their words from it. */
export const MULTIKILL_HEADS = [
  ["#", "Player", "Games", "2×", "3×", "4×", "5×", "Score"],
  ["#", "Player", "Games", "Doubles", "Triples", "Quadras", "Pentas", "Score"],
];

/** Riot's counters (double, triple, quadra, penta) as each multikill once, at its largest, rarest first like the rows' counts. */
export function eventsOf(riot, rule) {
  const [d = 0, t = 0, q = 0, p = 0] = riot;
  const e = rule === "separate" ? [d, t, q, p] : [Math.max(0, d - t), Math.max(0, t - q), Math.max(0, q - p), p];
  return [e[3], e[2], e[1], e[0]];
}

/** The final line's arithmetic, as a reader would do it: 100 × (earned + cushion) ÷ (expected + cushion), rounded. */
export const scoreFrom = ({ earned, expected, cushion }) => Math.round((100 * (earned + cushion)) / (expected + cushion));

/**
 * What the check asserts about the table read by readMultikillBoard. Each verdict: its name, PASS,
 * FAIL or WARN, and what was found (counts only).
 */
export function multikillVerdicts({ kind, read }) {
  const out = [];
  const fact = (name, ok, detail) => out.push({ name: `${kind}: ${name}`, status: ok ? "PASS" : "FAIL", detail });
  if (!read?.present) {
    fact("the multikill table is on the page", false, { present: false });
    return out;
  }
  const source = Object.entries(MULTIKILL_BASES).find(([, line]) => line === read.basis)?.[0] ?? null;
  fact("the multikill table says what its score is ranked by, explains it behind its ⓘ, and how to read a score (below 100, 100, above 100)", !!source && read.explained && read.legend, { source, explained: read.explained, legend: read.legend });
  fact("nothing folded on Leaderboards: no Show all, no fold", read.folds === 0, { folds: read.folds });
  fact("nothing scrolls inside the page: no inner scrollbar", (read.scrollers ?? 0) === 0, { scrollers: read.scrollers ?? 0 });
  if (read.empty || read.rows.length === 0) {
    out.push({ name: `${kind}: skipped: no active player has 20 games with multikill counts this season (the table's rows)`, status: "WARN", detail: { rows: 0 } });
    return out;
  }
  if (source === "team") out.push({ name: `${kind}: the multikill score compares with the team's own games (fewer than 1,000 games of other players stored this season), and says so`, status: "WARN", detail: { source } });
  if (read.heads) fact("the table's columns: place, player, games, the four kinds and the Score", MULTIKILL_HEADS.some((h) => JSON.stringify(h) === JSON.stringify(read.heads)), { columns: read.heads.length });
  const rows = read.rows;
  const ranked = rows.every((r) => r.status === "ranked" && (r.counted ?? 0) >= 20);
  const byScore = rows.every((r, i) => i === 0 || (r.score <= rows[i - 1].score && (r.place === rows[i - 1].place) === (r.score === rows[i - 1].score)));
  const noGap = rows.every((r, i) => (i === 0 ? r.place === 1 : r.place === rows[i - 1].place || r.place === i + 1));
  const restrained = rows.every((r) => !r.crown && r.leader === (r.place === 1));
  fact("the multikill ranking: ranked players only (20+ games with counts), by score, a place shared exactly on equal scores, none skipped; first in gold, no crown", ranked && byScore && noGap && restrained, { rows: rows.length, ranked, byScore, noGap, restrained });
  fact("every row shows its score as a button that opens its breakdown", rows.every((r) => r.shown === String(r.score) && r.scoreButton), { rows: rows.length, withoutScore: rows.filter((r) => r.shown !== String(r.score)).length, withoutButton: rows.filter((r) => !r.scoreButton).length });
  const once = rows.filter((r) => r.riot?.length === 4 && read.rule && JSON.stringify(eventsOf(r.riot, read.rule)) !== JSON.stringify(r.counts)).length;
  fact("each row shows each multikill once, at its largest: Riot's counters read by the rule the board states", !!read.rule && rows.every((r) => r.riot?.length === 4) && once === 0, { rule: read.rule, rows: rows.length, different: once });
  const cells = rows.filter((r) => JSON.stringify(r.cells) !== JSON.stringify(r.counts) || r.games !== r.counted).length;
  fact("each row's games and kind cells are its own counts", cells === 0, { rows: rows.length, different: cells });
  fact("each row's role icon is named by the most-played position over the score's games (or split, or unknown)", rows.every((r) => r.roleNamed), { rows: rows.length, unnamed: rows.filter((r) => !r.roleNamed).length });
  // A phone's row is two lines (the 44px Score's line, the words under it, which may wrap): 96px; the table's one line elsewhere.
  const limit = kind === "phone" ? 96 : 72;
  const tallest = Math.max(...rows.map((r) => r.height));
  fact(`compact rows: none taller than ${limit}px`, tallest <= limit, { rows: rows.length, tallest });
  return out;
}

/** What the check asserts about the first Score's breakdown (readMultikillBreakdown), against the row it opened from. */
export function breakdownVerdicts({ kind, read, rowScore }) {
  const out = [];
  const fact = (name, ok, detail) => out.push({ name: `${kind}: ${name}`, status: ok ? "PASS" : "FAIL", detail });
  if (rowScore === null || rowScore === undefined) {
    out.push({ name: `${kind}: skipped: no Score to open (the breakdown)`, status: "WARN", detail: { rows: 0 } });
    return out;
  }
  if (!read?.present) {
    fact("the Score opens its breakdown", false, { present: false });
    return out;
  }
  const c = read.calc;
  const reproduces = !!c && c.cushion === 40 && c.score === rowScore && read.score === rowScore && scoreFrom(c) === rowScore;
  fact("the breakdown's final line, 100 × (earned + 40) ÷ (typical + 40), gives the score shown", reproduces, { shown: rowScore, recomputed: c ? scoreFrom(c) : null, cushion: c?.cushion ?? null });
  const kinds = read.kinds.length === 4 && read.kinds.every((k, i) => k.weight === i + 2 && k.made * k.weight === k.points) && !!c && read.kinds.reduce((s, k) => s + k.points, 0) === c.earned;
  fact("the breakdown's points: each kind made × its points (2–5), adding up to the earned points", kinds, { kinds: read.kinds.length });
  fact("the breakdown names the most-played role, where typical comes from and how the games were compared", read.role && read.comparison && read.levels > 0, { role: read.role, comparison: read.comparison, levels: read.levels });
  fact("the breakdown opens whole, with no scrollbar of its own", read.scrolls === 0, { scrolls: read.scrolls });
  return out;
}
