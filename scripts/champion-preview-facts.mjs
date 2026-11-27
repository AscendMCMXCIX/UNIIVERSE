/*
  ALL CHAMPIONS' PREVIEW in the Production check (scripts/live-check.mjs, championPreviewFacts;
  docs/LIVE_VALIDATION.md, "What it checks"; PLAN §6 rows 4.5a–4.10): on the desktop, the preview of
  the first champion on the teammate's list with at least 3 games, read in the page, and what the
  check asserts about it, apart from the browser so a unit test can hand it any state
  (src/server/ops/live-check-champion-preview.test.ts). Since 25 Nov 2026 the preview is a pane
  beside the list (the list narrowing, nothing laid over it), read where it is as well as what it
  says: the position it shows (the row's most played, one of its position icons), that position's
  record, and every lane opponent in one table; and (the 25 Nov 2026 review) that the page is the one
  thing that scrolls: the pane is no scroll box, nothing in the page's main area scrolls, and the
  pane's header is on screen.

  Since 27 Nov 2026 a desktop window is All Champions' one-screen workspace (the owner's request;
  scripts/all-champions-workspace-facts.mjs walks its pages): the list and the opponents are in pages,
  so the row read is on the list's second page where there is one (the browsing position is "the list
  stays on its page"), the opponents read are the drawn page's (every opponent through the pages is the
  workspace's fact), the portrait is 36px, and a champion of one position says it in words.

  Read in the page only: counts, true or false and the preview's fixed words ("12 games · 7W 5L",
  "58%", "TOP"). The champion's own name is compared in the page, never returned; no player's name,
  no address and no id leaves it.
*/

/** The rows the list shows, in order: each one's games, whether it is the open one, and the list's page where it has pages (self-contained, for evaluate). */
export function readChampionRows() {
  const list = document.querySelector("[data-ws-region=list]");
  const page = list ? Number(list.getAttribute("data-page")) : null;
  const pages = list ? Number(list.getAttribute("data-pages")) : null;
  return [...document.querySelectorAll("[data-testid=top-champion]")].map((r) => ({ games: Number(r.getAttribute("data-games") ?? "0"), open: r.getAttribute("data-selected") === "true" || r.querySelector("[data-open-champion][aria-expanded=true]") !== null, top: Math.round(r.getBoundingClientRect().top + scrollY), screen: innerHeight, page, pages }));
}

