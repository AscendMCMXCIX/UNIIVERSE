#!/usr/bin/env node
/*
  Read-only live validation of the deployed site (docs/LIVE_VALIDATION.md → "Automated live check").

    node scripts/live-check.mjs [base url] [output folder]

  - base url: default https://team-uniiverse.vercel.app
  - output folder: default live-check-<UTC time>; screenshots, report.json and summary.md go there
  - sign-in: UNIIVERSE_VERIFY_USER and UNIIVERSE_VERIFY_PASSWORD, a non-admin account kept off the
    roster. They are read from the environment and never printed or written anywhere.
  - LIVE_LOCAL=1 checks a local demo build instead (`pnpm start` with the browser tests' demo
    settings): no sign-in, and the security checks are skipped.
  - Without a sign-in (no verification account yet), the public run: the deployed commit, health,
    the signed-out and forged-session checks, the security headers, the Riot checks, and the public
    pages at every width (no errors, no sideways scroll, no serious axe violation); the signed-in
    checks are reported as pending, not failed. LIVE_REQUIRE_SIGN_IN=1 makes a missing sign-in a
    failure.
  - EXPECTED_COMMIT: the commit just deployed (GitHub's Production check passes it): the check waits
    up to LIVE_WAIT_SECONDS (default 300) for production to answer from it, and fails otherwise.

  It only reads. It signs in, opens pages, opens and closes games and windows, switches a view, and
  presses Back, Tab, Enter and Escape. It never submits a form after signing in, and never presses a
  bookmark, edit, save, sync, refresh, invite or admin control; its other requests are GETs. As
  with any member's visit, an open game can start the app's own background reads (rank checks).

  Checks:
  - security (#170): signed-out and forged-cookie requests to member and admin pages, including a
    real member's profile, champions, matches and Riot Accounts (the id from the roster, or without
    a sign-in from the public team page's cards), are turned away to the sign-in page and carry no
    player or admin data; since 19 Nov 2026 every Admin Mode page (access levels, personal data,
    branding, previews, resources and Settings too) and both sign-in previews are among them. The
    members' API routes answer 401 to both, and the jobs endpoint 401 without the scheduler's
    secret or with a wrong one; security headers on the sign-in page. Signed in as the
    verification account (a standard member), every Admin Mode page and both previews, and the
    jobs' freshness, are refused and the mode switch keeps Player Mode (GET requests only, no page).
  - health notices (19 Nov 2026): each of /api/health's notices (the five-minute rank schedule
    turned off after it was on, jobs set to 0 in Admin) is a warning, never a failure: the day it
    was turned off, never who.
  - riot (docs/RIOT_COMPLIANCE.md), signed out: /riot.txt, the code Riot's Developer Portal fetches,
    is served as plain text; public Riot data is off, as a Personal key requires
    (/public/leaderboards is not found and the public team page shows no rank); the public team
    page shows Riot's required notice, and neither its HTML nor the RSC payload in it has a
    puuid, gameName, tagLine or riotId key (scripts/riot-keys.mjs; counts only).
  - frame (#178): the charcoal frame token; the sidebar, open and folded, with the gradient bar on
    the current page; the phone and tablet top bar and the phone's tab bar; the tablet's destinations
    in its top bar, one tap each, with no drawer (frames by posture); one set of destinations
    everywhere (navigation N1, 19 Nov 2026): the sidebar's entries, the tablet's destinations and the
    phone's tab bar are My Profile, Team, Matchup Intel and Resources, in that order, Matchup Intel at
    /resources/matchups, the phone's four each named in full at 390px (Matchup Intel and Resources
    tabs, not account screen rows), and on Team the phone's top bar holds Team's sections as its second
    row; held sideways (844 × 390, in the phone's context: two page loads) one compact bar holding the
    same four and no bottom bar, Team's sections or the teammate's profile's under it, the bars at
    rest at most 90px and the profile's band at most 80px. Phone: the avatar opens the account screen
    on the first tap, made as soon as it is on screen; the screen comes to rest (its motion run and
    dropped) filling the screen exactly, nothing in it scrolls, every control in it is a full-width
    target at least 48px tall reached by a tap where it is drawn, the screen itself has the focus, it
    holds the account's own items only (Settings, Install App where offered, the mode switch for an
    administrator, Sign out) and no destination, and Sign out is in view. Tablet and desktop: the
    account menu opens on the first tap or click on its avatar or tile, made as soon as it is on
    screen.
  - Team Overview (November 2026: the approved design, before #275), on whatever lineup production
    has: at 1440 the lineup centred in the height under the section tabs (or starting at the top
    when taller than the window), and the header's 80px logo and "Team Overview" eyebrow with the
    five cards on the stage's floor, hidden from screen readers; on the phone the first lineup card
    above the tab bar; at every width no bench of substitutes under the lineup (a substitute is on
    their starter's card). A fact whose precondition does not hold (no lineup five across, no tab
    bar) passes as not applicable, with the reason.
  - All Champions (#178): compact rows, sorted by games, no heading cut short.
  - leaderboards (PR 5a): Recent form's rows of two lines are at most 72px on the phone, 64px on the
    tablet and 56px at 1440 (rows of more lines, a long name or a wrapped second line, are counted,
    not failed); a shared place is titled "Tied for Nth" and no other place claims it; every row's bar
    has 20 segments, as many filled as the row's wins and as many missing as its window lacks. Counts,
    heights and true/false only: the rows carry names.
  - multikills (Release 15, scripts/multikill-facts.mjs): at every width, the multikill board says what
    its score is compared with and explains it behind its ⓘ; ranked members in score order, a place
    shared exactly on equal scores, the crown on first, provisional and too-few-games members after;
    each row's shown counts each multikill once (its Riot counters read by the rule the ⓘ states);
    each row's kinds in words its own counts, rarest first; the most of each kind the board's highest
    counts; no row taller than 66px. Counts, scores and fixed words only.
  - records (19 Nov 2026: Recent form and the season's records and achievements on one page): on
    /leaderboards, at 1440, the season records stand beside the multikills (their tops within 1px), and
    every record cell, at its own height (not the taller neighbour's its grid row stretches it to), is
    no taller than its layout allows: two lines (from a 36rem cell) at most 72px, three lines (under it)
    at most 96px (cells of more lines, a long name or champion, are counted, not failed; the
    verification account has no profile, so no cell carries "Your best"). At every width,
    Records & achievements' old address (/leaderboards?view=records) opens the same page, the view gone
    from its address, at the season records (in view, focused). Counts, heights and true/false only.
  - settings: the picture and display-name help name the public team page, and Settings never
    mentions a Public profile switch (retired; true or false only); on the phone, Sign out is on
    Settings' first screen (above the tab bar).
  - resources (the Library): every section under its h2 and every row a link to a new tab with
    noopener and noreferrer; the index offers All, Favourites and each section, and choosing a
    section shows that section alone, as many rows as its segment counts; no title cut short and no
    broken site icon. No site's own icon is asked for: once any route is installed (the vitals
    route, and the Library's own below), Playwright itself aborts every request for /favicon.ico,
    unreported, so every row shows its stand-in. Counts only.
  - games (#178): Team Matches opens a game under its card (no window), with ?match= in the address;
    Match History's post-game view (S6) has no tabs, fits one screen with its card at 1440×900, keeps
    the open header in place on Next and closes on Back; a phone's window has Previous and Next, Next
    replacing the address;
    on the tablet and the desktop a game with 4 or more members lists them in two columns;
    a copied link opens it; Back returns to it; the keyboard toggles it; "Close this game" closes it
    and keeps the focus on the card. Match History opens games under their cards; at 1440 the
    first three cards' CS totals and damage shares end before the next column (the build or the
    teams), and a copy of a card with the widest K/D/A and the longest champion names stays level
    with it and keeps the names whole; on the phone (390x844) the first game card is complete above
    the tab bar; its Encounters view still opens. All Champions' preview: on the desktop and the
    tablet unfolded under its row (Champion, Games and Win rate in place, the page not scrolled,
    nothing scrolling inside), Escape and Back close it; on the phone a sheet, which Back closes;
    phone rows at most 64px. The open game's post-game view has no notes and no folds.
  - accessibility (#173): axe (WCAG 2.1 A and AA, plus label-content-name-mismatch) on the main pages
    at every width, with a game open, and in All Champions' preview: no serious or critical violation.
  - players (the roster board, Nov 2026), at every width: one profile link per listed player, and no
    pool counts "+1"; on the phone every roster row of two lines is at most 72px tall; at 1440 with
    the sidebar open the roster shows two columns once it lists two or more players. A roster too
    small for a fact passes it as not applicable.
  - navigation (#266): on the phone a teammate's profile opened from the scrolled Players list starts
    at its top and Back returns to the list at its place (not applicable when the list fits the
    screen); on the desktop Skip to content is the first Tab stop and moves focus to the page.
  - wide (PR 10): the desktop context made 2560 × 1440 opens Team, Players, Leaderboards and the
    teammate's profile (as every page, with axe): each tab row's first tab starts where its page's
    column does (within 1px; on Team Overview Team's 100rem column, its header's inset reported), a
    missing row failing, and Team's row is in the same place on its three sections; on each of Team's
    three, Team's tabs scroll sideways only (18 Nov 2026): no scroll box in the row overflows up and
    down or can scroll that way, the list hides its scrollbar, and the current tab's bar is inside
    its tab (the root size is 20.6px there, where the bar used to reach past it); on Leaderboards
    Recent form stands beside the season records (their tops within 1px), every record on the first
    screen, and the milestones stand right under Recent form, in its column, whatever the records'
    column beside them holds (19 Nov 2026).
  - ranked (18 Nov 2026): on the teammate's profile at every width, Ranked progress ends with its
    chart: no History and coverage disclosure, year strip, rank changes or readings table (a profile
    without the card passes as not applicable). True or false only.
  - reach (PR 2b; S4a, 20 Nov 2026): from the end of Match History, on the desktop and the tablet the
    pinned row offers Filters and it opens the Filters popover (anchored, no modal window, "Support"
    whole and nothing in it scrolling sideways); on the phone the top bar's Filters opens the filter
    sheet (Escape closes either again; no filter is touched).
  - every page at every width: it loads signed in, no sideways scroll, no page error, no app console
    error, no failed request to the app, no broken image from the app, and a screenshot to review.
*/
import { chromium } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { redact } from "./redact.mjs";
import { riotKeysOnPage } from "./riot-keys.mjs";
import { rosterRowLines } from "./roster-lines.mjs";
import { matchupIntelVerdicts, readMatchupIntel } from "./matchup-intel-facts.mjs";
import { matchupRolesVerdicts, readRoleBar } from "./matchup-roles-facts.mjs";
import { postGameVerdicts, readPostGame } from "./post-game-facts.mjs";
import { championPreviewVerdicts, readChampionPreview, readChampionRows, targetRow } from "./champion-preview-facts.mjs";
import { multikillVerdicts, readMultikillBoard } from "./multikill-facts.mjs";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const base = (process.argv[2] ?? "https://team-uniiverse.vercel.app").replace(/\/$/, "");
const out = process.argv[3] ?? `live-check-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}Z`;
const local = process.env.LIVE_LOCAL === "1";
const user = process.env.UNIIVERSE_VERIFY_USER;
const password = process.env.UNIIVERSE_VERIFY_PASSWORD;
const signedIn = local || !!(user && password);
const expected = (process.env.EXPECTED_COMMIT ?? "").trim().slice(0, 7);
const waitSeconds = Number(process.env.LIVE_WAIT_SECONDS ?? 300);
mkdirSync(out, { recursive: true });

const report = { base, startedAt: new Date().toISOString(), local, deployment: null, checks: [], axe: [], pages: [], blockedByEnvironment: 0 };
const redactValue = (value) => (value === undefined || value === null ? value ?? null : JSON.parse(redact(JSON.stringify(value))));

