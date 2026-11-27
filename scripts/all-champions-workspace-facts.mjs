/*
  ALL CHAMPIONS' ONE-SCREEN WORKSPACE in the Production check (scripts/live-check.mjs,
  workspaceFacts; docs/LIVE_VALIDATION.md, "What it checks"; the owner's request of 27 Nov 2026): on a
  desktop window All Champions never scrolls, its champions, the open champion's lane opponents and
  one opponent's games are in pages of the rows that fit, and every record is reachable through the
  pages. Read in the page at 1440 × 900, 1920 × 950 and 1920 × 1080 (all of them the workspace) and
  judged apart from the browser, so a unit test can hand it any state
  (src/server/ops/live-check-workspace.test.ts).

  Read in the page only: px, counts, true or false and fixed words' digits. No name, no Riot ID and no
  address leaves it: a page walk hashes each row's champion id in the page (FNV-1a) and only the count
  of distinct hashes and the order checks come back. Page changes are the page's own state, with no
  request; the previews open through the page's two light server actions, as a member's click does.
*/

/** The least room between a list's last row and its footer (docs/STANDARDS.md, "A layout held to a measure keeps a margin"). */
export const WORKSPACE_MARGIN = 12;

/** The workspace as drawn (self-contained, for evaluate): the window, the cards, their margins, the scrollers and each paged list. */
export function readWorkspace() {
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const main = document.getElementById("content");
  const pad = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
  const ROWS = "[data-testid=top-champion], [data-testid=champion-preview-opponent], [data-testid=champion-preview-small-divider], [data-testid=champion-preview-games] > li";
  const cards = [...document.querySelectorAll("[data-testid=all-champions-table], aside[data-preview-pane]")].filter(shown).map((card) => {
    const foot = [...card.querySelectorAll("[data-ws-foot]")].find(shown);
    const rows = [...card.querySelectorAll(ROWS)].filter(shown);
    const last = rows.length ? Math.max(...rows.map((r) => r.getBoundingClientRect().bottom)) : null;
    return { card: card.matches("aside") ? "preview" : "list", bottom: Math.round(card.getBoundingClientRect().bottom * 10) / 10, margin: foot && last !== null ? Math.round(foot.getBoundingClientRect().top - last) : null };
  });
  const scrolls = (el) => {
    const s = getComputedStyle(el);
    return (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1) || (/(auto|scroll)/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 1);
  };
  const regions = Object.fromEntries(
    [...document.querySelectorAll("[data-ws-region]")].filter(shown).map((el) => [el.getAttribute("data-ws-region"), { per: Number(el.getAttribute("data-per")), page: Number(el.getAttribute("data-page")), pages: Number(el.getAttribute("data-pages")), total: Number(el.getAttribute("data-total")) }]),
  );
  const scope = /^(\d[\d,]*) champions?\b/.exec(document.querySelector("[data-testid=all-champions-scope]")?.textContent?.trim() ?? "");
  return {
    window: innerHeight,
    height: document.documentElement.scrollHeight,
    pad,
    workspace: !!document.querySelector("[data-workspace]"),
    cards,
    scrollers: main ? [...main.querySelectorAll("*")].filter(scrolls).length : 0,
    regions,
    scope: scope ? Number(scope[1].replace(/,/g, "")) : null,
  };
}

/**
 * One page of a paged list (self-contained, for evaluate): each row's champion id hashed in the page
 * (FNV-1a, 32 bits), its games and its small-sample mark, the divider's slots, and the region's page.
 * `region` is "list", "opponents" or "games"; a game is hashed by its place and its words (its match
 * is no member's data, but its id stays in the page all the same).
 */
export function readPage(region) {
  const fnv = (text) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16);
  };
  const el = document.querySelector(`[data-ws-region="${region}"]`);
  if (!el) return null;
  const sel = region === "list" ? "[data-testid=top-champion]" : region === "opponents" ? ":scope > li" : ":scope > li";
  const slots = [...el.querySelectorAll(sel)].filter((r) => r.getBoundingClientRect().height > 0);
  return {
    page: Number(el.getAttribute("data-page")),
    pages: Number(el.getAttribute("data-pages")),
    per: Number(el.getAttribute("data-per")),
    total: Number(el.getAttribute("data-total")),
    rows: slots
      .filter((r) => r.getAttribute("data-testid") !== "champion-preview-small-divider")
      .map((r, i) => ({ id: fnv(region === "games" ? `${i}:${r.textContent ?? ""}` : (r.getAttribute("data-champion") ?? "")), games: Number(r.getAttribute("data-games") ?? "0"), small: r.hasAttribute("data-small") })),
    dividers: slots.map((r, i) => (r.getAttribute("data-testid") === "champion-preview-small-divider" ? i : -1)).filter((i) => i >= 0),
    slots: slots.length,
  };
}