/** The open preview, read in the page (self-contained, for evaluate). `rowIndex` is the row it was opened from. */
export function readChampionPreview(rowIndex) {
  const clean = (el) => el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const content = document.querySelector("[data-testid=champion-preview-content]");
  const rows = [...document.querySelectorAll("[data-testid=top-champion]")];
  const row = rows[rowIndex] ?? null;
  if (!content) return { open: false };
  const header = content.querySelector("[data-testid=champion-preview-header]") ?? content.querySelector("header");
  // The preview leads with the champion's portrait, at least 32px (36px in the workspace's identity bar); its heading names the champion
  // ("Champion: Gwen", the label read out only): the pane's own, or a phone's window's title.
  const portrait = header?.firstElementChild ?? null;
  const box = portrait?.getBoundingClientRect();
  const img = portrait?.tagName === "IMG" ? portrait : null;
  const holder = content.closest("[data-testid=champion-preview]");
  const heading = clean(holder?.querySelector("h2"));
  const title = heading.replace(/^Champion: /, "");
  const rowName = clean(row?.querySelector("[data-open-champion]"));
  // The position shown (the role selector's chosen one), against the row's position icons: opened
  // from the row, its most played (the first icon), and the record that icon gives for it.
  const role = content.getAttribute("data-role") ?? "";
  // The workspace says a champion of one position in words (nothing to choose): its position element, else the radiogroup's checked one.
  const said = content.querySelector("[data-testid=champion-preview-position][data-role]");
  const radio = content.querySelector("[data-testid=champion-preview-roles] [aria-checked=true]");
  const chosen = said && said.getBoundingClientRect().width > 0 ? said : radio;
  const icons = [...(row?.querySelectorAll("[data-testid=champion-role]") ?? [])];
  const icon = icons.find((i) => i.getAttribute("data-role") === role) ?? null;
  // Where it is (since 25 Nov 2026): a pane beside the list (an aside in the page, not a window),
  // within the screen's width, the list's card and the row's name clear of it (nothing laid over them).
  const paneEl = holder?.matches("aside[data-preview-pane]") ? holder : null;
  const pane = paneEl ? paneEl.getBoundingClientRect() : null;
  // One scrolling surface (25 Nov 2026 review): the page. The pane is no scroll box of its own, nothing
  // inside the page's main area scrolls, and the pane's header (the champion, ‹ › and Close) is on screen.
  const scrolls = (el) => {
    const st = getComputedStyle(el);
    return /(auto|scroll)/.test(st.overflowY + st.overflowX) && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
  };
  const paneStyle = paneEl ? getComputedStyle(paneEl) : null;
  const head = paneEl?.querySelector("[data-testid=champion-preview-header]")?.getBoundingClientRect() ?? null;
  const close = paneEl?.querySelector("[data-testid=champion-preview-close]")?.getBoundingClientRect() ?? null;
  const card = document.querySelector("[data-testid=all-champions-table]")?.getBoundingClientRect() ?? null;
  const name = row?.querySelector("[data-open-champion]")?.getBoundingClientRect() ?? null;
  const opponents = [...content.querySelectorAll("[data-testid=champion-preview-opponent]")];
  const lookup = [...content.querySelectorAll("[data-testid=champion-preview-lookup]")];
  const href = lookup[0]?.getAttribute("href") ?? "";
  const q = new URL(href || "/", location.origin).searchParams;
  // The opened opponent: its pressed row (the flow, the table beside it), else its games' own section (the workspace, in the grid's place).
  const opened = opponents.find((o) => o.querySelector("button[aria-pressed=true]"))?.getAttribute("data-champion") ?? content.querySelector("[data-testid=champion-preview-pairing]")?.getAttribute("data-champion") ?? null;
  return {
    open: true,
    // The champion the preview shows against the row it was opened from (compared here, not returned).
    sameChampion: !!row && content.getAttribute("data-champion") === row.getAttribute("data-champion"),
    rowGames: Number(row?.getAttribute("data-games") ?? "0"),
    portrait: !!box && box.width >= 32 && box.height >= 32 && (!img || (img.getAttribute("alt") ?? "") === title),
    named: title.length > 0 && title === rowName,
    role: chosen ? (chosen.getAttribute("data-role") ?? "") : "",
    position: { chosen: !!chosen && chosen.getAttribute("data-role") === role, icon: !!icon, first: !!icons[0] && icons[0] === icon, icons: icons.length },
    roleGames: Number(icon?.getAttribute("data-games") ?? "-1"),
    record: clean(content.querySelector("[data-testid=champion-preview-record-line]")),
    winRate: clean(content.querySelector("[data-testid=champion-preview-winrate]")),
    pane: { pane: !!pane, window: !!document.querySelector("dialog[open]"), within: !!pane && pane.left >= -0.5 && pane.right <= innerWidth + 0.5 && pane.top < innerHeight, besideList: !!pane && !!card && card.right <= pane.left + 0.5, nameClear: !!pane && !!name && name.right <= pane.left },
    scrolling: paneEl ? { scrollBox: /(auto|scroll)/.test(paneStyle.overflowY + paneStyle.overflowX), scrollers: [...document.querySelectorAll("main *")].filter(scrolls).length, head: !!head && !!close && head.top >= -0.5 && head.bottom <= innerHeight + 0.5 && close.width > 0 } : null,
    loading: !!content.querySelector("[data-testid=champion-preview-loading]"),
    noOpponents: !!content.querySelector("[data-testid=champion-preview-no-opponents]"),
    // Answered: the opponents' region says so (since 27 Nov 2026); the foot line, which comes only with an answer, for an older page.
    answered: !!content.querySelector("[data-testid=champion-preview-opponents][data-state=answered]") || !!content.querySelector("[data-testid=champion-preview-foot]"),
    opponents: opponents.map((o) => {
      const games = Number(o.getAttribute("data-games") ?? "0");
      // The row's own games cell: its count, "games" said with it ("7 games"; in the workspace the record follows: "7 games · 4W 3L, 4 wins 3 losses"); its win rate, quiet under 3 games.
      const words = clean(o.querySelector("[data-testid=opponent-games]"));
      const says = words === `${games} game${games === 1 ? "" : "s"}` || words.startsWith(`${games} game${games === 1 ? "" : "s"} · `);
      const rate = /^\d{1,3}%/.test(clean(o.querySelector("[data-testid=opponent-win-rate]")));
      return { games, says, rate, small: o.hasAttribute("data-small") };
    }),
    // One table: no fold of opponents behind a toggle (the "more opponents" folds until 25 Nov 2026).
    folded: content.querySelectorAll("[data-testid=champion-preview-more], [data-testid=champion-preview-more-listed]").length,
    lookup: lookup.length,
    // The link opens Champion Intel with the preview's champion and the opened opponent side by side.
    lookupPage: new URL(href || "/", location.origin).pathname === "/lookup",
    lookupChampion: !!opened && q.get("champion") === content.getAttribute("data-champion") && q.get("champion2") === opened,
    // Matchup Intel (since 27 Nov 2026): the preview's position as the lane (the bot lane's carry written BOTTOM).
    lookupLane: !!opened && q.get("lane") === ({ TOP: "TOP", JUNGLE: "JUNGLE", MID: "MID", ADC: "BOTTOM", SUPPORT: "SUPPORT" }[role] ?? "?"),
    address: { champion: new URLSearchParams(location.search).get("champion") === content.getAttribute("data-champion"), role: new URLSearchParams(location.search).get("crole") === role },
  };
}