function check(area, name, status, detail) {
  report.checks.push({ area, name: redact(name), status, detail: redactValue(detail) });
  const shown = detail === undefined ? "" : `  ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
  console.log(redact(`${status.padEnd(4)} [${area}] ${name}${shown.slice(0, 400)}`));
}
const pass = (area, name, ok, detail) => check(area, name, ok ? "PASS" : "FAIL", detail);
const warn = (area, name, detail) => check(area, name, "WARN", detail);
async function guarded(area, name, fn) {
  try {
    await fn();
  } catch (e) {
    check(area, name, "FAIL", `stopped: ${String(e?.message ?? e).split("\n")[0].slice(0, 300)}`);
  }
}

// ── HTTP, through curl (it follows the environment's proxy and certificates) ────────────────────
function http(path, cookie, headers = []) {
  const head = `${out}/.headers`, body = `${out}/.body`;
  const args = ["-s", "--max-time", "30", "-D", head, "-o", body, "-w", "%{http_code}|%{redirect_url}|%{time_total}"];
  if (cookie) args.push("-H", `Cookie: ${cookie}`);
  for (const h of headers) args.push("-H", h);
  args.push(`${base}${path}`);
  try {
    const [status, redirect = "", seconds = "0"] = execFileSync("curl", args, { encoding: "utf8" }).trim().split("|");
    return { status: Number(status), redirect, seconds: Number(seconds), headers: readFileSync(head, "utf8").toLowerCase(), text: readFileSync(body, "utf8") };
  } catch (e) {
    return { status: 0, redirect: "", seconds: 0, headers: "", text: "", error: String(e?.message ?? e).slice(0, 200) };
  } finally {
    rmSync(head, { force: true });
    rmSync(body, { force: true });
  }
}
const turnedAway = (r) => ((r.status >= 300 && r.status < 400 && /\/login/.test(r.redirect)) || r.status === 401 || r.status === 403);
/** Admin Mode's pages the security facts reach since 19 Nov 2026, and the sign-in previews (Platform Settings → Previews). */
const ADMIN_PAGES_LATER = ["/admin/people/access", "/admin/people/privacy", "/admin/branding", "/admin/previews", "/admin/resources"];
const PREVIEW_PAGES = ["/preview/login", "/preview/setup"];
/** What only Admin Mode's pages carry (their test ids and the dashboard's data), in a body or a redirect's. */
const ADMIN_MARKERS = /admin-dashboard|dashboard-accounts|admin-activity|system-status|health-answers|adminAccounts/;
const leaks = (r) => /puuid|data-player-id|data-player-name|gameName|tagLine/i.test(r.text) || ADMIN_MARKERS.test(r.text);

/** Production's health and commit; with EXPECTED_COMMIT, waits for the deployment to answer from it. */
async function deployment() {
  const deadline = Date.now() + (expected ? waitSeconds * 1000 : 0);
  let health;
  for (;;) {
    health = http("/api/health");
    let body = null;
    try {
      body = JSON.parse(health.text);
    } catch {
      body = null;
    }
    report.deployment = body?.deployment ?? null;
    report.health = body ? { ok: body.ok === true, db: body.db?.ok ?? null, notices: Array.isArray(body.notices) ? body.notices.length : null, patch: typeof body.patch === "string" ? body.patch : null } : null;
    report.healthNotices = Array.isArray(body?.notices) ? body.notices : [];
    if (!expected || report.deployment?.commit === expected || Date.now() > deadline) break;
    await new Promise((r) => setTimeout(r, 15_000));
  }
  pass("deploy", "the site answers /api/health, with the app and its database ok", health.status === 200 && report.health?.ok === true && report.health?.db !== false, { status: health.status, health: report.health });
  // What is off by choice (server/ops/health-notices.ts): a warning each, never a failure. The
  // endpoint's words only (what is off, since which day); who turned it off is in Admin's Audit Logs.
  for (const notice of report.healthNotices) warn("health", `/api/health notice: ${String(notice?.message ?? notice?.kind ?? "unnamed").slice(0, 200)}`, { kind: notice?.kind ?? null, since: notice?.since ?? null, jobs: notice?.jobs ?? null });
  if (expected) pass("deploy", `production answers from the commit just deployed (${expected})`, report.deployment?.commit === expected, { answering: report.deployment?.commit ?? null, waitedUpToSeconds: waitSeconds });
  else check("deploy", "the deployed commit", "PASS", report.deployment?.commit ?? "unknown");
  // Response times, measured where the check runs: slow is a warning (a cold start can be), not a failure.
  for (const path of ["/api/health", "/login"]) {
    const r = path === "/api/health" ? health : http(path);
    report.timings = { ...(report.timings ?? {}), [path]: r.seconds };
    if (r.seconds > 3) warn("performance", `${path} answered slowly`, `${r.seconds.toFixed(2)} s`);
    else check("performance", `${path} answered in ${r.seconds.toFixed(2)} s`, "PASS", r.seconds);
  }
}

/**
 * A member's player id as the public team page carries it (its cards' data, or a picture's
 * address), so a run without a sign-in can still try a real member's own pages: the profile
 * pages #170 closed to signed-out and forged-session requests.
 */
function publicPlayerId() {
  const page = http("/public");
  if (page.status !== 200) return null;
  return /(?:\/api\/public\/avatars\/|player\\?":\{\\?"id\\?":\\?")([A-Za-z0-9_-]{8,})/.exec(page.text)?.[1] ?? null;
}

function healthAndSecurity(playerId) {
  if (local) return warn("security", "security checks skipped", "LIVE_LOCAL=1: the demo build has no sign-in");
  const forged = `uniiverse_session=s1.${"x".repeat(40)}`;
  // Every Admin Mode page (#258; the rest since 19 Nov 2026) and the sign-in previews Admin Mode
  // opens. /admin/users and /admin/players redirect to /admin/people; /admin/public-access to /admin/branding#brand-public.
  // (Written out, not spread: src/server/ops/live-check-boundary.test.ts reads this list against docs/LIVE_VALIDATION.md.)
  const paths = ["/team", "/players", "/matches", "/leaderboards", "/overview", "/overview/accounts", "/me", "/settings", "/resources/matchups", "/admin", "/admin/players", "/admin/people", "/admin/audit", "/admin/system", "/admin/data", "/admin/people/access", "/admin/people/privacy", "/admin/branding", "/admin/previews", "/admin/resources", "/admin/settings", "/preview/login", "/preview/setup"];
  playerId ??= publicPlayerId();
  if (playerId) paths.push(`/players/${playerId}`, `/players/${playerId}/champions`, `/players/${playerId}/matches`, `/players/${playerId}/accounts`);
  else warn("security", "a member's own pages were not tried", "no player id: not signed in, and the public team page lists no member");
  for (const path of paths) {
    const anon = http(path);
    pass("security", `signed out: ${path} is turned away to sign-in, with no player data`, turnedAway(anon) && !leaks(anon), { status: anon.status, to: anon.redirect.replace(base, ""), leak: leaks(anon) });
    const fake = http(path, forged);
    pass("security", `forged session cookie: ${path} is turned away, with no player data`, turnedAway(fake) && !leaks(fake), { status: fake.status, to: fake.redirect.replace(base, ""), leak: leaks(fake) });
  }
  // The members' API routes: 401 exactly (the proxy signed out, the handlers with a forged session), never a redirect.
  const none = "00000000-0000-4000-8000-000000000000";
  for (const path of ["/api/freshness?scope=team", `/api/avatars/${none}?v=1`, `/api/card-banners/${none}?v=1`]) {
    const anon = http(path);
    pass("security", `signed out: ${path} answers 401`, anon.status === 401, { status: anon.status });
    const fake = http(path, forged);
    pass("security", `forged session cookie: ${path} answers 401`, fake.status === 401, { status: fake.status });
  }
  // The jobs endpoint, before it opens the database: no secret, or a wrong one.
  const noKey = http("/api/jobs/tick");
  pass("security", "the jobs endpoint without the scheduler's secret answers 401", noKey.status === 401, { status: noKey.status });
  const wrongKey = http("/api/jobs/tick", undefined, ["Authorization: Bearer not-the-cron-secret"]);
  pass("security", "the jobs endpoint with a wrong secret answers 401", wrongKey.status === 401, { status: wrongKey.status });
  const login = http("/login");
  pass("security", "sign-in page: X-Content-Type-Options nosniff", /x-content-type-options:\s*nosniff/.test(login.headers));
  pass("security", "sign-in page: Strict-Transport-Security", /strict-transport-security:/.test(login.headers));
  pass("security", "sign-in page: framing refused (frame-ancestors or X-Frame-Options)", /frame-ancestors|x-frame-options:/.test(login.headers));
  pass("security", "sign-in page: Referrer-Policy", /referrer-policy:/.test(login.headers));
}

/** A rank as the app draws one: a tier crest, LP, or a tier and division ("Gold II"). */
const RANK = /ranked-mini-crests|\b\d{1,4} LP\b|\b(?:Iron|Bronze|Silver|Gold|Platinum|Emerald|Diamond) (?:I|II|III|IV)\b/g;

/** What a Personal key's terms require of the pages anyone can open (docs/RIOT_COMPLIANCE.md). */
function riotCompliance() {
  if (local) return warn("riot", "Riot checks skipped", "LIVE_LOCAL=1: the demo build's settings are not production's");
  const code = http("/riot.txt");
  // Only its size is reported: the code is public, but nothing needs it in a report.
  pass("riot", "/riot.txt, the code Riot's Developer Portal checks, is served signed out as plain text", code.status === 200 && /content-type:\s*text\/plain/.test(code.headers) && code.text.trim().length > 0, { status: code.status, to: code.redirect.replace(base, ""), bytes: code.text.length });
  const board = http("/public/leaderboards");
  pass("riot", "public Riot data is off, as a Personal key requires: /public/leaderboards is not found", board.status === 404, { status: board.status, to: board.redirect.replace(base, "") });
  const team = http("/public");
  if (team.status !== 200) return check("riot", "public team page", "PASS", "not turned on: no public page to check");
  const ranks = [...new Set(team.text.match(RANK) ?? [])].slice(0, 3);
  pass("riot", "the public team page shows no rank (no Riot API data)", ranks.length === 0, ranks);
  pass("riot", "the public team page shows Riot's required notice", /endorsed by Riot Games/.test(team.text));
  // No Riot account key in anything the page carries, its RSC payload included (scripts/riot-keys.mjs):
  // CI pins the public card's fields, this reads the page production serves. Counts only.
  const riotKeys = riotKeysOnPage(team.text);
  pass("riot", "the public team page's HTML and RSC payload carry no puuid, gameName, tagLine or riotId key", riotKeys.total === 0 && riotKeys.chunks > 0 && riotKeys.unreadable === 0, { ...riotKeys.keys, payloadChunks: riotKeys.chunks, unreadableChunks: riotKeys.unreadable });
}

/**
 * Signed in as the verification account, a standard member: Admin Mode stays closed, every page of
 * it and both sign-in previews (a preview sends a member home, "/"). Requests only (no page, so no
 * document is loaded and no field measurement is sent), GET only, and only the status, the address
 * it is sent to and true/false are reported.
 */
async function memberRefusals(context) {
  const outsideAdmin = (to) => !!to && !new URL(to, base).pathname.startsWith("/admin") && !new URL(to, base).pathname.startsWith("/login");
  for (const path of ["/admin", "/admin/people", "/admin/audit", "/admin/system", "/admin/data", "/admin/settings", ...ADMIN_PAGES_LATER, ...PREVIEW_PAGES]) {
    const res = await context.request.get(`${base}${path}`, { maxRedirects: 0 });
    const to = res.headers()["location"] ?? "";
    const marker = ADMIN_MARKERS.test(await res.text());
    pass("security", `signed in as a member: ${path} is turned away from Admin Mode, with no admin data`, res.status() >= 300 && res.status() < 400 && outsideAdmin(to) && !marker, { status: res.status(), to: to.replace(base, ""), marker });
  }
  const jobs = await context.request.get(`${base}/api/freshness?scope=jobs`);
  pass("security", "signed in as a member: the jobs' freshness answers 403", jobs.status() === 403, { status: jobs.status() });
  // The switch sends a member back to Player Mode; it clears the view cookie, never sets it to admin.
  const mode = await context.request.get(`${base}/api/mode?to=admin`, { maxRedirects: 0 });
  const to = mode.headers()["location"] ?? "";
  const adminCookie = /uniiverse_view=admin/.test(mode.headers()["set-cookie"] ?? "");
  pass("security", "signed in as a member: the mode switch to Admin Mode keeps Player Mode", mode.status() >= 300 && mode.status() < 400 && outsideAdmin(to) && !adminCookie, { status: mode.status(), to: to.replace(base, ""), adminCookie });
}

// ── Browser ───────────────────────────────────────────────────────────────────────────────────
/**
 * S8a's public pages: the app's h1 (no wordmark spacing), the public header's links at 14px, and
 * from desktop width Privacy's table of contents still in view at the notice's end.
 */
async function publicPageFacts(page, kind, name) {
  if (name === "sign-in" || name === "privacy") {
    const tracking = await page.locator("h1").first().evaluate((h) => parseFloat(getComputedStyle(h).letterSpacing) || 0);
    pass(kind, `public ${name}: the app's h1, without the wordmark's spacing`, tracking <= 0, { tracking });
  }
  if (name === "public-team") {
    const sizes = await page.locator("nav[aria-label='Public pages']").locator("a, button").evaluateAll((els) => [...new Set(els.filter((e) => e.offsetParent).map((e) => getComputedStyle(e).fontSize))]);
    pass(kind, "public team page: the header's links at 14px", sizes.length === 1 && sizes[0] === "14px", { sizes });
  }
  if (name === "privacy" && kind === "desktop") {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(150);
    const box = await page.locator("[data-testid=privacy-index]").evaluate((n) => { const r = n.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: innerHeight }; });
    pass(kind, "privacy: the table of contents still in view at the notice's end", box.top >= 0 && box.bottom <= box.height, box);
    await page.evaluate(() => window.scrollTo(0, 0));
  }
}

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  tablet: { viewport: { width: 768, height: 1024 }, hasTouch: true, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const proxy = !local && process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined;
const executablePath = process.env.PW_CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

/*
  The check's browser contexts. Two things a member's browser does are left out, because each costs
  the site's Vercel Active CPU on every run and checks nothing (docs/HOSTING_USAGE.md, "Vercel Active
  CPU"; measured on a production-like build with the same checks passing: about 15 → 10–12.5
  CPU-seconds and 852 → 253 function invocations a run):
  - Viewport prefetch: Next's links prefetch every member page they can see, about 600 server
    renders a run that the check never opens. Links are hidden from IntersectionObserver, which is
    what Next's viewport prefetch watches; a hover, focus or tap still prefetches as for a member,
    and every page the check opens is loaded and asserted in full.
  - Page-speed beacons (/api/vitals): about 45 a run, all dropped by the server since #256 because
    the verification account sends them. They are answered here with 204, so no request fails.
*/
async function checkContext(options) {
  const context = await browser.newContext({ ...options, reducedMotion: "reduce" });
  await context.addInitScript(() => {
    const Observer = window.IntersectionObserver;
    if (!Observer) return;
    window.IntersectionObserver = class extends Observer {
      observe(target) {
        if (target instanceof Element && target.tagName === "A") return;
        return super.observe(target);
      }
    };
  });
  await context.route((url) => url.href.startsWith(`${base}/api/vitals`), (route) => route.fulfill({ status: 204, body: "" }));
  return context;
}

function instrument(page) {
  const log = { console: [], pageErrors: [], failed: [] };
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (/ERR_TUNNEL_CONNECTION_FAILED|ERR_PROXY_CONNECTION_FAILED|ERR_CERT_/.test(text)) report.blockedByEnvironment++;
    else log.console.push(text.slice(0, 240));
  });
  page.on("pageerror", (e) => log.pageErrors.push(String(e).slice(0, 240)));
  page.on("requestfailed", (r) => {
    const url = r.url(), why = r.failure()?.errorText ?? "failed";
    if (!url.startsWith(base)) report.blockedByEnvironment++;
    else if (!/ERR_ABORTED/.test(why)) log.failed.push(`${why} ${url.slice(base.length, base.length + 120)}`);
  });
  page.on("response", (r) => {
    if (r.url().startsWith(base) && r.status() >= 500) log.failed.push(`${r.status()} ${r.url().slice(base.length, base.length + 120)}`);
  });
  return log;
}
const settle = async (page) => {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(400);
};
const shot = (page, file, fullPage = false) => page.screenshot({ path: `${out}/${file}.png`, fullPage }).catch(() => {});

/** Opens a page and checks what every page must meet; returns false when it did not load. */
async function visit(page, log, kind, name, path, { fullPage = true, publicPage = false } = {}) {
  const from = { c: log.console.length, e: log.pageErrors.length, f: log.failed.length };
  const res = await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await settle(page);
  // A notFound() or an error after the page began streaming still answers 200: wait for the page's
  // heading or one of those screens, then say which. Every member page has a heading in <main>
  // (e2e/quality.spec.ts); the waiting never fails by itself.
  if (!publicPage) await page.locator("main h1, main h2, [data-testid=not-found], [data-testid=page-error]").first().waitFor({ timeout: 20_000 }).catch(() => {});
  const facts = await page.evaluate(() => ({
    at: location.pathname + location.search,
    screen: document.querySelector("[data-testid=not-found]") ? "not-found" : document.querySelector("[data-testid=page-error]") ? "page-error" : null,
    scrollX: document.documentElement.scrollWidth - innerWidth,
    brokenImages: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc.startsWith(location.origin)).map((i) => i.currentSrc.slice(location.origin.length, location.origin.length + 80)),
  }));
  await shot(page, `${kind}-${name}`, fullPage);
  const consoleErrors = log.console.slice(from.c), pageErrors = log.pageErrors.slice(from.e), failed = log.failed.slice(from.f);
  const status = res?.status() ?? 0;
  report.pages.push({ kind, name, path, status, ...facts, consoleErrors, pageErrors, failed });
  const loaded = status > 0 && status < 400 && (publicPage || (!facts.at.startsWith("/login") && !facts.at.startsWith("/no-access") && !facts.screen));
  pass(kind, `${name}: loads${publicPage ? "" : " signed in"} (${path})`, loaded, { status, at: facts.at, ...(facts.screen ? { screen: facts.screen } : {}) });
  if (!loaded) return false;
  pass(kind, `${name}: no sideways scroll`, facts.scrollX <= 1, facts.scrollX);
  pass(kind, `${name}: no page error or app console error`, pageErrors.length + consoleErrors.length === 0, [...pageErrors, ...consoleErrors].slice(0, 3));
  pass(kind, `${name}: no failed request to the app`, failed.length === 0, failed.slice(0, 3));
  pass(kind, `${name}: no broken image from the app`, facts.brokenImages.length === 0, facts.brokenImages.slice(0, 3));
  return true;
}

async function axe(page, kind, name, include) {
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).options({ rules: { "label-content-name-mismatch": { enabled: true } } });
  if (include) builder = builder.include(include);
  const result = await builder.analyze();
  const blocking = result.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  report.axe.push({ kind, name, violations: result.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help, targets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) })) });
  pass(kind, `${name}: no serious or critical axe violation`, blocking.length === 0, blocking.map((v) => `${v.id} ×${v.nodes.length}`));
  const minor = result.violations.filter((v) => !blocking.includes(v));
  if (minor.length) warn(kind, `${name}: minor axe findings`, minor.map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}`));
}

async function signIn(page) {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#username").fill(user);
  await page.locator("#password").fill(password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 }), page.getByRole("button", { name: /^sign in$/i }).click()]);
}

/**
 * Colours as [r, g, b, alpha 0–255], whatever form the browser computes them in (rgb, oklab with
 * an alpha for the translucent bars): each is painted on a 1×1 canvas and read back. `selectors`
 * name elements whose background to read; the frame token is read from a probe.
 */
const colours = (page, selectors) =>
  page.evaluate((selectors) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const rgba = (c) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data];
    };
    const probe = document.createElement("div");
    probe.style.background = "var(--color-chrome)";
    document.body.append(probe);
    const chrome = rgba(getComputedStyle(probe).backgroundColor);
    probe.remove();
    const shown = (el) => !!el && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().height > 0;
    const read = Object.fromEntries(Object.entries(selectors).map(([key, sel]) => {
      const el = document.querySelector(sel);
      return [key, shown(el) ? rgba(getComputedStyle(el).backgroundColor) : null];
    }));
    return { token: getComputedStyle(document.documentElement).getPropertyValue("--color-chrome").trim(), chrome, ...read };
  }, selectors);
/** Same hue as the frame: r, g and b within 3 (a translucent bar rounds its channels slightly). */
const sameAsFrame = (c, chrome) => !!c && c.slice(0, 3).every((v, i) => Math.abs(v - chrome[i]) <= 3) && c[3] > 0;

/**
 * Player Mode's destinations as every bar lists them (navigation N1, 19 Nov 2026: the sidebar, a
 * tablet's top bar, a phone's tab bar and its compact bar held sideways): My Profile, Team, Matchup
 * Intel and Resources, in that order, Matchup Intel at its own address. An account without Team's
 * pages lists the others in the same order. Team leads to the Team page it opens (a phone's to the
 * section last used), so its address is not compared.
 */
function destinationsInOrder(entries) {
  const labels = entries.map((e) => e.label);
  const expected = ["My Profile", "Team", "Matchup Intel", "Resources"].filter((l) => l !== "Team" || labels.includes("Team"));
  return labels.join("|") === expected.join("|") && entries.find((e) => e.label === "Matchup Intel")?.href === "/resources/matchups";
}

