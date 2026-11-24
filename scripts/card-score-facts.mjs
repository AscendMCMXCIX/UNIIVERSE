/*
  MATCH HISTORY'S CARD SCORES in the Production check (scripts/live-check.mjs, matchHistory;
  docs/LIVE_VALIDATION.md, "What it checks"; docs/PERFORMANCE_SCORE.md, "On the collapsed card"):
  the first page's cards and one opened game read in the page, and what the check asserts about
  them, apart from the browser so a unit test can hand it any state
  (src/server/ops/live-check-card-score.test.ts).

  Read in the page only: states, scores, places, counts and true or false. No member's name, no
  match id, no address leaves it.
*/

/** The first page's cards as they show their performance score (self-contained, for evaluate). */
export function readCardScores() {
  const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
  const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  return [...document.querySelectorAll("[data-testid=match-card]")].map((card, index) => {
    const row = card.querySelector("[data-testid=match-row]");
    const marks = [...card.querySelectorAll("[data-testid=match-score]")].filter(visible);
    const mark = marks[0] ?? null;
    return {
      index,
      state: row?.getAttribute("data-score-state") ?? null,
      score: num(row?.getAttribute("data-score")),
      rank: num(row?.getAttribute("data-rank")),
      marks: marks.length,
      markScore: num(mark?.getAttribute("data-score")),
      markRank: num(mark?.getAttribute("data-rank")),
      // The card's label says the score (or why there is none) to a screen reader.
      spoken: /performance score/.test(row?.getAttribute("aria-label") ?? ""),
    };
  });
}

/** The opened game's score for the profile's player: the scoreboard row of the player inspected as it opens (self-contained, for evaluate). */
export function readOpenedScore() {
  const breakdown = document.querySelector("li[data-expanded] [data-testid=match-breakdown], [data-testid=match-detail] [data-testid=match-breakdown]");
  if (!breakdown) return { open: false };
  const timeline = breakdown.getAttribute("data-timeline");
  const slot = breakdown.getAttribute("data-selected");
  const cell = breakdown.querySelector(`[data-testid=participant][data-slot="${slot}"] [data-testid=participant-score]`);
  const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
  return { open: true, timeline, score: num(cell?.getAttribute("data-score")), rank: num(cell?.getAttribute("data-rank")), loading: cell?.getAttribute("data-state") === "loading" };
}

/** The first card with a score, by its place on the page, or null. */
export const firstScored = (cards) => cards.find((c) => c.state === "ok")?.index ?? null;

/**
 * What the check asserts about the cards (readCardScores) and the first scored game opened
 * (readOpenedScore, null when none was opened). Each verdict: its name, PASS, FAIL or WARN, and what
 * was found (counts, scores and places only).
 */
export function cardScoreVerdicts({ kind, cards, opened }) {
  const out = [];
  const count = (state) => cards.filter((c) => c.state === state).length;
  const counts = { cards: cards.length, ok: count("ok"), pending: count("pending"), none: count("none") };
  // Every card: a score with one mark, or the fallback (nothing drawn, the label says why), never a mark without a score.
  const wrong = cards.filter((c) => !["ok", "pending", "none"].includes(c.state ?? "") || (c.state === "ok" ? c.marks !== 1 || c.markScore !== c.score || c.markRank !== c.rank || c.score === null || c.rank === null : c.marks !== 0) || (c.state !== "none" && !c.spoken));
  out.push({ name: `${kind}: every card of the first page shows its performance score or the quiet fallback`, status: cards.length && !wrong.length ? "PASS" : cards.length ? "FAIL" : "WARN", detail: { ...counts, wrong: wrong.map((c) => c.index) } });
  if (!counts.ok) {
    out.push({ name: `${kind}: the first scored game, opened, shows the card's score and place`, status: "WARN", detail: { ...counts, note: "no card on the first page has a score yet" } });
    return out;
  }
  const card = cards.find((c) => c.state === "ok");
  const same = !!opened?.open && opened.timeline !== "loading" && !opened.loading && opened.score === card.score && opened.rank === card.rank;
  out.push({ name: `${kind}: the first scored game, opened, shows the card's score and place`, status: same ? "PASS" : "FAIL", detail: { card: { score: card.score, rank: card.rank }, opened: opened?.open ? { score: opened.score, rank: opened.rank, timeline: opened.timeline } : null } });
  return out;
}