/** The positions the preview may show (src/domain/roles.ts, the keys). */
const ROLE_KEY = /^(TOP|JUNGLE|MID|ADC|SUPPORT)$/;

/**
 * The row the preview is read from. In the workspace (the list in pages), the first with at least
 * `min` games on the list's second page where the list has one (the check turns to it first, so a jump
 * back to the first page shows in the browsing position); else the first with at least `min` games
 * below the first screen (the flow: a jump back to the top shows), else the first with `min` games,
 * or -1.
 */
export function targetRow(rows, min = 3) {
  const paged = rows.findIndex((r) => r.games >= min && r.page === 2);
  if (paged >= 0) return paged;
  const below = rows.findIndex((r) => r.games >= min && typeof r.top === "number" && typeof r.screen === "number" && r.top > r.screen && r.page == null);
  return below >= 0 ? below : firstWithGames(rows, min);
}

/** The index of the first row with at least `min` games, or -1. */
export function firstWithGames(rows, min = 3) {
  return rows.findIndex((r) => r.games >= min);
}

/**
 * What the check asserts about the preview read at `at` (readChampionPreview), with the step ↓ took
 * (`step`: the address replaced and the next row shown, or null when there is no next row) and what
 * Escape did (`escaped`). Each verdict: its name, PASS, FAIL or WARN, and what was found.
 */