async function frameChecks(page, kind, context) {
  await page.goto(`${base}/team`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const paint = await colours(page, { sidebar: "[data-testid=sidebar-window]", top: "[data-testid=mobile-topbar]", tabs: "[data-testid=phone-tabbar]" });
  pass("frame", `${kind}: the --color-chrome token is deployed`, !!paint.token, paint.token);
  if (kind === "desktop") {
    const side = await page.evaluate(() => {
      const current = document.querySelector("[data-testid=sidebar] nav a[aria-current=page]");
      const bars = current ? [...current.querySelectorAll("span")].map((s) => getComputedStyle(s).backgroundImage).filter((b) => b.includes("gradient")) : [];
      return { current: !!current, gradient: bars.length > 0 };
    });
    pass("frame", "desktop: the sidebar is painted with the frame colour", sameAsFrame(paint.sidebar, paint.chrome), { sidebar: paint.sidebar, chrome: paint.chrome });
    pass("frame", "desktop: the current page carries the blue-to-violet bar", side.current && side.gradient, side);
    const entries = await page.evaluate(() => [...document.querySelectorAll("[data-testid=sidebar] nav[aria-label=Main] a")].map((a) => ({ label: a.textContent.trim(), href: a.getAttribute("href") })));
    pass("frame", "desktop: the sidebar's entries are My Profile, Team, Matchup Intel and Resources, Matchup Intel at /resources/matchups", destinationsInOrder(entries), { entries: entries.map((e) => e.label), matchupIntel: entries.find((e) => e.label === "Matchup Intel")?.href ?? null });
    await shot(page, "desktop-frame-open");
    await context.addCookies([{ name: "uniiverse_sidebar", value: "collapsed", url: base }]);
    await page.reload({ waitUntil: "domcontentloaded" });
    await settle(page);
    const folded = await page.getByTestId("sidebar").getAttribute("data-collapsed").catch(() => null);
    pass("frame", "desktop: the folded sidebar keeps the frame", folded === "true", { collapsed: folded });
    await shot(page, "desktop-frame-folded");
    await context.addCookies([{ name: "uniiverse_sidebar", value: "expanded", url: base }]);
    await accountMenuFirstTap(page, kind, page.getByTestId("sidebar").getByTestId("account-menu-button"));
    return;
  }
  pass("frame", `${kind}: the top bar is painted with the frame colour`, sameAsFrame(paint.top, paint.chrome), { topBar: paint.top, chrome: paint.chrome });
  if (kind === "phone") {
    pass("frame", "phone: the tab bar is painted with the frame colour", sameAsFrame(paint.tabs, paint.chrome), { tabBar: paint.tabs, chrome: paint.chrome });
    // The tab bar holds the sidebar's destinations (navigation N1), each named in full at 390px and
    // 100% text (a name left to screen readers is 1px wide); on Team, Team's sections are the top bar's
    // second row. Labels, sizes and true or false only.
    const bar = await page.evaluate(() => {
      const links = [...document.querySelectorAll("[data-testid=phone-tabbar] a")];
      const row = document.querySelector("[data-testid=team-chrome-tabs]");
      const rowLinks = row ? [...row.querySelectorAll("a")] : [];
      // Named in full: the name drawn, and the part a narrower bar reads out only drawn too.
      const wide = (el) => (el?.getBoundingClientRect().width ?? 0) > 1;
      const full = (a) => wide(a.querySelector("[data-name=label]")) && (!a.querySelector("[data-name=rest]") || wide(a.querySelector("[data-name=rest]")));
      return {
        entries: links.map((a) => ({ label: a.textContent.trim(), href: a.getAttribute("href"), shown: full(a) })),
        inTopBar: !!row?.closest("[data-testid=mobile-topbar]"),
        sections: rowLinks.map((a) => a.textContent.trim()),
        current: rowLinks.filter((a) => a.getAttribute("aria-current") === "page").map((a) => a.textContent.trim()),
        rowHeight: row ? Math.round(row.getBoundingClientRect().height) : null,
        inPage: !!document.querySelector("[data-testid=team-tabs]") && getComputedStyle(document.querySelector("[data-testid=team-tabs]")).display !== "none",
      };
    });
    pass("frame", "phone: the tab bar's destinations are the sidebar's, My Profile, Team, Matchup Intel and Resources, each named in full at 390px", destinationsInOrder(bar.entries) && bar.entries.every((e) => e.shown), { entries: bar.entries.map((e) => e.label), named: bar.entries.map((e) => e.shown), matchupIntel: bar.entries.find((e) => e.label === "Matchup Intel")?.href ?? null });
    const TEAM_ROW = ["Overview", "Players", "Leaderboards", "Matches"];
    const inOrder = bar.sections.length >= 2 && bar.sections.every((l, i) => TEAM_ROW.indexOf(l) >= 0 && (i === 0 || TEAM_ROW.indexOf(l) > TEAM_ROW.indexOf(bar.sections[i - 1])));
    pass("frame", "phone (390): Team's sections are the top bar's second row, Overview marked on Team, 44px, not repeated in the page", bar.inTopBar && inOrder && bar.sections[0] === "Overview" && bar.current.join() === "Overview" && (bar.rowHeight ?? 0) >= 44 && !bar.inPage, { sections: bar.sections, current: bar.current, rowHeight: bar.rowHeight, inPage: bar.inPage });
    // Phones have no drawer: the avatar opens the account screen (docs/MOBILE.md, "The account screen").
    // The first tap counts: a fresh load, one tap as soon as the avatar is on screen (before the
    // page's code has run, on a slow load, it is kept and applied once it runs: early-taps.ts), and
    // no second one.
    await page.goto(`${base}/team`, { waitUntil: "commit" });
    const avatar = page.getByTestId("account-sheet-button");
    await avatar.waitFor({ timeout: 20_000 });
    const tappedAt = Date.now();
    await avatar.tap();
    const screen = page.getByTestId("account-sheet");
    const opened = await screen.waitFor({ timeout: 15_000 }).then(() => true, () => false);
    pass("frame", "phone: the avatar opens the account screen on the first tap", opened, { openedAfterMs: opened ? Date.now() - tappedAt : null });
    if (opened) {
      // At rest: its opening motion run and dropped (data-entered), within a few seconds.
      const rested = await page.waitForFunction(() => {
        const d = document.querySelector("[data-testid=account-sheet]");
        return !!d && d.getAttribute("data-entered") === "true" && d.getAnimations().length === 0;
      }, null, { timeout: 5_000 }).then(() => true, () => false);
      // Where it rests: the whole screen, exactly; nothing scrolls; every control a full-width target
      // at least 48px tall, reached by a tap where it is drawn; the screen itself has the focus (the
      // close button is not lit up); Sign out (with an account) in view.
      const fit = await screen.evaluate((d) => {
        const box = d.getBoundingClientRect();
        const body = d.querySelector("[data-sheet-scroll]");
        const controls = [...d.querySelectorAll("[data-testid=account-sheet-close], nav a, nav button, [data-testid=mode-switch], [data-testid=sign-out]")];
        const missed = controls.filter((el) => {
          const r = el.getBoundingClientRect();
          const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !(r.top >= 0 && r.bottom <= box.bottom && at && (at === el || el.contains(at)));
        }).length;
        const rows = controls.slice(1).map((el) => el.getBoundingClientRect());
        // Full width: as wide as the column the rows sit in (the nav), less its border.
        const column = d.querySelector("nav")?.getBoundingClientRect().width ?? 0;
        const signOut = d.querySelector("[data-testid=sign-out]")?.getBoundingClientRect();
        const pages = [...d.querySelectorAll("nav a")].map((a) => a.textContent.trim());
        const tabs = [...document.querySelectorAll("[data-testid=phone-tabbar] a")].map((a) => a.textContent.trim());
        return {
          pages,
          tabs,
          box: [Math.round(box.left), Math.round(box.top), Math.round(box.width), Math.round(box.height)],
          screen: [innerWidth, innerHeight],
          bodyScrolls: !!body && body.scrollHeight > body.clientHeight + 1,
          controls: controls.length,
          missed,
          shortest: rows.length ? Math.round(Math.min(...rows.map((r) => r.height))) : 0,
          narrowest: rows.length ? Math.round(Math.min(...rows.map((r) => r.width))) : 0,
          column: Math.round(column),
          focus: document.activeElement === d,
          signOut: signOut ? { inView: signOut.top >= 0 && signOut.bottom <= box.bottom } : null,
        };
      });
      const fills = fit.box[0] === 0 && fit.box[1] === 0 && fit.box[2] === fit.screen[0] && fit.box[3] === fit.screen[1];
      pass("frame", "phone: the account screen comes to rest filling the screen, nothing in it scrolling", rested && fills && !fit.bodyScrolls, { rested, box: fit.box, screen: fit.screen, bodyScrolls: fit.bodyScrolls });
      pass("frame", "phone: every control in the account screen is a full-width target reached by a tap where it is drawn", fit.controls >= 3 && fit.missed === 0 && fit.shortest >= 48 && fit.column > 0 && fit.narrowest >= fit.column - 2, { controls: fit.controls, missed: fit.missed, shortestRow: fit.shortest, narrowestRow: fit.narrowest, column: fit.column });
      pass("frame", "phone: the account screen takes the focus itself as it opens", fit.focus, { focus: fit.focus });
      // The account's own items only (navigation N1): every page is a destination of the tab bar, so
      // no row repeats one; Matchup Intel and Resources are tabs, not rows.
      const destinationsShown = fit.pages.filter((t) => ["My Profile", "Team", "Matchup Intel", "Resources", "Players", "Leaderboards", "Matches"].includes(t));
      pass("frame", "phone: the account screen holds the account's own items only, no destination among them (Matchup Intel and Resources are tabs)", destinationsShown.length === 0 && fit.pages.includes("Settings") && fit.tabs.includes("Matchup Intel") && fit.tabs.includes("Resources"), { rows: fit.pages, tabs: fit.tabs });
      if (fit.signOut) pass("frame", "phone: Sign out is in view without scrolling the account screen", fit.signOut.inView, fit.signOut);
      else if (local) warn("frame", "phone: Sign out not offered", { why: "LIVE_LOCAL=1: the demo build has no sign-in; the screen holds the mode switch" });
      else pass("frame", "phone: Sign out is in view without scrolling the account screen", false, { signOut: null });
      await shot(page, "phone-account-screen");
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    return;
  }
  // The tablet's destinations are in its top bar, one tap each, Team marked on its page (the menu
  // drawer they were in has gone: frames by posture). Counts and true or false only.
  const bar = await page.evaluate(() => {
    const shown = (el) => !!el && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().height > 0;
    const navs = [...document.querySelectorAll("nav[aria-label=Primary]")].filter(shown);
    const links = navs[0] ? [...navs[0].querySelectorAll("a[href]")] : [];
    return {
      navs: navs.length,
      inTopBar: !!navs[0]?.closest("[data-testid=mobile-topbar]"),
      destinations: links.length,
      entries: links.map((a) => ({ label: a.getAttribute("title") ?? a.textContent.trim(), href: a.getAttribute("href") })),
      teamCurrent: links.filter((a) => a.getAttribute("aria-current") === "page").map((a) => a.getAttribute("href")).join() === "/team",
      drawer: !!document.querySelector("[data-testid=menu-button], #mobile-drawer"),
    };
  });
  const { entries: barEntries, ...barFacts } = bar;
  pass("frame", `${kind}: the top bar holds the destinations, one tap each, Team marked as the page shown, and no drawer`, bar.navs === 1 && bar.inTopBar && bar.destinations >= 2 && bar.teamCurrent && !bar.drawer, barFacts);
  pass("frame", `${kind}: the top bar's destinations are the sidebar's, My Profile, Team, Matchup Intel and Resources, Matchup Intel at /resources/matchups`, destinationsInOrder(barEntries), { entries: barEntries.map((e) => e.label), matchupIntel: barEntries.find((e) => e.label === "Matchup Intel")?.href ?? null });
  await shot(page, `${kind}-frame-topbar`);
  await accountMenuFirstTap(page, kind, page.getByTestId("mobile-topbar").getByTestId("account-menu-button"));
}

/**
 * A phone held sideways (844 × 390), in the phone's own context (signed in already), two page loads:
 * one compact bar holding the destinations and no bottom bar, on Team and on the teammate's profile,
 * whose sections ride under the bar; the bars at rest at most 90px (44px, the sections' 44px and the
 * hairline) and the profile's band at most 80px (frames by posture, docs/MOBILE.md). Sizes, counts and
 * true or false only.
 */
async function sidewaysFrame(page, log, profileId) {
  await page.setViewportSize({ width: 844, height: 390 });
  const facts = () =>
    page.evaluate(() => {
      const shown = (el) => !!el && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().height > 0;
      const navs = [...document.querySelectorAll("nav[aria-label=Primary]")].filter(shown);
      const top = document.querySelector("[data-testid=mobile-topbar]");
      const band = document.querySelector("[data-testid=profile-header]");
      return {
        navs: navs.length,
        inTopBar: !!navs[0]?.closest("[data-testid=mobile-topbar]"),
        destinations: navs[0] ? navs[0].querySelectorAll("a[href]").length : 0,
        entries: navs[0] ? [...navs[0].querySelectorAll("a[href]")].map((a) => ({ label: a.textContent.trim(), href: a.getAttribute("href") })) : [],
        bottomBar: shown(document.querySelector("[data-testid=phone-tabbar]")),
        bars: top ? Math.round(top.getBoundingClientRect().height) : null,
        sections: shown(document.querySelector("[data-testid=profile-chrome-tabs]")),
        teamRow: shown(document.querySelector("[data-testid=team-chrome-tabs]")),
        band: shown(band) ? Math.round(band.getBoundingClientRect().height) : null,
        lineupRows: new Set([...document.querySelectorAll("[data-testid=lineup-cell]")].map((c) => Math.round(c.getBoundingClientRect().top))).size,
        lineupCells: document.querySelectorAll("[data-testid=lineup-cell]").length,
      };
    });
  if (await visit(page, log, "phone", "sideways-team", "/team", { fullPage: false })) {
    const { entries, ...f } = await facts();
    const { lineupRows, lineupCells, ...frame } = f;
    pass("frame", "phone held sideways (844 × 390): one compact bar holds the four destinations, Team's sections under it, with no bottom bar, the bars at most 90px", frame.navs === 1 && frame.inTopBar && destinationsInOrder(entries) && frame.teamRow && !frame.bottomBar && frame.bars !== null && frame.bars <= 90, { ...frame, entries: entries.map((e) => e.label) });
    // S3a: the five cards in one row held sideways, never 2 + 2 + 1 with an orphan.
    pass("team", "844x390: the lineup's five cards in one row, no orphan", lineupCells === 5 && lineupRows === 1, { lineupCells, lineupRows });
  }
  if (!profileId) return check("frame", "phone held sideways (844 × 390): a profile's sections and band", "PASS", "not applicable: no teammate's profile to open");
  if (await visit(page, log, "phone", "sideways-profile", `/players/${profileId}`, { fullPage: false })) {
    const { entries: _entries, ...f } = await facts();
    pass("frame", "phone held sideways (844 × 390): a profile's sections under the bar, the bars at rest at most 90px, the band at most 80px", f.navs === 1 && f.sections && !f.bottomBar && f.bars !== null && f.bars <= 90 && f.band !== null && f.band <= 80, f);
  }
}

/**
 * The account menu opens on the first tap or click, made on a fresh load as soon as its trigger is on
 * screen (the tablet's avatar, the sidebar's tile): before the page's code has run, on a slow load,
 * the tap is kept and applied once it runs (early-taps.ts); and no second one.
 */
async function accountMenuFirstTap(page, kind, trigger) {
  await page.goto(`${base}/team`, { waitUntil: "commit" });
  await trigger.waitFor({ timeout: 20_000 });
  const tappedAt = Date.now();
  if (kind === "tablet") await trigger.tap();
  else await trigger.click();
  const menu = await page.getByTestId("account-menu").waitFor({ timeout: 15_000 }).then(() => true, () => false);
  pass("frame", `${kind}: the account menu opens on the first ${kind === "tablet" ? "tap" : "click"}`, menu, { openedAfterMs: menu ? Date.now() - tappedAt : null });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
}

/**
 * Team Overview's layout facts (docs/LIVE_VALIDATION.md, "What it checks"), robust to production's
 * real lineup (a role nobody holds, a substitute or not for each role): a fact whose precondition
 * does not hold passes as "not applicable", with the reason. Only positions, sizes, counts and true
 * or false are reported.
 * - desktop (1440 × 900, the sidebar open), five across: the header and the cards are centred in
 *   the height under the section tabs (as much room above the header as under the cards, the frame
 *   reaching the window's foot), or start at the top when they are taller than the window; and the
 *   header shows the logo at 80px and the "Team Overview" eyebrow over the name, with the cards on
 *   the stage's floor (drawn from just under them, hidden from screen readers);
 * - phone (390 × 844): the first lineup card ends above the tab bar, and the lineup pager holds
 *   the five players' pictures (S3a);
 * - every width: no bench of substitutes under the lineup (the approved design shows a substitute
 *   on their starter's card, turned to by its control).
 */
async function teamFacts(page, kind) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const f = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const shown = (el) => !!el && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().height > 0;
    const cells = [...document.querySelectorAll("[data-testid=lineup-cell]")].map((c) => c.getBoundingClientRect());
    const tabs = q("[data-testid=team-tabs]");
    const frame = q("[data-testid=lineup-frame]");
    const header = q("[data-testid=team-header]");
    const stage = q("[data-testid=lineup-stage]");
    const track = q("[data-testid=lineup-overview]");
    const floor = q("[data-testid=lineup-stage-floor]");
    const logo = header?.querySelector("img, [data-testid=brand-mark-text]");
    const eyebrow = header ? [...header.querySelectorAll("p")].find((p) => p.textContent.trim() === "Team Overview") : null;
    const nav = [...document.querySelectorAll("nav[aria-label=Primary]")].find(shown);
    const at = (el, side) => (el ? Math.round(el.getBoundingClientRect()[side]) : null);
    return {
      scrollY: Math.round(scrollY),
      window: innerHeight,
      overflow: document.documentElement.scrollHeight - innerHeight,
      cells: cells.length,
      rows: new Set(cells.map((c) => Math.round(c.top))).size,
      tabsBottom: shown(tabs) ? at(tabs, "bottom") : null,
      frameTop: at(frame, "top"),
      frameBottom: at(frame, "bottom"),
      headerTop: at(header, "top"),
      trackBottom: at(track, "bottom"),
      stageBottom: at(stage, "bottom"),
      logo: shown(logo) ? { w: Math.round(logo.getBoundingClientRect().width), h: Math.round(logo.getBoundingClientRect().height) } : null,
      // Shown, not left to screen readers (a screen-reader-only line is 1px).
      eyebrow: !!eyebrow && eyebrow.getBoundingClientRect().width > 1 && eyebrow.getBoundingClientRect().height > 1,
      floor: { shown: shown(floor), ariaHidden: floor?.getAttribute("aria-hidden") === "true", top: at(floor, "top") },
      firstCardEnd: cells[0] ? Math.round(cells[0].bottom) : null,
      tabBarTop: nav ? Math.round(nav.getBoundingClientRect().top) : null,
      faces: document.querySelectorAll("[data-testid^=lineup-sub-]").length,
      // The lineup pager's pictures (members' phones: each player's picture with the role as its badge).
      pagerPictures: shown(q("[data-testid=lineup-pager]")) ? [...document.querySelectorAll("[data-testid=lineup-dot-picture]")].filter(shown).length : 0,
      bench: document.querySelectorAll("[data-testid=lineup-bench], [data-testid^=bench-]").length,
    };
  });
  if (kind === "desktop") {
    const fiveAcross = f.cells === 5 && f.rows === 1;
    const notFive = `not applicable: the lineup is not five across here (${f.cells} cards in ${f.rows} rows)`;
    // The header and the cards as one composition, centred in the height the section tabs leave (as
    // much room above the header as under the cards, the frame reaching the window's foot), or, when
    // it is taller than the window, starting at the top with no room added above it.
    const centred = "1440: the Team lineup is centred in the height under the section tabs (or starts at the top when taller than the window)";
    if (!fiveAcross) check("team", centred, "PASS", notFive);
    else if (f.tabsBottom === null || f.frameTop === null || f.headerTop === null || f.stageBottom === null) check("team", centred, "PASS", `not applicable: ${f.tabsBottom === null ? "no section tabs above the lineup" : "no lineup frame"}`);
    else {
      const above = f.headerTop - f.frameTop;
      const below = f.frameBottom - f.stageBottom;
      const taller = f.overflow > 1;
      const ok = f.frameTop >= f.tabsBottom - 1 && (taller ? Math.abs(above) <= 1 : above >= 0 && Math.abs(above - below) <= 2 && f.frameBottom >= f.window - 40);
      pass("team", centred, ok, { above, below, frameBottom: f.frameBottom, window: f.window, taller });
    }
    // The team's identity at its approved size, and the stage the cards stand on: the floor lit from
    // just under them (its top in their last 48px), decoration hidden from screen readers.
    const stage = "1440: the Team header's 80px logo and Team Overview eyebrow, and the five cards on the stage's floor (hidden from screen readers)";
    if (!fiveAcross) check("team", stage, "PASS", notFive);
    else {
      const logo = !!f.logo && Math.abs(f.logo.w - 80) <= 1 && Math.abs(f.logo.h - 80) <= 1;
      const floor = f.floor.shown && f.floor.ariaHidden && f.floor.top !== null && f.trackBottom !== null && f.floor.top >= f.trackBottom - 48 && f.floor.top <= f.trackBottom;
      pass("team", stage, logo && f.eyebrow && floor, { logo: f.logo, eyebrow: f.eyebrow, floor: { shown: f.floor.shown, ariaHidden: f.floor.ariaHidden, underCards: f.floor.top !== null && f.trackBottom !== null ? f.floor.top - f.trackBottom : null } });
    }
  }
  if (kind === "phone") {
    const name = "390x844 (the live check's phone): the first lineup card ends above the tab bar";
    if (f.tabBarTop === null || f.firstCardEnd === null) check("team", name, "PASS", `not applicable: ${f.tabBarTop === null ? "no tab bar shown" : "no lineup card"}`);
    else pass("team", name, f.firstCardEnd + f.scrollY <= f.tabBarTop, { firstCardEnd: f.firstCardEnd + f.scrollY, tabBarTop: f.tabBarTop });
    // The lineup pager shows the team: one picture per role (S3a; the role names alone before).
    pass("team", "390x844: the lineup pager holds the five players' pictures", f.pagerPictures === 5, { pagerPictures: f.pagerPictures });
  }
  // The approved design has no bench: a substitute is on their starter's card (its back).
  pass("team", `${kind}: no bench of substitutes under the lineup`, f.bench === 0, { bench: f.bench, cardsWithASubstitute: f.faces });
}

