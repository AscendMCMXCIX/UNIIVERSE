/*
  ALL CHAMPIONS' PREVIEW in the Production check (scripts/live-check.mjs, championPreviewFacts;
  docs/LIVE_VALIDATION.md, "What it checks"; PLAN §6 rows 4.5a–4.10): on the desktop, the preview of
  the first champion on the teammate's list with at least 3 games, read in the page, and what the
  check asserts about it, apart from the browser so a unit test can hand it any state
  (src/server/ops/live-check-champion-preview.test.ts).

  Read in the page only: counts, true or false and the preview's fixed words ("12 games · 7W 5L",
  "58%", "Top"). The champion's own name is compared in the page, never returned; no player's name,
  no address and no id leaves it.
*/

/** The rows the list shows, in order: each one's games and whether it is the open one (self-contained, for evaluate). */
export function readChampionRows() {
  return [...document.querySelectorAll("[data-testid=top-champion]")].map((r) => ({ games: Number(r.getAttribute("data-games") ?? "0"), open: r.getAttribute("data-selected") === "true" || r.querySelector("[data-open-champion][aria-expanded=true]") !== null }));
}

/** The open preview, read in the page (self-contained, for evaluate). `rowIndex` is the row it was opened from. */
export function readChampionPreview(rowIndex) {
  const clean = (el) => el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const content = document.querySelector("[data-testid=champion-preview-content]");
  const rows = [...document.querySelectorAll("[data-testid=top-champion]")];
  const row = rows[rowIndex] ?? null;
  if (!content) return { open: false };
  const header = content.querySelector("header");
  const portrait = header?.firstElementChild ?? null;
  const box = portrait?.getBoundingClientRect();
  const img = portrait?.tagName === "IMG" ? portrait : null;
  const title = clean(content.querySelector("[data-testid=champion-preview-title]"));
  const rowName = clean(row?.querySelector("[data-open-champion]"));
  const figures = content.querySelector("[data-testid=champion-preview-figures]");
  const opponents = [...content.querySelectorAll("[data-testid=champion-preview-opponent]")];
  const intel = [...content.querySelectorAll("[data-testid=champion-preview-intel]")];
  const href = intel[0]?.getAttribute("href") ?? "";
  const q = new URL(href || "/", location.origin).searchParams;
  return {
    open: true,
    // The champion and role the preview shows against the row it was opened from (compared here, not returned).
    sameChampion: !!row && content.getAttribute("data-champion") === row.getAttribute("data-champion") && content.getAttribute("data-role") === row.getAttribute("data-role"),
    rowGames: Number(row?.getAttribute("data-games") ?? "0"),
    portrait: !!box && box.width >= 40 && box.height >= 40 && (!img || (img.getAttribute("alt") ?? "") === title),
    named: title.length > 0 && title === rowName,
    role: clean(header?.querySelector("h2 + p")),
    record: clean(figures?.lastElementChild),
    winRate: clean(figures?.firstElementChild?.firstElementChild),
    loading: !!content.querySelector("[data-testid=champion-preview-loading]"),
    noOpponents: !!content.querySelector("[data-testid=champion-preview-no-opponents]"),
    opponents: opponents.map((o) => {
      const games = Number(o.getAttribute("data-games") ?? "0");
      // The row's own "N games" (its figures are spans side by side, so each is read on its own).
      const says = [...o.querySelectorAll("button > span")].some((sp) => clean(sp) === `${games} game${games === 1 ? "" : "s"}`);
      return { games, says };
    }),
    intel: intel.length,
    intelChampion: q.get("champion") === content.getAttribute("data-champion"),
    intelVs: !!q.get("vs") && q.get("vs") === opponents.find((o) => o.querySelector("button[aria-expanded=true]"))?.getAttribute("data-champion"),
    address: { champion: new URLSearchParams(location.search).get("champion") === content.getAttribute("data-champion") },
  };
}

/** The roles the preview's header may name (src/domain/roles.ts, ROLE_LABELS), "· In pool" after it or not. */
const ROLE_LINE = /^(Top|Jungle|Mid|Bottom|Support)( · In pool)?$/;

/** The index of the first row with at least `min` games, or -1. */
export function firstWithGames(rows, min = 3) {
  return rows.findIndex((r) => r.games >= min);
}

/**
 * What the check asserts about the preview read at `at` (readChampionPreview), with the step ↓ took
 * (`step`: the address replaced and the next row shown, or null when there is no next row) and what
 * Escape did (`escaped`). Each verdict: its name, PASS, FAIL or WARN, and what was found.
 */
export function championPreviewVerdicts({ kind, at, step, escaped }) {
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
  fact("the preview of the first champion with 3+ games shows that champion: its portrait, its name and its role", at.sameChampion && at.portrait && at.named && ROLE_LINE.test(at.role ?? ""), { sameChampion: at.sameChampion, portrait: at.portrait, named: at.named, role: ROLE_LINE.test(at.role ?? "") ? at.role : `other words (${(at.role ?? "").length} characters)` });
  fact('the preview says "N games · NW NL", the row\'s games, the wins and losses adding up', !!m && games === at.rowGames && wins + losses === games, { record: at.record, rowGames: at.rowGames });
  const rate = /^(\d{1,3})%$/.exec(at.winRate ?? "");
  fact("the preview shows the win rate, the wins over the games", !!rate && !!m && games > 0 && Math.abs(Number(rate[1]) - (100 * wins) / games) <= 0.5 + 1e-9, { winRate: at.winRate, record: at.record });
  if (at.loading) fact("the opponents loaded", false, { loading: true });
  else if (at.noOpponents || at.opponents.length === 0) out.push({ name: `${kind}: skipped: no lane opponent is known for this champion yet (its rows, the link to Matchup Intel)`, status: "WARN", detail: { opponents: 0 } });
  else {
    fact('every opponent row carries its "N games"', at.opponents.every((o) => o.games > 0 && o.says), { rows: at.opponents.length, without: at.opponents.filter((o) => !(o.games > 0 && o.says)).length });
    fact("an opened opponent shows one link to Matchup Intel, with champion= and vs= the pair", at.intel === 1 && at.intelChampion && at.intelVs, { links: at.intel, champion: at.intelChampion, vs: at.intelVs });
  }
  if (step === null) out.push({ name: `${kind}: skipped: ↓ has no next row (the list has one champion)`, status: "WARN", detail: null });
  else fact("↓ moves the preview to the next row, replacing the address (no new history entry)", step.next && step.address && step.replaced, step);
  fact("Escape closes the preview and takes it out of the address", escaped.closed && escaped.address, escaped);
  return out;
}
