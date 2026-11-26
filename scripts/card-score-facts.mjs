/*
  MATCH HISTORY'S CARD SCORES in the Production check (scripts/live-check.mjs, matchHistory;
  docs/LIVE_VALIDATION.md, "What it checks"; docs/PERFORMANCE_SCORE.md, "On the collapsed card"):
  the first page's cards and one opened game read in the page, and what the check asserts about
  them, apart from the browser so a unit test can hand it any state
  (src/server/ops/live-check-card-score.test.ts).

  Since the owner's requirements of 25 Nov 2026 the score has a place of its own on every card (a
  column right after the K/D/A on a wide card, directly under the K/D/A on a narrow one, a quiet dash
  where there is no score) and one place badge across the site (components/ui/placement-badge: MVP
  gold, ACE violet, any other place restrained), Team → Matches included: the check asserts each
  badge says its card's place in its colour, MVP only on a won game and ACE only on a lost one, and
  that the score keeps its place from card to card.

  Read in the page only: states, scores, places, counts, colours compared in the page, positions in
  px and true or false. No member's name, no match id, no address leaves it.
*/

/** The first page's cards as they show their performance score (self-contained, for evaluate). */
export function readCardScores() {
  const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
  const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  // The place tokens as the browser resolves them, to compare a badge's computed colour with.
  const probe = (token) => {
    const el = document.createElement("span");
    el.style.color = `var(${token})`;
    document.body.append(el);
    const c = getComputedStyle(el).color;
    el.remove();
    return c;
  };
  const gold = probe("--color-gold");
  const violet = probe("--color-violet");
  const toneOf = (el) => {
    if (!el) return null;
    const c = getComputedStyle(el).color;
    return c === gold ? "gold" : c === violet ? "violet" : "neutral";
  };
  return [...document.querySelectorAll("[data-testid=match-card]")].map((card, index) => {
    const row = card.querySelector("[data-testid=match-row]");
    const marks = [...card.querySelectorAll("[data-testid=match-score]")].filter(visible);
    const mark = marks[0] ?? null;
    const badge = mark?.querySelector("[data-testid=match-placement]") ?? null;
    const kda = card.querySelector("[data-testid=match-kda]");
    const cell = [...card.querySelectorAll("[data-testid=match-score-cell]")].find(visible) ?? null;
    const slot = mark ?? [...card.querySelectorAll("[data-testid=match-score-empty]")].find(visible) ?? null;
    const box = slot?.getBoundingClientRect();
    const k = kda?.getBoundingClientRect();
    return {
      index,
      state: row?.getAttribute("data-score-state") ?? null,
      result: row?.getAttribute("data-result") ?? null,
      score: num(row?.getAttribute("data-score")),
      rank: num(row?.getAttribute("data-rank")),
      marks: marks.length,
      markScore: num(mark?.getAttribute("data-score")),
      markRank: num(mark?.getAttribute("data-rank")),
      mvp: mark?.getAttribute("data-mvp") === "true",
      ace: mark?.getAttribute("data-ace") === "true",
      // The place badge: what it says it is (mvp, ace or place), its place, and its colour against the tokens.
      place: badge?.getAttribute("data-placement") ?? null,
      placeRank: num(badge?.getAttribute("data-rank")),
      tone: toneOf(badge),
      // Its width in px (one per size whatever it says since the review of 25 Nov 2026, so a score beside it starts at one x).
      badgeWidth: badge ? Math.round(badge.getBoundingClientRect().width * 10) / 10 : null,
      // Where the score sits: the wide card's column (its left edge), or under the K/D/A on a narrow card; the quiet dash counts where there is no score.
      slots: slot ? 1 : 0,
      column: cell ? Math.round(cell.getBoundingClientRect().left) : null,
      underKda: !cell && !!box && !!k ? box.top >= k.bottom - 0.5 && Math.min(box.right, k.right) - Math.max(box.left, k.left) > 0 : null,
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
  const card = cards.find((c) => c.state === "ok");
  if (!card) out.push({ name: `${kind}: the first scored game, opened, shows the card's score and place`, status: "WARN", detail: { ...counts, note: "no card on the first page has a score yet" } });
  else {
    const same = !!opened?.open && opened.timeline !== "loading" && !opened.loading && opened.score === card.score && opened.rank === card.rank;
    out.push({ name: `${kind}: the first scored game, opened, shows the card's score and place`, status: same ? "PASS" : "FAIL", detail: { card: { score: card.score, rank: card.rank }, opened: opened?.open ? { score: opened.score, rank: opened.rank, timeline: opened.timeline } : null } });
  }
  out.push(...placeVerdicts(`${kind}: each scored card's place badge says its place, MVP gold on a won game, ACE violet on a lost one, other places restrained`, cards.filter((c) => c.state === "ok").map((c) => ({ ...c, at: c.index }))));
  // One place for the score on every card: a wide card's column at one x (±1px), else directly under the K/D/A; the quiet dash keeps it where there is no score.
  const columns = cards.map((c) => c.column).filter((x) => x !== null && x !== undefined);
  const spread = columns.length ? Math.max(...columns) - Math.min(...columns) : 0;
  const notUnder = cards.filter((c) => c.column === null && c.underKda === false).map((c) => c.index);
  const missing = cards.filter((c) => c.slots !== 1).map((c) => c.index);
  out.push({ name: `${kind}: the score keeps one place on every card (its own column on a wide card, under the K/D/A on a narrow one, a quiet dash without a score)`, status: !cards.length ? "WARN" : spread <= 1 && !notUnder.length && !missing.length ? "PASS" : "FAIL", detail: { cards: cards.length, columns: columns.length, spread, notUnder, missing } });
  // One badge width whatever it says (MVP and ACE as wide as "5th"), so a score beside its badge starts at one x from card to card
  // (the review of 25 Nov 2026: MVP and ACE grew past the pill's minimum width). Within half a pixel; WARN with no badge to measure.
  const widths = cards.filter((c) => c.state === "ok" && typeof c.badgeWidth === "number").map((c) => c.badgeWidth);
  const widthSpread = widths.length ? Math.round((Math.max(...widths) - Math.min(...widths)) * 10) / 10 : 0;
  const kinds = new Set(cards.filter((c) => c.state === "ok" && typeof c.badgeWidth === "number").map((c) => c.place));
  out.push({ name: `${kind}: one place badge width whatever it says, so a score beside its badge starts at one x`, status: !widths.length ? "WARN" : widthSpread <= 0.5 ? "PASS" : "FAIL", detail: { badges: widths.length, kinds: [...kinds].sort(), widths: [...new Set(widths)].sort((a, b) => a - b), spread: widthSpread } });
  return out;
}

/**
 * The place badge facts for a list of scored marks (`at`: where each was read, for the detail): the
 * badge says the mark's place (MVP, ACE or the ordinal, with the same rank), in its colour (gold,
 * violet, neutral), and an MVP is only on a won game and an ACE only on a lost one (`result` W or L;
 * null skips that part). WARN where nothing on the page is scored.
 */
function placeVerdicts(name, marks) {
  if (!marks.length) return [{ name, status: "WARN", detail: { scored: 0, note: "nothing on the first page has a score yet" } }];
  const kind = (m) => (m.mvp ? "mvp" : m.ace ? "ace" : "place");
  const TONE = { mvp: "gold", ace: "violet", place: "neutral" };
  const wrong = marks.filter((m) => m.place !== kind(m) || m.placeRank !== m.markRank || m.tone !== TONE[kind(m)] || (m.mvp && m.result !== null && m.result !== "W") || (m.ace && m.result !== null && m.result !== "L")).map((m) => m.at);
  const count = (k) => marks.filter((m) => kind(m) === k).length;
  return [{ name, status: wrong.length ? "FAIL" : "PASS", detail: { scored: marks.length, mvp: count("mvp"), ace: count("ace"), place: count("place"), wrong } }];
}

/**
 * Team → Matches' members as they show their performance score (self-contained, for evaluate): for
 * each of the first ten games, its result and each member row's mark (the score and its badge, or
 * the quiet dash). Places, colours and counts only.
 */
export function readTogetherScores() {
  const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
  const probe = (token) => {
    const el = document.createElement("span");
    el.style.color = `var(${token})`;
    document.body.append(el);
    const c = getComputedStyle(el).color;
    el.remove();
    return c;
  };
  const gold = probe("--color-gold");
  const violet = probe("--color-violet");
  const toneOf = (el) => {
    if (!el) return null;
    const c = getComputedStyle(el).color;
    return c === gold ? "gold" : c === violet ? "violet" : "neutral";
  };
  return [...document.querySelectorAll("[data-testid=together-game]")].slice(0, 10).map((game, index) => ({
    index,
    result: game.getAttribute("data-result"),
    members: [...game.querySelectorAll("[data-testid=together-member]")].map((m) => {
      // A row has two places for its mark (the end of the role's line, or a column at the row's end): one is shown.
      const shown = [...m.querySelectorAll("[data-testid=together-score], [data-testid=together-score-empty]")].filter((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden");
      const mark = shown.find((e) => e.getAttribute("data-testid") === "together-score") ?? null;
      const badge = mark?.querySelector("[data-testid=together-placement]") ?? null;
      return {
        slots: shown.length,
        scored: !!mark,
        markScore: num(mark?.getAttribute("data-score")),
        markRank: num(mark?.getAttribute("data-rank")),
        mvp: mark?.getAttribute("data-mvp") === "true",
        ace: mark?.getAttribute("data-ace") === "true",
        place: badge?.getAttribute("data-placement") ?? null,
        placeRank: num(badge?.getAttribute("data-rank")),
        tone: toneOf(badge),
      };
    }),
  }));
}

/** What the check asserts about Team → Matches' member scores (readTogetherScores). */
export function togetherScoreVerdicts({ kind, games }) {
  const out = [];
  if (!games.length) return [{ name: `${kind}: each Team Matches member shows their performance score and place, or the quiet dash`, status: "WARN", detail: { games: 0 } }];
  const rows = games.flatMap((g) => g.members);
  const missing = games.filter((g) => g.members.some((m) => m.slots !== 1)).map((g) => g.index);
  // Two members of one side never share a place.
  const shared = games.filter((g) => {
    const ranks = g.members.filter((m) => m.scored).map((m) => m.markRank);
    return new Set(ranks).size !== ranks.length;
  }).map((g) => g.index);
  out.push({ name: `${kind}: each Team Matches member shows their performance score and place, or the quiet dash, each place once in a game`, status: !missing.length && !shared.length ? "PASS" : "FAIL", detail: { games: games.length, members: rows.length, scored: rows.filter((m) => m.scored).length, missing, shared } });
  out.push(...placeVerdicts(`${kind}: each Team Matches member's place badge says their place, MVP gold on a won game, ACE violet on a lost one`, games.flatMap((g) => g.members.filter((m) => m.scored).map((m) => ({ ...m, result: g.result === "W" || g.result === "L" ? g.result : null, at: g.index })))));
  return out;
}