/**
 * The shared kit on Team (S4): a lineup card opens the player's Peek with the player in the address
 * (?player=), and Back closes it, leaving the page where it was; on the phone (390 × 844) the lineup
 * status ⓘ opens on a tap inside the screen and a second tap, on its bubble, closes it and reaches
 * nothing under it (no window opens, the address stays). Counts and true/false only.
 */
async function sharedKitFacts(page, kind) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const open = page.locator("[data-testid=open-player-detail]:visible").first();
  const peekName = `${kind}: a Team card opens the player Peek with ?player= in the address, and Back closes it`;
  if (!(await open.count())) check("team", peekName, "PASS", "not applicable: no player in the lineup");
  else {
    const before = await page.evaluate(() => ({ y: Math.round(scrollY), entries: history.length }));
    await open.click();
    const panel = page.getByTestId("player-detail");
    const opened = await panel.waitFor({ state: "visible", timeout: 10_000 }).then(() => true, () => false);
    const address = /[?&]player=/.test(page.url());
    await page.goBack();
    const closed = await panel.waitFor({ state: "hidden", timeout: 10_000 }).then(() => true, () => false);
    const after = await page.evaluate(() => ({ y: Math.round(scrollY), path: location.pathname, player: /[?&]player=/.test(location.search) }));
    pass("team", peekName, opened && address && closed && !after.player && after.path === "/team" && after.y === before.y, { opened, address, closed, stillOnTeam: after.path === "/team", moved: after.y - before.y });
  }
  if (kind !== "phone") return;
  const tipName = "390x844: an ⓘ opens on a tap inside the screen, and a tap on its bubble closes it without reaching what is under it";
  const tip = page.locator("main [data-testid=info-tip]:visible").first();
  if (!(await tip.count())) return check("team", tipName, "PASS", "not applicable: no ⓘ on Team for this account");
  await tip.scrollIntoViewIfNeeded();
  const url = page.url();
  await tip.tap();
  const bubble = page.locator("[data-testid=info-tip-bubble]");
  const shown = await bubble.waitFor({ state: "visible", timeout: 5_000 }).then(() => true, () => false);
  const box = shown ? await bubble.boundingBox() : null;
  const inside = !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 390 + 0.5 && box.y + box.height <= 844 + 0.5;
  if (box) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  const gone = await bubble.waitFor({ state: "detached", timeout: 5_000 }).then(() => true, () => false);
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ dialogs: document.querySelectorAll("dialog[open]").length }));
  pass("team", tipName, shown && inside && gone && after.dialogs === 0 && page.url() === url, { shown, inside, closed: gone, windowsOpened: after.dialogs, addressKept: page.url() === url });
}

/**
 * Recent form's board (PR 5a), as counts, heights and true/false only (the rows and the gap
 * sentences carry names, which redact() keeps): how tall its rows of two lines are, whether shared
 * places say so ("Tied for 4th") and only they, and whether each bar counts its row's games (20
 * segments, filled = wins, missing = the games a provisional window lacks). The desktop run is at
 * 1440 (the fluid root makes rows taller from 1536px); the verification account has no profile, so
 * there is never a You row.
 */
/**
 * Leaderboards' section index in reach (PLAN S8a): at the page's top, the index in the header or under
 * it; scrolled halfway down, on a phone a 44px chip row pinned at the top bar's foot, from md the
 * pinned row's compact copy. Scrolls the page and puts it back; reads only.
 */
