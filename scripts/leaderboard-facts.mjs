/*
  Team Leaderboards' 30-day rule, as the Production check sees the page (Release 19, the owner's
  request of 26 Nov 2026, item 7; docs/LIVE_VALIDATION.md, "What it checks"). The protected
  `leaderboard-audit` job re-derives who is active from the database independently and answers a
  count; the Production check's workflow passes it as LIVE_ACTIVE_PLAYERS (with
  LIVE_LEADERBOARD_BOUNDARY, the members whose 30-day edge falls within an hour of the audit). The
  page loaded here must show that many active players: a member who crossed the edge between the
  job and the page explains a difference only while the boundary count is above 0 (then a
  warning). Every board's rows are among the active players, and Recent form lists full windows
  of 20 games only. Counts only: no name, id or address leaves the page.
*/

/** In the page (self-contained, for page.evaluate): the scope's count and each board's rows and players, as counts. */
export function readLeaderboardScope() {
  const scope = document.querySelector("[data-testid=scope-count]");
  const grid = document.querySelector("[data-testid=leaderboards-grid]") ?? document;
  const ids = new Set();
  for (const el of grid.querySelectorAll("[data-player-id]")) {
    const v = el.getAttribute("data-player-id");
    if (v) ids.add(v);
  }
  for (const a of grid.querySelectorAll('a[href^="/players/"]')) {
    const m = /^\/players\/([^/?#]+)/.exec(a.getAttribute("href") ?? "");
    if (m) ids.add(m[1]);
  }
  const rows = [...document.querySelectorAll("[data-testid=form-row]")];
  const partial = rows.filter((r) => {
    const bar = r.querySelector("[data-testid=form-bar]");
    return !bar || Number(bar.getAttribute("data-known")) !== 20 || bar.querySelectorAll("[data-state=missing]").length > 0 || Number(r.getAttribute("data-games")) !== 20;
  }).length;
  return {
    scopeCount: scope ? Number(scope.getAttribute("data-count")) : null,
    form: rows.length,
    partialForm: partial,
    multikills: document.querySelectorAll("[data-testid=multikill-row]").length,
    players: ids.size,
    empty: !!document.querySelector("[data-testid=leaderboards-empty]"),
  };
}

/**
 * The verdicts: the page's count against the audit's (when the workflow passed one), every board
 * within it, and Recent form's full windows. `active` and `boundary` are the audit's counts, or null.
 */
export function leaderboardScopeVerdicts({ kind, read, active, boundary }) {
  const out = [];
  if (!read || read.scopeCount === null || Number.isNaN(read.scopeCount)) {
    out.push({ name: `${kind}: the page counts its active players`, status: read?.empty ? "PASS" : "FAIL", detail: read?.empty ? "not applicable: the boards are empty" : "no scope count on the page" });
    return out;
  }
  const name = `${kind}: the page shows as many active players as the leaderboard audit derives from the database (a counted game and a successful update within 30 days)`;
  if (active === null || active === undefined || Number.isNaN(active)) out.push({ name, status: "WARN", detail: { shown: read.scopeCount, audit: "not compared: no audit count (LIVE_ACTIVE_PLAYERS unset: no CRON_SECRET, a local run, or the job not deployed yet)" } });
  else if (read.scopeCount === active) out.push({ name, status: "PASS", detail: { shown: read.scopeCount, audit: active } });
  else out.push({ name, status: (boundary ?? 0) > 0 ? "WARN" : "FAIL", detail: { shown: read.scopeCount, audit: active, membersAtTheEdge: boundary ?? 0, note: (boundary ?? 0) > 0 ? "a member's 30 days ended between the audit and this page" : "no member was at the 30-day edge" } });
  const within = read.form <= read.scopeCount && read.multikills <= read.scopeCount && read.players <= read.scopeCount;
  out.push({ name: `${kind}: every board's rows are among the active players (Recent form, the multikills, every player linked)`, status: within ? "PASS" : "FAIL", detail: { active: read.scopeCount, recentForm: read.form, multikills: read.multikills, playersLinked: read.players } });
  const full = `${kind}: Recent form lists full windows of 20 games only`;
  out.push(read.form === 0 ? { name: full, status: "PASS", detail: "not applicable: no Recent form row" } : { name: full, status: read.partialForm === 0 ? "PASS" : "FAIL", detail: { rows: read.form, partial: read.partialForm } });
  return out;
}

/** The audit's counts from the environment the workflow sets (numbers, or null when unset). */
export function auditCounts(env = process.env) {
  const n = (v) => (v === undefined || v === "" || !/^\d+$/.test(String(v)) ? null : Number(v));
  return { active: n(env.LIVE_ACTIVE_PLAYERS), boundary: n(env.LIVE_LEADERBOARD_BOUNDARY) };
}