/** A walk's pages in one: every row's hash, the distinct count, the repeats, and the pages walked. */
export function walkSummary(pages) {
  const rows = pages.flatMap((p) => p?.rows ?? []);
  const distinct = new Set(rows.map((r) => r.id)).size;
  return { rows: rows.length, distinct, repeats: rows.length - distinct, pages: pages.length, games: rows.map((r) => r.games), small: rows.map((r) => r.small) };
}

/**
 * What the check asserts at one size. `read` is readWorkspace's; `list`, `opponents` and `games` are
 * walkSummary's of each list's pages with the region's own figures (`total`, `per`, `pages`) and what
 * the page says beside it (`count`: the count beside "Lane opponents"; `record`: the N of "N games ·
 * …"); `steps` is what opening and closing did (the heights before and after, the pages before and
 * after, the detail's ‹ ›). Each verdict: its name, PASS, FAIL or WARN, and what was found.
 */
export function workspaceVerdicts({ size, read, list, opponents, games, steps }) {
  const out = [];
  const fact = (name, ok, detail) => out.push({ name: `${size}: ${name}`, status: ok ? "PASS" : "FAIL", detail });
  if (!read?.workspace) {
    fact("All Champions is one workspace: the page does not scroll, its cards end above the page's padding, nothing in main scrolls", false, { workspace: false, why: "the workspace did not apply" });
    return out;
  }
  const limit = read.window - read.pad + 0.5;
  fact("All Champions is one workspace: the page does not scroll, its cards end above the page's padding, nothing in main scrolls", read.height <= read.window && read.cards.every((c) => c.bottom <= limit) && read.scrollers === 0, { window: read.window, height: read.height, bottoms: read.cards.map((c) => c.bottom), limit: Math.round(limit), scrollers: read.scrollers });
  const margins = read.cards.map((c) => c.margin).filter((m) => typeof m === "number");
  const least = margins.length ? Math.min(...margins) : null;
  if (least !== null) out.push({ name: `${size}: room to spare: each list ends at least ${WORKSPACE_MARGIN}px above its footer`, status: least >= WORKSPACE_MARGIN ? "PASS" : least >= 0 ? "WARN" : "FAIL", detail: { margins, min: WORKSPACE_MARGIN } });
  if (list) {
    const pages = Math.max(1, Math.ceil(list.total / Math.max(1, list.per)));
    fact("every champion is reachable through the list's pages", list.distinct === list.total && list.repeats === 0 && list.distinct === read.scope && list.pages === pages, { distinct: list.distinct, total: list.total, scope: read.scope, repeats: list.repeats, pages: list.pages, expected: pages });
  }
  if (!steps?.opened) {
    out.push({ name: `${size}: skipped: no champion on the list has 3 or more games, so its preview was not opened`, status: "WARN", detail: null });
    return out;
  }
  fact("the first champion with 3+ games opens beside the list without changing the page's height", steps.opened.heightBefore === steps.opened.heightAfter && steps.opened.beside && steps.opened.rowsKept, steps.opened);
  if (!opponents || opponents.total === 0) {
    out.push({ name: `${size}: skipped: no lane opponent known yet for that champion, so its opponents' pages were not walked`, status: "WARN", detail: null });
  } else {
    const ordered = opponents.games.every((g, i) => i === 0 || opponents.games[i - 1] >= g);
    const marked = opponents.games.every((g, i) => opponents.small[i] === g < 3);
    fact("every lane opponent is reachable through its pages, most games first across pages, the small samples marked", opponents.distinct === opponents.total && opponents.repeats === 0 && opponents.distinct === opponents.count && ordered && marked, { distinct: opponents.distinct, total: opponents.total, count: opponents.count, repeats: opponents.repeats, ordered, marked, pages: opponents.pages });
    if (games && steps.detail) fact("its most-met opponent's games open in place without changing the page's height, every game reachable", steps.detail.heightBefore === steps.detail.heightAfter && games.distinct === games.record && games.repeats === 0 && (opponents.total < 2 || steps.detail.steps), { heightBefore: steps.detail.heightBefore, heightAfter: steps.detail.heightAfter, distinct: games.distinct, record: games.record, steps: steps.detail.steps, pages: games.pages });
  }
  // The page it was opened from (the first, for the most-met opponent; the second, for one opened from there where there
  // are two pages or more): Escape comes back to it.
  if (steps.escaped) {
    const e = steps.escaped;
    const later = e.laterPageBefore == null || (e.laterPage === e.laterPageBefore && e.laterPageBefore > 1);
    fact("Escape returns to the opponents on the same page, Escape again closes, the list on the page it was on", e.opponentsPage === e.opponentsPageBefore && e.opponentsPageBefore >= 1 && later && e.closed && e.listPage === e.listPageBefore, e);
  }
  return out;
}