async function leaderboardsIndexFacts(page, kind) {
  const top = await page.evaluate(() => [...document.querySelectorAll("[data-testid=header-section-index], [data-testid=section-index]")].some((el) => el.getBoundingClientRect().height > 0));
  await page.evaluate(() => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) / 2));
  await page.waitForTimeout(600);
  const pinned = await page.evaluate(() => {
    const row = [...document.querySelectorAll("[data-testid=leaderboards-chip-row], [data-testid=page-toolbar]")].find((el) => el.getBoundingClientRect().height > 0) ?? null;
    const links = row ? [...row.querySelectorAll("a")] : [];
    return { shown: !!row && row.getBoundingClientRect().height > 0, links: links.length, small: links.filter((a) => a.getBoundingClientRect().height < (row?.matches("[data-testid=leaderboards-chip-row]") ? 43.5 : 0)).length };
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  const scrolls = await page.evaluate(() => document.documentElement.scrollHeight > innerHeight * 1.3);
  pass("leaderboards", `${kind}: the section index at the top, and pinned once the header has gone`, top && (!scrolls || (pinned.shown && pinned.links === 4 && pinned.small === 0)), { top, scrolls, ...pinned });
}

async function leaderboardsFacts(page, kind) {
  const f = await page.evaluate(() => {
    const board = document.querySelector("[data-testid=form-board]");
    if (!board) return null;
    const box = (el) => el.getBoundingClientRect();
    const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
    const rows = [...board.querySelectorAll("[data-testid=form-row]")];
    // The name's lines, plus the second line's lines below 58rem (where the dates sit under the name).
    const lines = (row) => {
      const name = row.querySelector("[data-testid=card-name]");
      const meta = row.querySelector("[data-testid=form-meta]");
      if (!name || !meta) return null;
      const n = Math.round(box(name).height / parseFloat(getComputedStyle(name).lineHeight));
      if (getComputedStyle(meta).display === "contents") {
        const dates = row.querySelector("[data-testid=form-dates]");
        return n + (dates && box(dates).top > box(name).bottom - 2 ? 1 : 0);
      }
      const mids = [...meta.children].filter((c) => box(c).width > 0).map((c) => box(c).top + box(c).height / 2).sort((a, b) => a - b);
      return n + mids.filter((m, i) => i === 0 || m - mids[i - 1] > 6).length;
    };
    const measured = rows.map((r) => ({ h: Math.round(box(r).height * 10) / 10, lines: lines(r) }));
    const tied = rows.filter((r) => r.hasAttribute("data-tied"));
    const titled = (r) => r.querySelector("[data-testid=form-place]")?.getAttribute("title") === `Tied for ${ordinal(Number(r.dataset.place))}`;
    const barOk = (r) => {
      const b = r.querySelector("[data-testid=form-bar]");
      const games = Number(r.dataset.games);
      return !!b && b.children.length === 20 && b.dataset.segments === "20" && Number(b.dataset.filled) === Number(r.dataset.wins) && Number(b.dataset.known) === games && b.querySelectorAll("[data-state=missing]").length === 20 - games;
    };
    return {
      rows: rows.length,
      twoLine: measured.filter((m) => m.lines !== null && m.lines <= 2).map((m) => m.h),
      longer: measured.filter((m) => m.lines === null || !(m.lines <= 2)).length,
      tied: tied.length,
      tiedTitled: tied.filter(titled).length,
      untiedClaims: rows.filter((r) => !r.hasAttribute("data-tied") && /^Tied/.test(r.querySelector("[data-testid=form-place]")?.getAttribute("title") ?? "")).length,
      bars: rows.filter(barOk).length,
    };
  });
  if (!f) return pass("leaderboards", `${kind}: Recent form's board is on the page`, false, "no form-board");
  const limit = { phone: 72, tablet: 64, desktop: 56 }[kind];
  const name = `${kind}: every Recent form row of two lines is at most ${limit}px`;
  if (!f.twoLine.length) check("leaderboards", name, "PASS", `not applicable: ${f.longer} rows of more lines`);
  else pass("leaderboards", name, Math.max(...f.twoLine) <= limit, { twoLine: f.twoLine.length, tallest: Math.max(...f.twoLine), longerByDesign: f.longer });
  if (!f.tied) check("leaderboards", `${kind}: tied places are titled "Tied for Nth"`, "PASS", "not applicable: no shared place");
  else pass("leaderboards", `${kind}: tied places are titled "Tied for Nth"`, f.tiedTitled === f.tied && f.untiedClaims === 0, { tied: f.tied, titled: f.tiedTitled, untiedClaims: f.untiedClaims });
  if (!f.rows) check("leaderboards", `${kind}: every row's bar has 20 segments, filled = wins`, "PASS", "not applicable: no ranked or provisional row");
  else pass("leaderboards", `${kind}: every row's bar has 20 segments, filled = wins`, f.bars === f.rows, { rows: f.rows, matching: f.bars });
}

/**
 * The season records (19 Nov 2026: on Leaderboards' one page, after Recent form), at 1440, as true/false,
 * counts and heights only (the cells carry names, which redact() keeps): the records beside the
 * multikills, their tops level within 1px, and every record cell no taller than its layout allows.
 * A cell from 36rem is two lines beside its picture (its record on one line over its holder and game
 * on one), at most 72px; a narrower cell three lines (the record, the holder with the value, the
 * game), at most 96px. A cell of more lines (a long name or champion wrapping, a qualifier on a line
 * of its own) is counted, not failed, as Recent form's rows are. Each cell is measured at its own
 * height: two cells side by side share a grid row, which each stretches to (its hairline runs the
 * row's height), so a cell's box is the taller one's; the stretch is lifted for the measure and put
 * back in the same step, before anything is drawn (else the CS cell beside a damage record of more
 * lines read as a three-line cell of its neighbour's 108px, and failed). The verification account
 * has no profile, so no cell carries "Your best".
 */
async function recordsFacts(page, kind) {
  if (kind !== "desktop") return;
  const f = await page.evaluate(() => {
    const book = document.querySelector("[data-testid=records-book]");
    if (!book) return null;
    const box = (el) => el.getBoundingClientRect();
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const multikills = document.querySelector("[data-testid=records-multikills]");
    const oneLine = (el) => !el || box(el).height <= (parseFloat(getComputedStyle(el).lineHeight) || 20) + 2;
    const rows = [...book.querySelectorAll("[data-testid=season-record]")];
    // Each cell at its own height: the cell (li) set to its content's height, its row and the row's wrapper no longer filling it.
    const lifted = rows.flatMap((r) => [r.closest("li"), r.parentElement, r]);
    const kept = lifted.map((el) => [el.style.alignSelf, el.style.height]);
    for (const el of lifted) {
      if (el.tagName === "LI") el.style.alignSelf = "start";
      else el.style.height = "auto";
    }
    const cells = rows.map((r) => {
      const two = r.closest("li").clientWidth / rem >= 36;
      const title = oneLine(r.querySelector("[data-testid=record-title]"));
      const game = r.querySelector("[data-testid=record-game]");
      // Two lines: the holder and the game's parts level with each other; three: the holder's line and the game's line each one line.
      const gameFits = !game ? true : two ? (() => { const mids = [...game.children].filter((c) => box(c).width > 0).map((c) => box(c).top + box(c).height / 2); return mids.length === 0 || Math.max(...mids) - Math.min(...mids) <= 6; })() : oneLine(r.querySelector("[data-testid=card-name]")) && oneLine(r.querySelector("[data-testid=record-context]"));
      return { h: Math.round(box(r).height * 10) / 10, two, fits: title && gameFits };
    });
    lifted.forEach((el, i) => {
      [el.style.alignSelf, el.style.height] = kept[i];
    });
    return {
      cells: cells.length,
      twoLine: cells.filter((c) => c.two && c.fits).map((c) => c.h),
      threeLine: cells.filter((c) => !c.two && c.fits).map((c) => c.h),
      longer: cells.filter((c) => !c.fits).length,
      topsApart: multikills ? Math.round(Math.abs(box(book).top - box(multikills).top) * 10) / 10 : null,
      multikillsBeside: multikills ? box(multikills).left >= box(book).right : false,
    };
  });
  if (!f) return pass("leaderboards", "1440: the season records are on the page", false, "no records-book");
  pass("leaderboards", "1440: the season records beside the multikills, their tops within 1px", f.multikillsBeside && f.topsApart !== null && f.topsApart <= 1, { beside: f.multikillsBeside, topsApart: f.topsApart });
  const name = "1440: every record cell of two lines is at most 72px, of three lines at most 96px";
  if (!f.twoLine.length && !f.threeLine.length) check("leaderboards", name, "PASS", `not applicable: ${f.longer} cells of more lines`);
  else pass("leaderboards", name, Math.max(0, ...f.twoLine) <= 72 && Math.max(0, ...f.threeLine) <= 96, { cells: f.cells, twoLine: f.twoLine.length, tallestTwo: f.twoLine.length ? Math.max(...f.twoLine) : null, threeLine: f.threeLine.length, tallestThree: f.threeLine.length ? Math.max(...f.threeLine) : null, longerByDesign: f.longer });
}

/**
 * The multikill board (Release 15; scripts/multikill-facts.mjs), at every width, counts, scores and
 * the board's fixed words only (no name leaves the page): what the score is compared with, the
 * ranking by score with its places and crown, each row's kinds in words its own counts, the most of
 * each kind the board's highest counts, and compact rows. A team with no counts this season is a
 * warning, and so is a score compared with the team's own games (too few other players' games).
 */
async function multikillFacts(page, kind) {
  const read = await page.evaluate(readMultikillBoard);
  for (const v of multikillVerdicts({ kind, read })) check("leaderboards", v.name, v.status, v.detail);
}

/**
 * A record's game keeps /leaderboards (PLAN S6c, UD.L3, 20 Nov 2026): the first record that opens a game
 * opens it over the board (a docked Peek on the desktop, the window on the phone) with "Open in Match
 * History" inside, the address /leaderboards?match= (one history entry), and Back closes it on
 * /leaderboards. No page load of its own: the game is read through Match History's actions (the
 * profile's checks). True or false and the address's shape only.
 */
async function recordGameFacts(page, kind) {
  const opener = page.locator("[data-testid=record-open]").first();
  if (!(await opener.count())) return check("leaderboards", `${kind}: a record's game keeps /leaderboards`, "PASS", "not applicable: no record opens a game yet");
  const before = await page.evaluate(() => history.length);
  await opener.scrollIntoViewIfNeeded();
  await opener.click();
  const opened = await page.waitForSelector("[data-testid=record-game-peek] [data-testid=record-game-history]", { timeout: 15_000 }).then(() => true, () => false);
  const open = await page.evaluate((n) => ({ path: location.pathname, match: new URLSearchParams(location.search).has("match"), pushed: history.length - n }), before);
  await page.goBack();
  const closed = await page.waitForFunction(() => !new URLSearchParams(location.search).has("match") && !document.querySelector("aside[data-testid=record-game-peek], dialog[open][data-testid=record-game-peek]"), null, { timeout: 10_000 }).then(() => true, () => false);
  const after = await page.evaluate(() => ({ path: location.pathname, match: new URLSearchParams(location.search).has("match") }));
  pass("leaderboards", `${kind}: a record's game keeps /leaderboards`, opened && open.path === "/leaderboards" && open.match && open.pushed === 1 && closed && after.path === "/leaderboards" && !after.match, { opened, open, closed, after });
}

/**
 * Records & achievements' old address (19 Nov 2026): /leaderboards?view=records opens the one page, the view
 * gone from its address (the page's own in the same history entry), at the season records: the
 * section in view and focused. True or false and the address's shape only.
 */
async function recordsLandingFacts(page, kind) {
  const landed = await page
    .waitForFunction(() => location.hash === "#season-records" && !new URLSearchParams(location.search).has("view") && document.activeElement?.id === "season-records", null, { timeout: 10_000 })
    .then(() => true, () => false);
  const f = await page.evaluate(() => {
    const section = document.getElementById("season-records");
    const top = section ? section.getBoundingClientRect().top : null;
    return { path: location.pathname, view: new URLSearchParams(location.search).has("view"), hash: location.hash, focused: document.activeElement?.id === "season-records", inView: top !== null && top >= 0 && top < innerHeight };
  });
  pass("leaderboards", `${kind}: Records & achievements' old address opens the page at its season records`, landed && f.path === "/leaderboards" && !f.view && f.inView, f);
}

/**
 * Leaderboards at 2560 × 1440 (19 Nov 2026, the wide check): Recent form beside the season records, their
 * tops within 1px, every record on the first screen, and the milestones right under Recent form in its
 * column (the page's gap apart, within 1px, its edges level with Recent form's), whatever the records'
 * column beside them holds. Positions and true or false only.
 */
async function dashboardFacts(page) {
  const f = await page.evaluate(() => {
    const form = document.querySelector("[data-testid=form-board]")?.getBoundingClientRect();
    const book = document.querySelector("[data-testid=records-book]")?.getBoundingClientRect();
    const milestones = document.querySelector("[data-testid=records-milestones]")?.getBoundingClientRect();
    const grid = document.querySelector("[data-testid=leaderboards-grid]");
    if (!form || !book || !milestones || !grid) return null;
    const gap = parseFloat(getComputedStyle(grid).rowGap) || 0;
    const records = [...document.querySelectorAll("[data-testid=season-record]")].map((r) => Math.round(r.getBoundingClientRect().bottom + scrollY));
    return {
      beside: book.left >= form.right,
      topsApart: Math.round(Math.abs(form.top - book.top) * 10) / 10,
      records: records.length,
      lastRecord: Math.max(0, ...records),
      window: innerHeight,
      underForm: Math.round((milestones.top - form.bottom - gap) * 10) / 10,
      edges: Math.round((Math.abs(milestones.left - form.left) + Math.abs(milestones.right - form.right)) * 10) / 10,
    };
  });
  if (!f) return pass("wide", "2560: Leaderboards' Recent form, season records and milestones are on the page", false, "no form-board, records-book or records-milestones");
  pass("wide", "2560: on Leaderboards, Recent form beside the season records, their tops within 1px", f.beside && f.topsApart <= 1, { beside: f.beside, topsApart: f.topsApart });
  pass("wide", "2560: on Leaderboards, every record on the first screen", f.records === 7 && f.lastRecord <= f.window, { records: f.records, lastRecord: f.lastRecord, window: f.window });
  pass("wide", "2560: on Leaderboards, the milestones right under Recent form, in its column", Math.abs(f.underForm) <= 1 && f.edges <= 1, { underForm: f.underForm, edges: f.edges });
}

/**
 * Settings says who sees a member's picture and display name: teammates, and the public team page
 * while they are in the lineup or a substitute. The Public profile switch it once named is gone
 * (19 Oct 2026; docs/UNIIVERSE_TECHNICAL_HANDOVER.md §C4). Only true or false is reported.
 */
async function settingsFacts(page, kind) {
  const facts = await page.evaluate(() => ({
    publicProfile: /public profile/i.test(document.querySelector("main")?.innerText ?? ""),
    picture: /public team page/.test(document.querySelector("[data-testid=avatar-help]")?.textContent ?? ""),
    displayName: /public team page/.test(document.getElementById("display-name-help")?.textContent ?? ""),
  }));
  pass("settings", `${kind}: Settings never mentions a Public profile switch`, !facts.publicProfile, { mentioned: facts.publicProfile });
  pass("settings", `${kind}: the picture and display-name help name the public team page`, facts.picture && facts.displayName, { picture: facts.picture, displayName: facts.displayName });
  // On this device (PLAN S8a): what this browser remembers, each with Clear, and Clear all (read only: nothing is cleared here).
  const device = await page.evaluate(() => ({ items: document.querySelectorAll("[data-testid=on-this-device] [data-testid=device-item]").length, clears: document.querySelectorAll("[data-testid=on-this-device] [data-testid=device-item-clear]").length, all: !!document.querySelector("[data-testid=device-clear-all]") }));
  pass("settings", `${kind}: "On this device" lists what this browser remembers, each with Clear, and Clear all`, device.items >= 4 && device.clears === device.items && device.all, device);
  if (kind !== "phone") return;
  // The account card leads the page: Sign out is in view as it opens, above the tab bar. The card
  // draws its actions once per layout (the other copy is display: none): the one shown is measured.
  const signOut = await page.evaluate(() => {
    const button = [...document.querySelectorAll("[data-testid=settings-sign-out]")].find((el) => el.getBoundingClientRect().height > 0);
    if (!button) return null;
    const bar = document.querySelector("[data-testid=phone-tabbar]")?.getBoundingClientRect();
    const r = button.getBoundingClientRect();
    return { bottom: Math.round(r.bottom), firstScreen: Math.round(bar && bar.height > 0 ? bar.top : innerHeight), scrollY: Math.round(scrollY) };
  });
  pass("settings", "phone: Sign out is on Settings' first screen", !!signOut && signOut.scrollY === 0 && signOut.bottom <= signOut.firstScreen, signOut ?? "no Sign out");
}

/**
 * The Library (the Resources page, /resources): every section under its own heading, every row a link to
 * its site in a new tab that cannot reach back to this page or learn its address, the index offering
 * All, Favourites and each section, no title cut short and no broken site icon. Counts and true or
 * false only.
 */
async function resourcesFacts(page, kind) {
  await page.getByTestId("resources-list").waitFor({ timeout: 20_000 });
  const f = await page.evaluate(() => {
    const links = [...document.querySelectorAll("[data-testid=resource-link]")];
    return {
      rows: document.querySelectorAll("[data-testid=resource]").length,
      groups: document.querySelectorAll("[data-testid=resources-section-group]").length,
      headed: document.querySelectorAll("[data-testid=resources-section-group] h2").length,
      unsafeLinks: links.filter((a) => a.target !== "_blank" || !/\bnoopener\b/.test(a.rel) || !/\bnoreferrer\b/.test(a.rel) || !a.href.startsWith("https://")).length,
      segments: document.querySelectorAll("[data-testid=resources-index] [role=radio]").length,
      favourites: !!document.querySelector("[data-testid=resources-index-favourites]"),
      cutTitles: [...document.querySelectorAll("[data-testid=resource-title]")].filter((el) => el.scrollWidth > el.clientWidth + 1).length,
      brokenIcons: [...document.querySelectorAll("[data-testid=resource] img")].filter((i) => i.complete && i.naturalWidth === 0).length,
      // Site icons ship with the app (PLAN S8a): none loaded from another site.
      remoteIcons: [...document.querySelectorAll("[data-testid=resource] img")].filter((i) => !i.src.startsWith(location.origin)).length,
      // On a phone the index wraps (two lines at 375 and wider) rather than scrolling sideways, each chip a 44px target.
      indexLines: new Set([...document.querySelectorAll("[data-testid=resources-index] [role=radio]")].map((c) => Math.round(c.getBoundingClientRect().top))).size,
      indexHidden: [...document.querySelectorAll("[data-testid=resources-index] [role=radio]")].filter((c) => { const r = c.getBoundingClientRect(); return r.right > innerWidth + 0.5 || r.left < -0.5; }).length,
      smallChips: [...document.querySelectorAll("[data-testid=resources-index] [role=radio]")].filter((c) => c.getBoundingClientRect().height < 43.5).length,
    };
  });
  pass("resources", `${kind}: every section under its heading, every row a link to a new tab without this page's address`, f.rows > 0 && f.headed === f.groups && f.unsafeLinks === 0, { rows: f.rows, sections: f.groups, headed: f.headed, unsafeLinks: f.unsafeLinks });
  pass("resources", `${kind}: the index offers All, Favourites and each section`, f.favourites && f.segments === f.groups + 2, { segments: f.segments, sections: f.groups, favourites: f.favourites });
  // Choosing a section (the page's own filter: no request) shows that section alone, as many rows as
  // its segment counts; All brings the library back.
  const segment = page.locator("[data-testid=resources-index] [role=radio]").nth(2);
  if (f.groups > 0 && (await segment.count())) {
    await segment.click();
    await page.waitForFunction(() => document.querySelector("[data-testid=resources-index] [role=radio]:nth-child(3)")?.getAttribute("aria-checked") === "true", null, { timeout: 10_000 });
    const chosen = await page.evaluate(() => ({
      groups: document.querySelectorAll("[data-testid=resources-section-group]").length,
      rows: document.querySelectorAll("[data-testid=resource]").length,
      counted: Number(document.querySelector("[data-testid=resources-index] [role=radio]:nth-child(3) [data-testid=resources-index-count]")?.textContent?.replace(/\D/g, "") || -1),
    }));
    pass("resources", `${kind}: choosing a section shows it alone, its rows as counted`, chosen.groups === 1 && chosen.rows === chosen.counted, chosen);
    await page.locator("[data-testid=resources-index-all]").click();
  }
  pass("resources", `${kind}: no title cut short, no broken site icon, none loaded from another site`, f.cutTitles === 0 && f.brokenIcons === 0 && f.remoteIcons === 0, { cutTitles: f.cutTitles, brokenIcons: f.brokenIcons, remoteIcons: f.remoteIcons });
  if (kind === "phone") pass("resources", "phone: the section chips wrap, every section in view, each chip 44px", f.indexHidden === 0 && f.smallChips === 0 && f.indexLines <= 3, { lines: f.indexLines, hidden: f.indexHidden, small: f.smallChips });
}

/**
 * MATCHUP INTEL, one page load (docs/LIVE_VALIDATION.md, "What it checks"; the owner's decision of
 * 18 Nov 2026): a curated pair on the desktop, read at the check's 1440 × 900 and again with the
 * window made 1920 × 1080 (as the wide checks do), then put back. What is read and asserted is in
 * scripts/matchup-intel-facts.mjs, beside its unit test: which layer the pair shows and its label (the
 * curated briefing and when it was checked, or, once its check is too old or every part rests on an
 * ability Riot changed, said hidden, above the assembled reference too), the enemy's five ability
 * tiles with a name and a cooldown line each, the overview on one screen at 1920 × 1080 and the
 * essentials (the five tiles and the sources' summary) on the screen at 1440 × 900, both passing and
 * saying what they found while any part of the briefing is hidden, the sources and Riot's notice one
 * press away with their summary, nothing requested from the League of Legends Wiki, that checked notes
 * win over the facts from Riot's text (none of those shows for this pair, whose champions both have
 * checked notes), that the page's game patch is /api/health's and Riot's data in the sources is on it
 * (or the bar says the ability data is older), and axe. It reads nothing beyond what the page itself reads (the session, the
 * cached roster and patches, two champions' stored abilities and their committed facts from Riot's text).
 */
/** /api/health's current patch (null when it names none or does not answer): no page load. */
function healthPatchNow() {
  try {
    const body = JSON.parse(http("/api/health").text);
    return typeof body?.patch === "string" ? body.patch : null;
  } catch {
    return null;
  }
}

async function matchupIntelFacts(page, kind, wikiRequests) {
  await page.getByTestId("matchup-dashboard").waitFor({ timeout: 20_000 });
  const at = await page.evaluate(readMatchupIntel);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const wide = await page.evaluate(readMatchupIntel);
  await page.setViewportSize(VIEWPORTS.desktop.viewport);
  // The patch /api/health names (read at the start against production; a local run asks once here).
  const healthPatch = report.health ? report.health.patch : healthPatchNow();
  for (const v of matchupIntelVerdicts({ kind, pair: "Riven vs Mordekaiser", enemy: "Mordekaiser", at, wide, wiki: wikiRequests, healthPatch })) check("matchup-intel", v.name, v.status, v.detail);
}

/**
 * Matchup Intel's five roles (PLAN §6 rows 3.2–3.6; scripts/matchup-roles-facts.mjs), on the desktop,
 * on the page the facts above loaded: the lane selector pressed for each role it is not on (four
 * presses, each a render of the page on the server), the slots and the address read after each.
 */
async function matchupRolesFacts(page, kind) {
  const start = await page.evaluate(readRoleBar);
  const reads = start.pressed ? [{ role: start.pressed, at: start }] : [];
  for (const role of ["top", "jungle", "mid", "adc", "support"]) {
    if (role === start.pressed) continue;
    await page.locator(`[data-testid=matchup-role] button[data-role=${role}]`).click();
    await page
      .waitForFunction((r) => {
        const pressed = document.querySelector(`[data-testid=matchup-role] button[data-role=${r}][aria-pressed=true]`);
        return !!pressed && new URLSearchParams(location.search).get("role") === r && !document.querySelector('[data-testid="matchup-intel-content"][aria-busy="true"]');
      }, role, { timeout: 15_000 })
      .catch(() => {});
    reads.push({ role, at: await page.evaluate(readRoleBar) });
  }
  for (const v of matchupRolesVerdicts({ kind, start, reads })) check("matchup-intel", v.name, v.status, v.detail);
}

/**
 * The profile's tabs keep one place on every section (S2c, 19 Nov 2026; UD.PO1): the desktop's visits
 * of the teammate's Overview, All Champions and Match History each note where the tabs' row starts
 * (y, from the page's top) and, at the end, one fact compares them within 1px. Before, the Overview's
 * taller card put them 66px lower at 1440. No page load of its own; positions in px only.
 */
const profileTabsAt = {};
async function noteProfileTabs(page, kind, section) {
  if (kind !== "desktop") return;
  profileTabsAt[section] = await page.evaluate(() => {
    const row = document.querySelector("[data-testid=profile-tabs]");
    return row ? Math.round((row.getBoundingClientRect().top + scrollY) * 10) / 10 : null;
  }).catch(() => null);
}
function profileTabsLevel() {
  const ys = Object.values(profileTabsAt);
  if (ys.length < 2) return check("frame", "desktop: the profile's tabs keep one place on every section", "PASS", { notApplicable: "fewer than two profile sections loaded", at: profileTabsAt });
  pass("frame", "desktop: the profile's tabs keep one place on every section (Overview, All Champions, Match History)", ys.every((y) => y !== null) && Math.max(...ys) - Math.min(...ys) <= 1, profileTabsAt);
}

async function allChampions(page, log, kind, playerId) {
  const path = playerId ? `/players/${playerId}/champions` : "/overview/champions";
  if (!(await visit(page, log, kind, "all-champions", path))) return;
  await page.getByTestId("all-champions").waitFor({ timeout: 20_000 });
  await noteProfileTabs(page, kind, "champions");
  const facts = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("[data-testid=top-champion]")];
    const headers = [...document.querySelectorAll("[data-testid=all-champions-header] button")];
    return {
      rows: rows.length,
      heights: rows.slice(0, 8).map((r) => Math.round(r.getBoundingClientRect().height)),
      cut: headers.filter((b) => b.textContent.trim() !== "Champion" && b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent.trim().slice(0, 16)),
      sortedBy: document.querySelector("[data-testid=all-champions-header] [data-sort]")?.textContent?.trim().slice(0, 16) ?? null,
      // "No games match these filters." when the player has stored games but none in the default
      // season; "No stored games yet…" when they have none at all.
      emptyNoMatch: /^No games match/.test(document.querySelector("[data-testid=all-champions-empty]")?.textContent?.trim() ?? ""),
    };
  });
  // A new ranked year: the season follows the current patch's major version (17.x from early
  // January), so the lineup's first player can have games, but none in the new season, for their
  // first days. Only then, and only in the year's first six weeks, is an empty list a warning;
  // otherwise it fails, as a list the player's games should fill.
  const yearStart = Date.UTC(new Date().getUTCFullYear(), 0, 1);
  const newRankedYear = Date.now() - yearStart < 42 * 86_400_000;
  if (facts.rows === 0 && facts.emptyNoMatch && newRankedYear) warn("all-champions", `${kind}: All Champions lists no champions in the current season`, "the player has stored games but none this season: a new ranked year's first weeks");
  else {
    pass("all-champions", `${kind}: lists champions`, facts.rows > 0, facts.rows);
    if (kind !== "phone") pass("all-champions", `${kind}: rows are compact (at most 56 px)`, facts.heights.length > 0 && Math.max(...facts.heights) <= 56, facts.heights);
    else pass("all-champions", `${kind}: rows are compact (at most 64 px: the name over the role, the win rate over the games)`, facts.heights.length > 0 && Math.max(...facts.heights) <= 64, facts.heights);
    if (kind !== "phone") {
      const roles = await everyRoleRow(page);
      pass("all-champions", `${kind}: rows stay compact for every role beside "In pool" (at most 56 px)`, !!roles && Math.max(...Object.values(roles.heights)) <= 56, roles ?? "no row with a role line to measure");
    }
    pass("all-champions", `${kind}: sorted by games by default`, /games/i.test(facts.sortedBy ?? ""), facts.sortedBy);
    // Release 10 (PLAN S2b): on a phone Filters is in the list's search and sort row, on the search's
    // line, 44px, and never a row of its own above the scope line.
    if (kind === "phone" && facts.rows > 0) {
      await page.locator("[data-testid=all-champions-toolbar] [data-filter-toggle]").waitFor({ timeout: 10_000 }).catch(() => {});
      const row = await page.evaluate(() => {
        const toggle = document.querySelector("[data-testid=all-champions-toolbar] [data-filter-toggle]");
        const search = document.querySelector("[data-testid=all-champions-search]");
        if (!toggle || !search) return { inRow: false };
        const [t, s] = [toggle.getBoundingClientRect(), search.getBoundingClientRect()];
        return { inRow: true, size: [Math.round(t.width), Math.round(t.height)], besideSearch: Math.abs(t.top + t.height / 2 - (s.top + s.height / 2)) <= 2, alone: document.querySelectorAll("[data-filter-toggle]").length };
      });
      pass("all-champions", "phone: Filters in the search and sort row, beside the search, 44px, and nowhere else", row.inRow && row.besideSearch && row.size[0] >= 44 && row.size[1] >= 44 && row.alone === 1, row);
    }
  }
  pass("all-champions", `${kind}: no heading cut short`, facts.cut.length === 0, facts.cut);
  await axe(page, kind, "all-champions");
  // All Champions' preview: on the desktop and the tablet it unfolds under its row, across the list
  // (the overlay kit's Unfold, since 23 Nov 2026), with Champion, Games and Win rate in place (±1px),
  // the page not scrolled, nothing over the rows and nothing scrolling inside; Escape and Back close
  // it. On the phone it is a sheet, and Back closes it.
  const open = page.getByTestId("open-champion").first();
  if (await open.count()) {
    const columns = () => page.evaluate(() => ["champion", "games", "win"].map((k) => Math.round(document.querySelector(`[data-testid=sort-${k}]`)?.getBoundingClientRect().x ?? -1)));
    const before = { x: await columns(), y: await page.evaluate(() => scrollY) };
    await open.click();
    const content = page.getByTestId("champion-preview-content");
    const opened = await content.waitFor({ timeout: 15_000 }).then(() => true, () => false);
    // Under its row: the detail is the list item right after the selected row, as wide as the rows, in the page's flow (no window, no inner scroll).
    const underRow = () =>
      page.evaluate(() => {
        const li = document.querySelector("[data-testid=top-champion][data-selected=true]");
        const region = document.querySelector("[data-testid=champion-preview]");
        if (!li || !region) return { found: false };
        const next = li.nextElementSibling;
        const [r, d] = [li.getBoundingClientRect(), (next ?? region).getBoundingClientRect()];
        const scrollers = [...region.querySelectorAll("*"), region].filter((e) => /auto|scroll/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1).length;
        return { found: true, next: !!next && next.contains(region), region: region.getAttribute("role") === "region", window: !!document.querySelector("dialog[open]"), below: Math.abs(d.top - r.bottom) <= 2, width: Math.abs(d.left - r.left) <= 1 && Math.abs(d.right - r.right) <= 1, scrollers };
      });
    if (kind !== "phone") {
      const after = { x: await columns(), y: await page.evaluate(() => scrollY) };
      let under = { found: false };
      if (opened) {
        await page.getByTestId("champion-preview-foot").waitFor({ timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(300);
        under = await underRow();
        await shot(page, `${kind}-champion-preview`);
        await axe(page, kind, "champion-preview", "[data-testid=champion-preview]");
        pass("all-champions", `${kind}: the preview unfolds under its row (the next item of the list, as wide as the rows, no window, nothing scrolling inside)`, under.found && under.next && under.region && !under.window && under.below && under.width && under.scrollers === 0, under);
        await page.keyboard.press("Escape");
      }
      const escaped = await content.waitFor({ state: "detached", timeout: 5_000 }).then(() => true, () => false);
      await open.click();
      const again = await content.waitFor({ timeout: 15_000 }).then(() => true, () => false);
      await page.goBack();
      const backed = await content.waitFor({ state: "detached", timeout: 5_000 }).then(() => true, () => false);
      const still = after.x.every((x, i) => Math.abs(x - before.x[i]) <= 1) && after.y === before.y;
      pass("games", `${kind}: the champion preview opens under its row (Champion, Games and Win rate in place, the page not scrolled); Escape and Back close it`, opened && still && escaped && again && backed, { opened, before, after, escaped, backed });
      if (kind === "desktop") await guarded("all-champions", `${kind}: the preview's content`, () => championPreviewFacts(page, kind));
    } else {
      // The shared Peek's sheet.
      const sheet = await page.locator("dialog[open][data-testid=champion-preview]").count();
      if (opened) {
        await page.waitForTimeout(500);
        await shot(page, `${kind}-champion-preview`);
        await axe(page, kind, "champion-preview", "[data-testid=champion-preview]");
        await page.goBack();
      }
      const closed = await content.waitFor({ state: "detached", timeout: 5_000 }).then(() => true, () => false);
      pass("games", `${kind}: the champion preview opens (a sheet) and Back closes it`, opened && sheet === 1 && closed, { opened, sheet, closed });
    }
  }
}

/**
 * All Champions' preview, its content (PLAN §6 rows 4.5a–4.10; scripts/champion-preview-facts.mjs), on
 * the desktop, from the page already loaded: the first champion with 3+ games opens (its answer is
 * usually the one the fact above already asked for), its first opponent opens (one server action:
 * the pairing's games), ↓ moves to the next row (one more: that row's preview), and Escape closes it.
 * A list with no such champion is a warning, not a failure.
 */
async function championPreviewFacts(page, kind) {
  // The whole list ("Show all", a toggle in the page: no request), so the page can scroll for the browsing position.
  const all = page.getByTestId("all-champions-more");
  if (await all.count()) await all.click().catch(() => {});
  const rows = await page.evaluate(readChampionRows);
  const i = targetRow(rows, 3);
  if (i < 0) return warn("all-champions", `${kind}: skipped: no champion on the list has 3 or more games, so the preview's content was not read`, { rows: rows.length });
  const row = page.locator("[data-testid=top-champion]").nth(i);
  const button = row.locator("[data-open-champion]");
  // The browsing position (row 4.5d): the row brought to the middle of the screen, where it stays.
  // In the middle of the screen; a row near the list's top is scrolled up to about 200px from the
  // window's top instead, then down a step at a time while anything pinned covers it.
  await row.evaluate(async (r) => {
    const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    r.scrollIntoView({ block: "center" });
    await frame();
    if (scrollY === 0) window.scrollBy(0, r.getBoundingClientRect().top - 200);
    for (let k = 0; k < 4; k++) {
      await frame();
      const b = r.getBoundingClientRect();
      if (r.contains(document.elementFromPoint(b.left + 24, b.top + b.height / 2))) break;
      window.scrollBy(0, -60);
    }
  });
  await page.waitForTimeout(200);
  const rowTop = () => row.evaluate((r) => Math.round(r.getBoundingClientRect().top));
  const y0 = await rowTop();
  const scrolled = await page.evaluate(() => Math.round(scrollY));
  await button.click();
  const content = page.getByTestId("champion-preview-content");
  await content.waitFor({ timeout: 15_000 }).catch(() => {});
  // Loaded: the foot line comes with the answer (or the "could not be loaded" line in its place).
  await page.waitForFunction(() => !document.querySelector("[data-testid=champion-preview-loading]"), null, { timeout: 15_000 }).catch(() => {});
  const opponent = content.locator("[data-testid=champion-preview-opponent] > button").first();
  if (await opponent.count()) {
    await opponent.click();
    await content.getByTestId("champion-preview-intel").waitFor({ timeout: 15_000 }).catch(() => {});
  }
  const at = await page.evaluate(readChampionPreview, i);
  const yOpen = await rowTop();
  // Escape from here first, for the position (the next row's step below opens it again).
  await page.keyboard.press("Escape");
  await page.getByTestId("champion-preview-content").waitFor({ state: "detached", timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(200);
  const kept = { scrolled, open: yOpen - y0, closed: (await rowTop()) - y0 };
  await button.click();
  await content.waitFor({ timeout: 15_000 }).catch(() => {});
  // ↓ from the row: the next row's preview, the address replaced (the list keeps the keys while the focus is in it).
  let step = null;
  if (rows.length > 1) {
    const before = await page.evaluate(() => ({ url: location.href, length: history.length }));
    await button.focus();
    await page.keyboard.press("ArrowDown");
    const next = (i + 1) % rows.length;
    const moved = await page
      .waitForFunction((n) => {
        const row = document.querySelectorAll("[data-testid=top-champion]")[n];
        const c = document.querySelector("[data-testid=champion-preview-content]");
        return !!row && !!c && c.getAttribute("data-champion") === row.getAttribute("data-champion") && c.getAttribute("data-role") === row.getAttribute("data-role");
      }, next, { timeout: 10_000 })
      .then(() => true, () => false);
    const after = await page.evaluate((n) => {
      const row = document.querySelectorAll("[data-testid=top-champion]")[n];
      const q = new URLSearchParams(location.search);
      return { url: location.href, length: history.length, address: q.get("champion") === row?.getAttribute("data-champion") && q.get("crole") === row?.getAttribute("data-role") };
    }, next);
    step = { next: moved, address: after.address && after.url !== before.url, replaced: after.length === before.length };
  }
  await page.keyboard.press("Escape");
  const closed = await content.waitFor({ state: "detached", timeout: 5_000 }).then(() => true, () => false);
  const escaped = { closed, address: await page.waitForFunction(() => !new URLSearchParams(location.search).has("champion"), null, { timeout: 5_000 }).then(() => true, () => false) };
  for (const v of championPreviewVerdicts({ kind, at, step, escaped, kept })) check("all-champions", v.name, v.status, v.detail);
}

/**
 * A row's longest line is under the champion's name: the role with "In pool" beside it ("Support"
 * and "Bottom" are the widest of ROLE_LABELS, src/domain/roles.ts). The lineup's first player is
 * usually the Top laner, whose own rows carry only short roles, and opening another teammate's
 * pages would refresh that teammate's Riot data when it is due (the profile's layout does), so the
 * first row is copied instead: once per role, with that role's name and an "In pool" tag (a copy
 * of one from the list, or drawn with the tag's classes from src/components/players/all-champions.tsx
 * when no row has one). Each copy goes into the list beside the row, so it takes the rows' columns,
 * and is removed in the same step, before anything is drawn. The copy's height for each role, or
 * null without a row and its role line.
 */
async function everyRoleRow(page) {
  return page.evaluate(async () => {
    await document.fonts.ready;
    const row = document.querySelector("[data-testid=top-champion]");
    if (!row?.querySelector("[data-testid=champion-role-line] > :first-child")) return null;
    const tag = document.querySelector("[data-testid=top-champion] [data-testid=in-pool]");
    const heights = {};
    for (const role of ["Top", "Jungle", "Mid", "Bottom", "Support"]) {
      const copy = row.cloneNode(true);
      const line = copy.querySelector("[data-testid=champion-role-line]");
      // The role's name: the role tag's last part (its icon comes first).
      const name = [...line.firstElementChild.childNodes].reverse().find((n) => (n.nodeType === Node.TEXT_NODE ? !!n.data.trim() : n.nodeType === Node.ELEMENT_NODE && !n.matches("[data-role-icon]")));
      if (!name) return null;
      name.textContent = role;
      if (!line.querySelector("[data-testid=in-pool]")) line.append(tag ? tag.cloneNode(true) : Object.assign(document.createElement("span"), { className: "shrink-0 whitespace-nowrap rounded-full border border-border-strong px-1.5 text-2xs font-medium leading-4 text-fg-muted", textContent: "In pool" }));
      row.after(copy);
      try {
        heights[role] = Math.round(copy.getBoundingClientRect().height);
      } finally {
        copy.remove();
      }
    }
    return { heights, inPool: tag ? "copied from a row" : "drawn with the tag's classes" };
  });
}

/**
 * On a phone a game takes the whole screen (docs/MOBILE.md, "Open a game"; e2e/mobile-nav.spec.ts):
 * the match window with its scoreboard, in the address, nothing opened under the card, and Back
 * closes it and returns to the list.
 */
async function phoneGame(page, kind, name, slug, open) {
  await open();
  const win = page.getByTestId("match-detail");
  const shown = await win.getByTestId("match-breakdown").first().waitFor({ timeout: 30_000 }).then(() => true, () => false);
  const box = shown ? await win.boundingBox() : null;
  pass("games", `${kind}: ${name} opens a game as a whole screen`, shown && !!box && box.width >= page.viewportSize().width - 1, box ? Math.round(box.width) : null);
  pass("games", `${kind}: ${name}'s open game is in the address (?match=)`, /[?&]match=/.test(page.url()), page.url().replace(base, ""));
  pass("games", `${kind}: ${name} opens nothing under the card`, (await page.getByTestId("match-expanded").count()) === 0, await page.getByTestId("match-expanded").count());
  if (shown) {
    await shot(page, `${kind}-${slug}-open`);
    await axe(page, kind, `${slug}-game-open`, "[data-testid=match-detail]");
    // The post-game window (S6): no tabs, a bar with Previous and Next, and Next replaces the address (Back still closes).
    pass("games", `${kind}: ${name}'s game has no tabs`, (await win.locator("[role=tab]").count()) === 0, await win.locator("[role=tab]").count());
    const next = win.getByTestId("match-detail-next");
    if ((await next.count()) && (await next.isEnabled())) {
      const before = page.url();
      const length = await page.evaluate(() => history.length);
      await next.click();
      const moved = await page.waitForFunction((b) => location.href !== b, before, { timeout: 10_000 }).then(() => true, () => false);
      pass("games", `${kind}: ${name}'s Next shows the next game in place of the address, not a new entry`, moved && (await page.evaluate(() => history.length)) === length, { moved, length });
    }
  }
  await page.goBack();
  const closed = await win.waitFor({ state: "detached", timeout: 15_000 }).then(() => true, () => false);
  pass("games", `${kind}: Back closes the game and returns to ${name}`, closed && !/[?&]match=/.test(page.url()), page.url().replace(base, ""));
}

/**
 * The Players roster (the roster board, Nov 2026; docs/MOBILE.md and e2e/players-directory.spec.ts),
 * read from the page as it stands, whatever the real roster holds. Each row is one profile link (the
 * row's own, `data-row-link`; its social icons link elsewhere) and the rows number what the scope line
 * counts; no pool counts "+1" (a count stands for two or more). On the phone every row of two lines (the
 * name's, then the role, rank and pool) is at most 72px tall: a tagline, a Riot state, a name on two
 * lines or a status that wraps adds a line by design, so those rows are counted, not measured. Each
 * row's lines are counted by scripts/roster-lines.mjs, as the browser tests count them (a phone row's
 * tagline is a line of its own, under the second line). At 1440 with the sidebar open the roster is
 * two columns once it lists two players. Only counts, heights and true or false are reported.
 */
async function playersFacts(page, kind) {
  const facts = await page.evaluate(() => {
    const panel = document.querySelector("[data-testid=players-directory]");
    if (!panel) return null;
    const box = (el) => el.getBoundingClientRect();
    const shown = (el) => !!el && box(el).width > 0 && box(el).height > 0 && getComputedStyle(el).display !== "none";
    const rows = [...panel.querySelectorAll("[data-testid=player-card-item]")];
    const scope = (document.querySelector("[data-testid=players-scope]")?.textContent ?? "").trim();
    const counted = /^([\d,]+)/.exec(scope)?.[1];
    const counts = [...panel.querySelectorAll("[data-testid=directory-pool-more]")].filter(shown).map((c) => Number(/^\+(\d+)/.exec((c.textContent ?? "").trim())?.[1] ?? NaN));
    return {
      rows: rows.length,
      counted: counted === undefined ? null : Number(counted.replace(/,/g, "")),
      links: rows.map((row) => row.querySelectorAll("a[href^='/players/']").length),
      // The row's own link: the player Peek (?player=, PLAN S8a), or the profile for a player with no main role yet; the name is the profile's link.
      rowLinks: rows.filter((row) => row.querySelector("a[data-row-link][href^='/players/'], a[data-row-link][href*='?player=']")).length,
      peeks: rows.filter((row) => row.querySelector("a[data-row-link][href*='?player=']")).length,
      columns: new Set(rows.map((row) => Math.round(box(row).left))).size,
      counts,
      sidebarOpen: document.querySelector("[data-testid=sidebar]")?.getAttribute("data-collapsed") !== "true",
    };
  });
  if (!facts) return pass("players", `${kind}: the roster is on the page`, false, "no players-directory");
  const oneLink = facts.links.every((n) => n === 1) && facts.rowLinks === facts.rows;
  if (facts.rows === 0) check("players", `${kind}: one profile link per listed player`, "PASS", "not applicable: no player listed");
  else pass("players", `${kind}: one profile link per listed player`, oneLink && facts.counted === facts.rows, { rows: facts.rows, counted: facts.counted, rowsWithOneLink: facts.links.filter((n) => n === 1).length });
  if (facts.rows) pass("players", `${kind}: a row opens the player Peek (?player=), its name the profile`, facts.peeks > 0, { rows: facts.rows, peeks: facts.peeks });
  const plusOne = facts.counts.filter((n) => n === 1).length;
  if (facts.counts.length === 0) check("players", `${kind}: no pool shows +1`, "PASS", "not applicable: every pool shows whole");
  else pass("players", `${kind}: no pool shows +1`, plusOne === 0 && facts.counts.every((n) => n >= 2), { counts: facts.counts.length, plusOne });
  if (kind === "phone") {
    const name = "phone: every roster row of two lines is at most 72px tall";
    const measured = await page.locator("[data-testid=players-directory] [data-testid=player-card-item]").evaluateAll(rosterRowLines);
    const twoLine = measured.filter((r) => r.lines !== null && r.lines <= 2).map((r) => r.height);
    const longer = measured.filter((r) => r.lines === null || r.lines > 2).length;
    if (twoLine.length === 0) check("players", name, "PASS", `not applicable: no row of two lines (${longer} with a tagline, a Riot state or a long name)`);
    else pass("players", name, Math.max(...twoLine) <= 72, { twoLine: twoLine.length, tallest: Math.max(...twoLine), longerByDesign: longer });
  }
  if (kind === "desktop") {
    const name = "1440 with the sidebar open: the roster shows 2 columns once it lists 2 or more players";
    if (facts.rows < 2) check("players", name, "PASS", `not applicable: ${facts.rows} player listed`);
    else pass("players", name, facts.sidebarOpen && facts.columns === 2, { columns: facts.columns, sidebarOpen: facts.sidebarOpen, rows: facts.rows });
  }
}

/**
 * The navigation contract (#266; e2e/navigation-landings.spec.ts), on the phone: a teammate's profile
 * opened from the scrolled Players list starts at its top (scrollY 0, the profile header at y >= 0),
 * and Back returns to the list at its place (within 2px). The list is scrolled to its end and its last
 * row opened; a list that scrolls no further than that 2px (it fits the screen) has no place to
 * restore. Only positions are reported, never whose profile it was.
 */
async function profileLanding(page) {
  const name = "phone: a teammate's profile opened from the scrolled Players list starts at its top, and Back returns to the list at its place";
  const y = () => page.evaluate(() => Math.round(window.scrollY));
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(400);
  const listY = await y();
  if (listY <= 2) return check("navigation", name, "PASS", `not applicable: the list fits the screen (it scrolls ${listY}px)`);
  const href = await page.evaluate(() => [...document.querySelectorAll("main a[data-row-link][href^='/players/']")].filter((a) => { const r = a.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight; }).map((a) => a.getAttribute("href")).pop() ?? null);
  if (!href) return check("navigation", name, "PASS", "not applicable: no teammate's row on screen at the list's end");
  await Promise.all([page.waitForURL((u) => /^\/players\/[^/]+$/.test(u.pathname), { timeout: 30_000 }), page.locator(`main a[data-row-link][href="${href}"]`).last().click()]);
  const header = page.getByTestId("profile-header");
  await header.waitFor({ timeout: 20_000 });
  let profileY = await y();
  for (let i = 0; i < 25 && profileY !== 0; i++) {
    await page.waitForTimeout(200);
    profileY = await y();
  }
  const headerTop = Math.round((await header.boundingBox())?.y ?? -1);
  await Promise.all([page.waitForURL((u) => u.pathname === "/players", { timeout: 30_000 }), page.goBack()]);
  await page.locator("main [data-testid=player-card-item]").first().waitFor({ timeout: 20_000 });
  let backY = await y();
  for (let i = 0; i < 25 && Math.abs(backY - listY) > 2; i++) {
    await page.waitForTimeout(200);
    backY = await y();
  }
  pass("navigation", name, profileY === 0 && headerTop >= 0 && Math.abs(backY - listY) <= 2, { listY, profileY, headerTop, backY });
}

/** On the desktop: Skip to content is the page's first Tab stop, in view, and moves focus to the page itself (main#content). */
async function skipToContent(page) {
  const name = "desktop: Skip to content is the first Tab stop and moves focus to main#content";
  await page.goto(`${base}/players`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await settle(page);
  await page.keyboard.press("Tab");
  const first = await page.evaluate(() => {
    const el = document.activeElement;
    const r = el?.getBoundingClientRect();
    return { skip: el?.getAttribute("data-testid") === "skip-link", inView: !!r && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth };
  });
  await page.keyboard.press("Enter");
  let moved = false;
  for (let i = 0; i < 10 && !moved; i++) {
    moved = await page.evaluate(() => !!document.activeElement?.matches("main#content"));
    if (!moved) await page.waitForTimeout(100);
  }
  pass("navigation", name, first.skip && first.inView && moved, { firstStop: first.skip, inView: first.inView, focusedMain: moved });
}

/**
 * A tab row against its page (`testId`: the row's nav): where its first tab starts and where the
 * page's column does (the element of main#content holding the page: for a bar of main's own, as
 * Team's, the page after it; for a bar inside a page, as a profile's, that page), and on Team Overview
 * how far its header (capped at 84rem, centred) sits inside that column. Measured on the page once no
 * loading state stands in its place (waited for up to 10 s). Positions in px only; null when there is
 * no such row, or no page under it.
 */
async function tabRowEdges(page, testId) {
  await page.waitForFunction(() => !document.querySelector("main#content > [data-testid=page-frame] > [role=status]"), null, { timeout: 10_000 }).catch(() => {});
  return page.evaluate((testId) => {
    const nav = document.querySelector(`[data-testid=${testId}]`);
    const main = document.querySelector("main#content");
    if (!nav || !main || nav.getBoundingClientRect().width === 0) return null;
    // The page's column: the shared frame's child holding the row (a profile's), or the first one
    // after a row of main's own (Team's), in the frame (S2c) or, on a build without it, in main.
    const frame = main.querySelector(":scope > [data-testid=page-frame]") ?? main;
    let column = nav;
    while (column && column.parentElement !== frame && column.parentElement !== main) column = column.parentElement;
    if (column === nav) {
      column = frame === main ? nav.nextElementSibling : frame.firstElementChild;
      while (column && column.getBoundingClientRect().width === 0) column = column.nextElementSibling;
    }
    const first = nav.querySelector("li");
    if (!column || column.matches("[role=status]") || !first) return null;
    const px = (n) => Math.round(n * 10) / 10;
    const box = column.getBoundingClientRect();
    // The page's own column (the frame's child, whatever row it holds) and the room beside the
    // sidebar (main inside its padding): every page is centred in that room (23 Nov 2026).
    let own = frame === main ? column : frame.firstElementChild;
    while (own && own.getBoundingClientRect().width === 0) own = own.nextElementSibling;
    const ownBox = (own ?? column).getBoundingClientRect();
    const style = getComputedStyle(main);
    const room = main.getBoundingClientRect();
    const roomLeft = room.left + parseFloat(style.paddingLeft);
    const roomRight = room.right - parseFloat(style.paddingRight);
    const header = column.querySelector("[data-testid=team-header]")?.getBoundingClientRect();
    return { tab: px(first.getBoundingClientRect().left), page: px(box.left), column: { left: px(ownBox.left), width: px(ownBox.width), margins: [px(ownBox.left - roomLeft), px(roomRight - ownBox.right)] }, ...(header ? { headerInset: [px(header.left - box.left), px(box.right - header.right)] } : {}) };
  }, testId);
}

/**
 * Team's tabs' row (18 Nov 2026): its scroll boxes (the list of tabs) scroll sideways only. Counted:
 * the boxes that overflow up and down, those that can scroll that way, those whose scrollbar is not
 * hidden; and whether the current tab's bar ends at its tab's foot. Before the fix, the bar sat
 * 0.125rem under a 2px border and reached past the tab wherever the root size is above 16px (20.6px at
 * 2560), the list scrolled up and down too, and where scrollbars are classic it drew one beside the
 * team's name. Counts and true or false only.
 */
function tabRowScrolls(page) {
  return page.evaluate(() => {
    const nav = document.querySelector("[data-testid=team-tabs]");
    if (!nav) return null;
    const scrolls = (v) => v === "auto" || v === "scroll";
    const boxes = [nav, ...nav.querySelectorAll("*")].filter((el) => scrolls(getComputedStyle(el).overflowX) || scrolls(getComputedStyle(el).overflowY));
    const current = nav.querySelector("a[aria-current=page]");
    const bar = current ? getComputedStyle(current, "::after") : null;
    const tab = current?.getBoundingClientRect();
    return {
      boxes: boxes.length,
      overflowing: boxes.filter((el) => el.scrollHeight > el.clientHeight).length,
      verticalScrollers: boxes.filter((el) => scrolls(getComputedStyle(el).overflowY)).length,
      scrollbarShown: boxes.filter((el) => getComputedStyle(el).scrollbarWidth !== "none").length,
      barInside: !!bar && !!tab && parseFloat(bar.bottom) >= 0 && parseFloat(bar.bottom) + parseFloat(bar.height) <= tab.height,
    };
  });
}

/**
 * Wide screens (PR 10, 18 Nov 2026), in the desktop context made 2560 × 1440 (the sidebar open), where
 * the pages have stopped growing and are centred in the room beside the sidebar (each page's column
 * with equal margins, pages of one width at one x: 23 Nov 2026): Team, Players,
 * Leaderboards (with its dashboard's facts, 19 Nov 2026) and the teammate's profile load as every page does (visit) with axe, and each
 * one's tab row starts where its page's column does, within 1px (Team's tabs on Team's three, the
 * profile's on the profile; on Team Overview the column is Team's 100rem, its header and lineup
 * centred 84rem inside it, the inset reported), the Team row in the same place on all three. Four page
 * loads; positions in px and true or false only. A page without its tab row fails the fact.
 */
async function wideChecks(page, log) {
  await page.setViewportSize({ width: 2560, height: 1440 });
  const pages = [
    ["team", "Team Overview", "/team", "team-tabs", "the section tabs start where Team's column does"],
    ["players", "Players", "/players", "team-tabs", "the section tabs start where the page does"],
    ["leaderboards", "Leaderboards", "/leaderboards", "team-tabs", "the section tabs start where the page does"],
    ...(playerId ? [["profile", "the profile", `/players/${playerId}`, "profile-tabs", "the profile's tabs start where the page does"]] : []),
  ];
  const teamRow = [];
  const columns = [];
  let teamPages = 0;
  for (const [name, label, path, row, says] of pages) {
    await guarded("wide", `2560: ${name}`, async () => {
      if (!(await visit(page, log, "wide", name, path, { fullPage: false }))) return;
      if (row === "team-tabs") teamPages++;
      await axe(page, "wide", name);
      if (name === "leaderboards") await dashboardFacts(page);
      const at = await tabRowEdges(page, row);
      const fact = `2560: on ${label}, ${says}`;
      if (!at) return pass("wide", fact, false, { missing: `no ${row}, or no page under it` });
      columns.push({ name, ...at.column });
      pass("wide", fact, Math.abs(at.tab - at.page) <= 1, at);
      if (row === "team-tabs") {
        teamRow.push(at.tab);
        const sideways = await tabRowScrolls(page);
        pass("wide", `2560: on ${label}, Team's tabs scroll sideways only: nothing overflows up and down, no scrollbar, the current tab's bar inside its tab`, !!sideways && sideways.boxes > 0 && sideways.overflowing === 0 && sideways.verticalScrollers === 0 && sideways.scrollbarShown === 0 && sideways.barInside, sideways ?? { missing: "no team-tabs" });
      }
    });
  }
  if (!playerId) check("wide", "2560: on the profile, the profile's tabs start where the page does", "PASS", { notApplicable: "no teammate on Team to open" });
  // Once a Team page has loaded, every one of them must have shown the row, in one place.
  if (teamPages > 0) pass("wide", "2560: Team's tab row is in the same place on each of its sections", teamRow.length === teamPages && Math.max(...teamRow) - Math.min(...teamRow) <= 1, { starts: teamRow, pagesLoaded: teamPages });
  // The shared frame (23 Nov 2026, the owner's review): every page's column is centred in the room
  // beside the sidebar, the same margin on either side within 1px, and pages of one width share one x
  // (Team's three 100rem sections; the 80rem profile is centred on its own, never pinned to the left
  // with the spare room on its right, as from S2c until then). e2e/desktop-frame.spec.ts holds the
  // same rule at 1440, 1920 and 2560, the sidebar open and folded.
  if (columns.length > 0) pass("wide", "2560: every page loaded is centred in the room beside the sidebar (the shared frame)", columns.every((c) => Math.abs(c.margins[0] - c.margins[1]) <= 1 && c.margins[0] >= -1), { columns });
  const widths = new Map();
  for (const c of columns) widths.set(Math.round(c.width), [...(widths.get(Math.round(c.width)) ?? []), c.left]);
  const groups = [...widths.values()].filter((xs) => xs.length > 1);
  if (groups.length) pass("wide", "2560: pages of one width start at one x", groups.every((xs) => Math.max(...xs) - Math.min(...xs) <= 1), { byWidth: Object.fromEntries(widths) });
  await page.setViewportSize(VIEWPORTS.desktop.viewport);
}

/**
 * Ranked progress on the teammate's profile ends with its chart (18 Nov 2026): no History and
 * coverage disclosure, year strip, rank changes or readings table, the card's last part holding the
 * chart (or the line saying there is nothing to draw). A profile without the card (no linked account)
 * passes as not applicable. True or false only.
 */
async function rankedProgressEnds(page, kind) {
  const name = `${kind}: Ranked progress ends with its chart, with no History and coverage under it`;
  if (!(await page.getByTestId("ranked-progress").waitFor({ timeout: 8_000 }).then(() => true, () => false))) return check("ranked", name, "PASS", "not applicable: no Ranked progress on this profile");
  const f = await page.getByTestId("ranked-progress").evaluate((card) => ({
    disclosure: !!card.querySelector("details, summary, [data-testid=ranked-details]"),
    parts: ["ranked-coverage", "ranked-events", "ranked-key", "ranked-table"].filter((id) => card.querySelector(`[data-testid=${id}]`)).length,
    endsWithChart: !!card.lastElementChild?.querySelector("[data-testid=ranked-chart], [data-testid=ranked-no-chart]"),
  }));
  pass("ranked", name, !f.disclosure && f.parts === 0 && f.endsWithChart, f);
}

async function teamMatches(page, log, kind, context) {
  if (!(await visit(page, log, kind, "team-matches", "/matches", { fullPage: false }))) return;
  const games = page.getByTestId("together-game");
  if (!(await games.first().waitFor({ timeout: 20_000 }).then(() => true, () => false))) return warn("games", `${kind}: Team Matches lists no games`, "nothing to open");
  const game = games.first();
  if (kind === "phone") return phoneGame(page, kind, "Team Matches", "team-matches", () => game.getByTestId("together-card").click({ position: { x: 24, y: 12 } }));
  // A game with four or more members lists them two to a row (their column is 34rem wide on the
  // tablet's card and beside the open sidebar at 1440); a list with no such game passes as not
  // applicable.
  const four = await page.evaluate(() => {
    const card = [...document.querySelectorAll("[data-testid=together-game]")].find((c) => Number(c.getAttribute("data-members")) >= 4);
    if (!card) return null;
    const lefts = [...card.querySelectorAll("[data-testid=together-member]")].map((m) => Math.round(m.getBoundingClientRect().left));
    return { members: lefts.length, columns: new Set(lefts).size };
  });
  if (!four) pass("games", `${kind}: a Team Matches game with 4 members shows them in two columns`, true, "not applicable: no game with 4 or more members is listed");
  else pass("games", `${kind}: a Team Matches game with 4 members shows them in two columns`, four.columns === 2, four);
  const toggle = game.getByTestId("together-open");
  await game.getByTestId("together-card").click({ position: { x: 24, y: 12 } });
  await page.waitForFunction(() => document.querySelector("[data-testid=together-open][aria-expanded=true]"), null, { timeout: 10_000 }).catch(() => {});
  const breakdown = await game.getByTestId("match-breakdown").waitFor({ timeout: 30_000 }).then(() => true, () => false);
  const windows = await page.getByTestId("match-detail").count();
  const address = page.url();
  pass("games", `${kind}: a Team Matches game opens under its card`, (await toggle.getAttribute("aria-expanded")) === "true" && breakdown, { breakdown });
  pass("games", `${kind}: no match window opens from Team Matches`, windows === 0, windows);
  pass("games", `${kind}: the open game is in the address (?match=)`, /[?&]match=/.test(address), address.replace(base, ""));
  await game.scrollIntoViewIfNeeded();
  await shot(page, `${kind}-team-matches-open`);
  await axe(page, kind, "team-matches-game-open");

  // A copied link opens the same game under its card.
  const copy = await context.newPage();
  await copy.goto(address, { waitUntil: "domcontentloaded" });
  await settle(copy);
  const linked = await copy.waitForFunction(() => document.querySelector("[data-testid=together-open][aria-expanded=true]"), null, { timeout: 15_000 }).then(() => true, () => false);
  pass("games", `${kind}: a copied ?match= link opens that game under its card`, linked);
  await copy.close();

  // Back returns to the open game after leaving the page.
  await page.goto(`${base}/leaderboards`, { waitUntil: "domcontentloaded" });
  await page.goBack({ waitUntil: "domcontentloaded" });
  await settle(page);
  const back = await page.waitForFunction(() => /[?&]match=/.test(location.search) && document.querySelector("[data-testid=together-open][aria-expanded=true]"), null, { timeout: 15_000 }).then(() => true, () => false);
  pass("games", `${kind}: Back returns to the open game`, back, page.url().replace(base, ""));

  // "Close this game" closes it, clears the address and keeps the focus on the card.
  const close = page.getByTestId("match-close").first();
  if (await close.count()) {
    await close.click();
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => ({ open: !!document.querySelector("[data-testid=together-open][aria-expanded=true]"), address: location.search, focus: document.activeElement?.getAttribute("data-testid") ?? null }));
    pass("games", `${kind}: "Close this game" closes it and clears the address`, !after.open && !/match=/.test(after.address), after);
    pass("games", `${kind}: the focus returns to the card`, after.focus === "together-open", after.focus);
  }

  // The keyboard: Enter on a card's button opens and closes its game.
  if (kind === "desktop" && (await games.count()) > 1) {
    const second = games.nth(1).getByTestId("together-open");
    await second.focus();
    await page.keyboard.press("Enter");
    const opened = await second.getAttribute("aria-expanded").then((v) => v === "true");
    await page.waitForTimeout(400);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    const closed = (await second.getAttribute("aria-expanded")) === "false";
    pass("games", "desktop: Enter on a card opens its game and Enter again closes it", opened && closed, { opened, closed });
  }
}

/**
 * Page controls in reach (PR 2b), from the end of Match History: on the tablet and the desktop the
 * pinned tabs' row offers Filters once the page's filter bar has gone up under it, and it opens the
 * filter sheet; on the phone the top bar does. Opening and closing the sheet changes nothing (no
 * filter is touched). Positions in px and true or false only. Not applicable exactly when the frame
 * would not offer it: the filter bar's bottom still below the pinned stack's foot at the list's end
 * (the pinned row's bottom on the tablet and the desktop, the top bar's on the phone), or nothing
 * pinned while the filter bar is still on screen (a list too short to pin). Nothing pinned with the
 * bar gone above the window fails: the tabs above it are past their sticky offset there.
 */
async function reachFacts(page, kind) {
  const name = kind === "phone" ? "phone: from the end of Match History the top bar's Filters opens the filter sheet" : `${kind}: from the end of Match History the pinned row offers Filters and it opens the Filters popover, Support whole and nothing scrolling sideways`;
  const at = await page.evaluate(async (phone) => {
    const end = document.documentElement.scrollHeight - innerHeight;
    for (let y = window.scrollY; y < end; y += 240) {
      window.scrollTo(0, y);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    window.scrollTo(0, end);
    await new Promise((r) => setTimeout(r, 300));
    // What the frame watches (the page's filter bar) against where it watches it from.
    const bar = document.querySelector("[data-testid=match-history] [data-filter-bar]");
    const stuck = document.querySelector("[data-sticky-tabs][data-stuck]");
    const top = document.querySelector("[data-testid=mobile-topbar]");
    const foot = phone ? (top ? top.getBoundingClientRect().bottom : null) : stuck ? stuck.getBoundingClientRect().bottom : null;
    return { barBottom: bar ? Math.round(bar.getBoundingClientRect().bottom) : null, foot: foot === null ? null : Math.round(foot) };
  }, kind === "phone");
  if (at.barBottom === null) return pass("reach", name, false, { missing: "no filter bar on Match History" });
  if (at.foot === null) return at.barBottom > 0 ? check("reach", name, "PASS", { notApplicable: "nothing pinned while the filter bar is still on screen (the list too short)", ...at }) : pass("reach", name, false, { pinned: false, ...at });
  if (at.barBottom > at.foot + 1) return check("reach", name, "PASS", { notApplicable: "the list is too short for its filter bar to go up under what is pinned", ...at });
  const control = page.getByTestId(kind === "phone" ? "topbar-filters" : "toolbar-filters");
  const offered = await control.waitFor({ timeout: 5_000 }).then(() => true, () => false);
  let opened = false;
  let form = null;
  if (offered) {
    if (kind === "phone") await control.tap();
    else await control.click();
    const sheet = page.getByTestId("filter-sheet");
    opened = await sheet.waitFor({ timeout: 10_000 }).then(() => true, () => false);
    // Where previews open beside the list (the tablet and the desktop) it is a popover: anchored, no
    // modal window, its Role played segments whole ("Support" inside it), nothing scrolling sideways.
    if (opened && kind !== "phone") {
      form = await sheet.evaluate((el) => {
        const support = [...el.querySelectorAll("label, button, a")].find((n) => n.textContent?.trim() === "Support");
        const s = support?.getBoundingClientRect();
        const p = el.getBoundingClientRect();
        const sideways = [...el.querySelectorAll("*")].filter((n) => n.scrollWidth > n.clientWidth + 1 && !["visible", "hidden", "clip"].includes(getComputedStyle(n).overflowX)).length;
        return { popover: el.hasAttribute("data-popover"), modal: !!document.querySelector("dialog[open]"), supportWhole: !!s && s.left >= p.left && s.right <= p.right, sideways };
      });
      opened = form.popover && !form.modal && form.supportWhole && form.sideways === 0;
    }
    await shot(page, `${kind}-match-history-filters-from-the-frame`);
    await page.keyboard.press("Escape");
    await sheet.waitFor({ state: "detached", timeout: 5_000 }).catch(() => {});
  }
  pass("reach", name, offered && opened, { offered, opened, ...(form ?? {}), ...at });
}

async function matchHistory(page, log, kind, playerId) {
  const path = playerId ? `/players/${playerId}/matches` : "/overview/matches";
  if (!(await visit(page, log, kind, "match-history", path, { fullPage: false }))) return;
  const card = page.getByTestId("match-card").first();
  await noteProfileTabs(page, kind, "matches");
  if (!(await card.waitFor({ timeout: 20_000 }).then(() => true, () => false))) return warn("games", `${kind}: Match History lists no games`, path);
  if (kind === "desktop") {
    // The 12px floor reaches the game cards (Release 11): no running text under 12px on the first cards.
    const small = await page.evaluate(() => {
      const found = [];
      for (const c of [...document.querySelectorAll("[data-testid=match-card]")].slice(0, 5)) {
        const walk = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
        while (walk.nextNode()) {
          const el = walk.currentNode.parentElement;
          if (!walk.currentNode.textContent.trim() || el.getBoundingClientRect().width < 2 || el.closest("[aria-hidden=true], .sr-only")) continue;
          const st = getComputedStyle(el);
          if (parseFloat(st.fontSize) < 11.95 && st.textTransform !== "uppercase") found.push(st.fontSize);
        }
      }
      return found;
    });
    pass("games", "1440: the game cards' running text is 12px or more (the 12px floor)", small.length === 0, { under12: small.length });
  } else {
    // Touch screens: a card's LP mark is no button (no target under 44px on a card); the opened game has its tip.
    await page.waitForTimeout(800);
    const lp = await page.evaluate(() => ({ marks: document.querySelectorAll("[data-testid=match-card] [data-testid=match-lp]").length, tips: document.querySelectorAll("[data-testid=match-card-grid] [data-testid=match-lp-tip]").length }));
    pass("games", `${kind}: a game card's LP mark is no button on a touch screen (the opened game holds its tip)`, lp.tips === 0, lp);
  }
  if (kind === "desktop") {
    // A wide card's figures never run under the next column (the build, or the teams where the
    // list has no room for the build): how far each total or share ends before it, in px (negative is clear).
    const overruns = await page.evaluate(() =>
      [...document.querySelectorAll("[data-testid=match-card]")].slice(0, 3).map((c) => {
        const end = (e) => {
          const range = document.createRange();
          range.selectNodeContents(e);
          return range.getBoundingClientRect().right;
        };
        const cs = c.querySelector("[data-testid=match-cs]");
        const damage = c.querySelector("[data-testid=match-damage]");
        if (!cs || !damage) return null;
        // The next column: past what takes no room in the row, hidden or out of flow (a build that
        // was not recorded leaves only its screen-reader note, a 1px box at the row's start).
        const inRow = (e) => e.getBoundingClientRect().width >= 0.5 && !["absolute", "fixed"].includes(getComputedStyle(e).position);
        let next = (cs.closest("[data-testid=match-figures]") ?? cs.parentElement).nextElementSibling;
        while (next && !inRow(next)) next = next.nextElementSibling;
        return next ? Math.round(Math.max(end(cs), end(damage)) - next.getBoundingClientRect().left) : null;
      }),
    );
    const measured = overruns.filter((x) => x !== null);
    pass("games", "1440: on the first three cards the CS total and the damage share end before the next column", measured.length > 0 && measured.every((x) => x <= 0), overruns);
    // Real games go further than most pages show: the widest K/D/A ("10 / 10 / 10", every K/D/A
    // of three two-digit numbers, digits being tabular) and the longest champion names ("Nunu &
    // Willump" on two lines, the one-word "Heimerdinger" on one). The first card with both teams
    // is copied with them, the copy going into the list beside it so it takes the cards' columns,
    // and removed in the same step, before anything is drawn: how far the copy's teams start from
    // the card's, in px, and whether each name is cut. Null without a card that shows its teams.
    const extremes = await page.evaluate(async () => {
      await document.fonts.ready;
      const item = [...document.querySelectorAll("[data-testid=match-item]")].find((li) => li.querySelector("[data-testid=match-teams]") && li.querySelector("[data-testid=match-kda]") && li.querySelector("[data-testid=match-champion]"));
      if (!item) return null;
      const teams = (li) => li.querySelector("[data-testid=match-teams]").getBoundingClientRect().left;
      const out = { shift: [], cut: [] };
      for (const name of ["Nunu & Willump", "Heimerdinger"]) {
        const copy = item.cloneNode(true);
        copy.removeAttribute("id");
        copy.querySelector("[data-testid=match-kda]").textContent = "10 / 10 / 10";
        const champion = copy.querySelector("[data-testid=match-champion]");
        champion.textContent = name;
        item.after(copy);
        try {
          out.shift.push(Math.round(Math.abs(teams(copy) - teams(item))));
          // scrollWidth and scrollHeight are whole pixels: a cut name overflows by far more than one.
          out.cut.push(champion.scrollWidth > champion.clientWidth + 1 || champion.scrollHeight > champion.clientHeight + 1);
        } finally {
          copy.remove();
        }
      }
      return out;
    });
    if (!extremes) warn("games", "1440: no card on the first page shows its teams, so the widest K/D/A and the longest names were not tried", path);
    else pass("games", "1440: a card with the widest K/D/A and the longest champion names stays level with the others and keeps the names whole", extremes.shift.every((x) => x <= 1) && extremes.cut.every((x) => !x), extremes);
  }
  if (kind === "phone") {
    // The phone's denser cards (owner decision D8): the first game is whole above the tab bar on the
    // first screen. Positions only; not applicable where no tab bar shows.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    const first = await page.evaluate(() => {
      const nav = [...document.querySelectorAll("nav[aria-label=Primary]")].find((n) => getComputedStyle(n).display !== "none" && n.getBoundingClientRect().height > 0);
      const card = document.querySelector("[data-testid=match-card]");
      return { cardBottom: card ? Math.round(card.getBoundingClientRect().bottom + scrollY) : null, tabBarTop: nav ? Math.round(nav.getBoundingClientRect().top) : null };
    });
    const name = "390x844: the first game card is complete above the tab bar";
    if (first.tabBarTop === null) check("games", name, "PASS", "not applicable: no tab bar shown");
    else pass("games", name, first.cardBottom !== null && first.cardBottom <= first.tabBarTop, first);
    await phoneGame(page, kind, "Match History", "match-history", () => card.click({ position: { x: 24, y: 16 } }));
  }
  else {
    await card.click({ position: { x: 24, y: 16 } });
    const opened = await page.getByTestId("match-expanded").getByTestId("match-breakdown").first().waitFor({ timeout: 30_000 }).then(() => true, () => false);
    pass("games", `${kind}: Match History opens a game under its card`, opened);
    await shot(page, `${kind}-match-history-open`);
    if (kind !== "tablet") await axe(page, kind, "match-history-game-open");
    // The post-game view (S6): no tabs; at 1440×900 the card and its game take one screen; Next keeps
    // the open game's header where it was (±2px) and replaces the address; Back closes the game.
    if (opened) {
      const open = page.locator("li[data-expanded]");
      pass("games", `${kind}: the open game has no tabs`, (await open.locator("[role=tab]").count()) === 0, await open.locator("[role=tab]").count());
      if (kind === "desktop") {
        const fit = await open.evaluate((li) => {
          const top = li.querySelector("[data-testid=match-card]").getBoundingClientRect().top;
          const end = li.querySelector("[data-testid=match-expanded]").getBoundingClientRect().bottom;
          return Math.round(end - top);
        });
        pass("games", `${kind}: the card and its open game fit one screen (${fit}px of ${page.viewportSize().height})`, fit <= page.viewportSize().height, fit);
        // The post-game view's content (PLAN §6 rows 5.2–5.8; scripts/post-game-facts.mjs), from the game
        // already open: no interaction of its own, read once its timeline has answered (the lane reads it).
        await guarded("games", `${kind}: the open game's post-game view`, async () => {
          await page.waitForFunction(() => { const b = document.querySelector("li[data-expanded] [data-testid=match-breakdown]"); return !!b && b.getAttribute("data-timeline") !== "loading"; }, null, { timeout: 30_000 }).catch(() => {});
          const at = await page.evaluate(readPostGame);
          for (const v of postGameVerdicts({ kind, at })) check("games", v.name, v.status, v.detail);
        });
      }
      const next = open.getByTestId("game-header-next");
      if (await next.isEnabled()) {
        // Once the opening's own scroll (a card low on the screen is brought up smoothly) has stopped.
        let y0 = (await open.getByTestId("match-card").boundingBox()).y;
        for (let i = 0; i < 20; i++) {
          await page.waitForTimeout(100);
          const y = (await open.getByTestId("match-card").boundingBox()).y;
          if (Math.abs(y - y0) < 0.5) break;
          y0 = y;
        }
        const before = page.url();
        await next.click();
        await page.waitForFunction((b) => location.href !== b, before, { timeout: 10_000 }).catch(() => {});
        await page.waitForTimeout(300);
        const y1 = (await page.locator("li[data-expanded] [data-testid=match-card]").boundingBox())?.y ?? null;
        pass("games", `${kind}: Next keeps the open game's header in place (±2px)`, y1 !== null && Math.abs(y1 - y0) <= 2, { y0: Math.round(y0), y1: y1 === null ? null : Math.round(y1) });
      }
      await page.goBack();
      const closed = await page.locator("li[data-expanded]").waitFor({ state: "detached", timeout: 10_000 }).then(() => true, () => false);
      pass("games", `${kind}: Back closes the open game and keeps Match History`, closed && !/[?&]match=/.test(page.url()) && /\/matches/.test(page.url()), page.url().replace(base, ""));
    }
  }
  // The page's controls in reach from the end of its list (PR 2b): the pinned row's or the top bar's Filters.
  await guarded("reach", `${kind}: Filters from the end of Match History`, () => reachFacts(page, kind));
  // Encounters, the players met, from the view switch.
  const switcher = page.getByTestId("match-views").getByRole("link", { name: /encounters/i }).or(page.getByTestId("match-views").getByRole("button", { name: /encounters/i })).or(page.getByTestId("match-views").getByRole("tab", { name: /encounters/i }));
  if (await switcher.count()) {
    await switcher.first().click();
    const shown = await page.getByTestId("encounters").or(page.getByTestId("encounters-empty")).first().waitFor({ timeout: 20_000 }).then(() => true, () => false);
    pass("games", `${kind}: the Encounters view opens`, shown);
    await shot(page, `${kind}-encounters`);
  }
}

// ── Run ─────────────────────────────────────────────────────────────────────────────────────────
if (!signedIn) check("setup", "signed-in checks", process.env.LIVE_REQUIRE_SIGN_IN === "1" ? "FAIL" : "WARN", "pending: UNIIVERSE_VERIFY_USER / UNIIVERSE_VERIFY_PASSWORD are not set, so the member pages were not opened; the public pages and the signed-out checks ran");
if (!local) await deployment();
const browser = await chromium.launch({ executablePath, proxy });
let playerId = null;
// The public pages, signed out, at every width: what anyone can open (sign-in, privacy, home and the
// public team page, which has no switch).
if (!local) {
  for (const [kind, options] of Object.entries(VIEWPORTS)) {
    const context = await checkContext(options);
    const page = await context.newPage();
    const log = instrument(page);
    for (const [name, path] of [["sign-in", "/login"], ["privacy", "/privacy"], ["home", "/"], ["public-team", "/public"]]) {
      await guarded(kind, `public ${name}`, async () => {
        if (path === "/public" && http(path).status !== 200) return check(kind, "public team page", "PASS", "not turned on: nothing public to check");
        if (await visit(page, log, kind, `public-${name}`, path, { publicPage: true })) {
          await axe(page, kind, `public-${name}`);
          await guarded(kind, `public ${name}: S8a facts`, () => publicPageFacts(page, kind, name));
        }
      });
    }
    await context.close();
  }
}
for (const [kind, options] of Object.entries(VIEWPORTS)) {
  if (!signedIn) break;
  const context = await checkContext(options);
  await context.addCookies([{ name: "uniiverse_sidebar", value: "expanded", url: base }]);
  if (local) await context.addCookies([{ name: "uniiverse_view", value: "player", url: base }]);
  const page = await context.newPage();
  const log = instrument(page);
  await guarded(kind, "sign in", async () => {
    if (!local) await signIn(page);
  });
  await guarded("frame", `${kind}: frame`, () => frameChecks(page, kind, context));
  await guarded(kind, "team overview", async () => {
    if (await visit(page, log, kind, "team", "/team")) {
      playerId ??= await page.locator("[data-testid^=lineup-row-][data-player-id]").first().getAttribute("data-player-id").catch(() => null);
      await axe(page, kind, "team");
      await teamFacts(page, kind);
      await guarded("team", `${kind}: shared kit`, () => sharedKitFacts(page, kind));
    }
  });
  await guarded(kind, "players", async () => {
    if (await visit(page, log, kind, "players", "/players")) {
      await playersFacts(page, kind);
      await axe(page, kind, "players");
      if (kind === "phone") await guarded("navigation", "phone: a profile from the scrolled Players list", () => profileLanding(page));
      if (kind === "desktop") await guarded("navigation", "desktop: Skip to content", () => skipToContent(page));
    }
  });
  if (playerId) {
    await guarded(kind, "profile", async () => {
      if (await visit(page, log, kind, "profile", `/players/${playerId}`)) {
        await noteProfileTabs(page, kind, "overview");
        await axe(page, kind, "profile");
        await guarded("ranked", `${kind}: Ranked progress`, () => rankedProgressEnds(page, kind));
      }
    });
  }
  await guarded("all-champions", `${kind}: All Champions`, () => allChampions(page, log, kind, playerId));
  await guarded("games", `${kind}: Team Matches`, () => teamMatches(page, log, kind, context));
  await guarded("games", `${kind}: Match History`, () => matchHistory(page, log, kind, playerId));
  await guarded(kind, "leaderboards", async () => {
    if (await visit(page, log, kind, "leaderboards", "/leaderboards")) {
      await leaderboardsFacts(page, kind);
      await recordsFacts(page, kind);
      await multikillFacts(page, kind);
      await axe(page, kind, "leaderboards");
      await leaderboardsIndexFacts(page, kind);
      if (kind === "desktop" || kind === "phone") await recordGameFacts(page, kind);
    }
  });
  // Records & achievements' old address: the same page, at its records (the page itself is checked above, so no axe here).
  await guarded(kind, "records", async () => {
    if (await visit(page, log, kind, "records", "/leaderboards?view=records", { fullPage: false })) await recordsLandingFacts(page, kind);
  });
  await guarded(kind, "settings", async () => {
    if (await visit(page, log, kind, "settings", "/settings")) {
      await settingsFacts(page, kind);
      await axe(page, kind, "settings");
    }
  });
  await guarded(kind, "resources", async () => {
    // The rows ask each site for its icon; the check asks none (as the browser tests do). Once any
    // route is installed, Playwright itself aborts every request for /favicon.ico before a route's
    // handler runs, and reports none of them: so no request leaves for another site and every row
    // shows its stand-in. This route is that switch for the Library, should the context's vitals
    // route ever go; its handler never runs.
    const siteIcon = (url) => !url.href.startsWith(base) && url.pathname.endsWith("/favicon.ico");
    await page.route(siteIcon, (route) => route.abort());
    try {
      if (await visit(page, log, kind, "resources", "/resources")) {
        await resourcesFacts(page, kind);
        await axe(page, kind, "resources");
      }
    } finally {
      await page.unroute(siteIcon);
    }
  });
  // Matchup Intel, once, on the desktop: one curated pair (its facts above), at the cost of one page load.
  if (kind === "desktop") {
    await guarded("matchup-intel", `${kind}: Matchup Intel`, async () => {
      const wiki = [];
      const onRequest = (r) => {
        if (/(^|\.)wiki\.leagueoflegends\.com$/.test(new URL(r.url()).hostname)) wiki.push(r.url().slice(0, 120));
      };
      page.on("request", onRequest);
      try {
        if (await visit(page, log, kind, "matchup-intel", "/resources/matchups?champion=Riven&vs=Mordekaiser", { fullPage: false })) {
          await matchupIntelFacts(page, kind, wiki);
          await axe(page, kind, "matchup-intel");
          await guarded("matchup-intel", `${kind}: the five roles`, () => matchupRolesFacts(page, kind));
        }
      } finally {
        page.off("request", onRequest);
      }
    });
  }
  // Wide screens in the desktop's own context (signed in already): four pages at 2560 × 1440.
  if (kind === "desktop") await guarded("frame", "the profile's tabs", async () => profileTabsLevel());
  if (kind === "desktop") await guarded("wide", "2560 × 1440", () => wideChecks(page, log));
  // A phone held sideways, last in the phone's own context (signed in already): two pages at 844 × 390.
  if (kind === "phone") await guarded("frame", "phone held sideways (844 × 390)", () => sidewaysFrame(page, log, playerId));
  // Last in the desktop context, so a mode switch that went wrong cannot affect the other checks. Not
  // under LIVE_LOCAL: the demo build's visitor is the local owner, an administrator.
  if (kind === "desktop" && !local) await guarded("security", "a member's refusals", () => memberRefusals(context));
  await context.close();
}
await browser.close();
healthAndSecurity(playerId);
riotCompliance();

// ── Report ──────────────────────────────────────────────────────────────────────────────────────
const count = (s) => report.checks.filter((c) => c.status === s).length;
report.finishedAt = new Date().toISOString();
report.totals = { pass: count("PASS"), fail: count("FAIL"), warn: count("WARN") };
writeFileSync(`${out}/report.json`, redact(JSON.stringify(report, null, 1)));
const lines = [
  `# Live check: ${base}`,
  "",
  `${report.finishedAt} · deployment ${report.deployment?.commit ?? "unknown"} · ${report.totals.pass} passed, ${report.totals.fail} failed, ${report.totals.warn} warnings · ${report.blockedByEnvironment} resources blocked by this environment (not the app's)`,
  "",
  "## Failures",
  ...(report.totals.fail ? report.checks.filter((c) => c.status === "FAIL").map((c) => `- [${c.area}] ${c.name}: ${JSON.stringify(c.detail)}`) : ["None."]),
  "",
  "## Warnings",
  ...(report.totals.warn ? report.checks.filter((c) => c.status === "WARN").map((c) => `- [${c.area}] ${c.name}: ${JSON.stringify(c.detail)}`) : ["None."]),
  "",
  "Screenshots are beside this file, named <width>-<page>.png.",
];
writeFileSync(`${out}/summary.md`, redact(lines.join("\n") + "\n"));
console.log(`\n${report.totals.pass} passed, ${report.totals.fail} failed, ${report.totals.warn} warnings · deployment ${report.deployment?.commit ?? "unknown"} · report in ${out}`);
process.exit(report.totals.fail ? 1 : 0);