export function championPreviewVerdicts({ kind, at, step, escaped, kept }) {
  const out = [];
  const fact = (name, ok, detail) => out.push({ name: `${kind}: ${name}`, status: ok ? "PASS" : "FAIL", detail });
  if (!at?.open) {
    fact("the preview of the first champion with 3+ games opens", false, { open: false });
    return out;
  }
  const m = /^(\d+) games? · (\d+)W (\d+)L$/.exec(at.record ?? "");
  const games = m ? Number(m[1]) : null;
  const wins = m ? Number(m[2]) : null;
  const losses = m ? Number(m[3]) : null;
  if (at.pane) fact("the preview opens in a pane beside the list (no window), within the screen, the list and the row's name clear of it", at.pane.pane && !at.pane.window && at.pane.within && at.pane.besideList && at.pane.nameClear, at.pane);
  if (at.scrolling) fact("the page is the one thing that scrolls: the pane has no scroll box of its own, nothing inside the page's main area scrolls, and the pane's header (the champion, ‹ › and Close) is on screen", !at.scrolling.scrollBox && at.scrolling.scrollers === 0 && at.scrolling.head, at.scrolling);
  fact("the preview of the first champion with 3+ games shows that champion: its portrait, its name, and the position it was played in most (the row's first position icon, chosen in the preview)", at.sameChampion && at.portrait && at.named && ROLE_KEY.test(at.role ?? "") && !!at.position?.chosen && !!at.position?.first, { sameChampion: at.sameChampion, portrait: at.portrait, named: at.named, role: ROLE_KEY.test(at.role ?? "") ? at.role : `other words (${(at.role ?? "").length} characters)`, position: at.position });
  fact('the preview says "N games · NW NL" for that position, its icon\'s games on the row (no more than the row\'s), the wins and losses adding up', !!m && games === at.roleGames && games <= (at.rowGames ?? 0) && wins + losses === games, { record: at.record, roleGames: at.roleGames, rowGames: at.rowGames });
  // The figure, then (under 5 games) the small sample's words read out after it.
  const rate = /^(\d{1,3})%(?:\s|$)/.exec(at.winRate ?? "");
  fact("the preview shows the win rate, the wins over the games", !!rate && !!m && games > 0 && Math.abs(Number(rate[1]) - (100 * wins) / games) <= 0.5 + 1e-9, { winRate: at.winRate, record: at.record });
  if (at.loading || at.answered === false) fact("the opponents loaded", false, { loading: at.loading, answered: at.answered });
  else if (at.noOpponents) out.push({ name: `${kind}: skipped: no lane opponent is known for this champion yet (its rows, the link to Champion Intel)`, status: "WARN", detail: { opponents: 0 } });
  else {
    const list = at.opponents ?? [];
    fact('every opponent row carries its "N games" and its win rate, and there is at least one', list.length > 0 && list.every((o) => o.games > 0 && o.says && o.rate), { rows: list.length, without: list.filter((o) => !(o.games > 0 && o.says && o.rate)).length });
    fact("the lane opponents shown are most games first, the small samples (1–2 games) marked, none folded away (every opponent through the pages: the workspace's facts)", (at.folded ?? 0) === 0 && list.every((o, i) => i === 0 || list[i - 1].games >= o.games) && list.every((o) => o.small === o.games < 3), { rows: list.length, folded: at.folded ?? 0, small: list.filter((o) => o.small).length });
    fact("an opened opponent shows one link to Matchup Intel: both champions side by side and the position as its lane (champion=, champion2=, lane=)", at.lookup === 1 && at.lookupPage && at.lookupChampion && at.lookupLane === true, { links: at.lookup, page: at.lookupPage, champions: at.lookupChampion, lane: at.lookupLane });
  }
  if (step === null) out.push({ name: `${kind}: skipped: ↓ has no next row (the list has one champion)`, status: "WARN", detail: null });
  else fact("↓ moves the preview to the next row, replacing the address (no new history entry)", step.next && step.address && step.replaced, step);
  fact("Escape closes the preview and takes it out of the address", escaped.closed && escaped.address, escaped);
  // The browsing position (row 4.5d). In the workspace, the list stays on its page: the page and every drawn row's top
  // (±1px) as they were, with the preview open and after Escape; a list of one page is not applicable. In the flow, the
  // page scrolled to the row first, the row where it was (±3px) with the preview open and after Escape.
  if (kept && typeof kept.pages === "number") {
    if (kept.pages <= 1) out.push({ name: `${kind}: the browsing position kept while the preview opens and closes`, status: "PASS", detail: { notApplicable: "the list is one page", ...kept } });
    else fact("the browsing position: the list stays on its page (its page and every row's top, ±1px) while the preview opens and after Escape", kept.pageOpen === kept.pageBefore && kept.pageClosed === kept.pageBefore && Math.abs(kept.open) <= 1 && Math.abs(kept.closed) <= 1, kept);
  } else if (kept) {
    if (!(kept.scrolled > 0)) out.push({ name: `${kind}: the browsing position kept while the preview opens and closes`, status: "PASS", detail: { notApplicable: "the list fits the first screen, so it cannot be scrolled", ...kept } });
    else fact("the browsing position: with the list scrolled to the row, the row stays where it was (±3px) while the preview opens and after Escape", Math.abs(kept.open) <= 3 && Math.abs(kept.closed) <= 3, kept);
  }
  return out;
}
