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
  presses Back, Enter and Escape. It never submits a form after signing in, and never presses a
  bookmark, edit, save, sync, refresh, invite or admin control; its other requests are GETs. As
  with any member's visit, an open game can start the app's own background reads (rank checks).

  Checks:
  - security (#170): signed-out and forged-cookie requests to member and admin pages, including a
    real member's profile, champions, matches and Riot Accounts (the id from the roster, or without
    a sign-in from the public team page's cards), are turned away to the sign-in page and carry no
    player or admin data; the members' API routes answer 401 to both, and the jobs endpoint 401
    without the scheduler's secret or with a wrong one; security headers on the sign-in page.
    Signed in as the verification account (a standard member), the admin pages and the jobs'
    freshness are refused and the mode switch keeps Player Mode (GET requests only, no page).
  - riot (docs/RIOT_COMPLIANCE.md), signed out: /riot.txt, the code Riot's Developer Portal fetches,
    is served as plain text; public Riot data is off, as a Personal key requires
    (/public/leaderboards is not found and the public team page shows no rank); the public team
    page shows Riot's required notice.
  - frame (#178): the charcoal frame token; the sidebar, open and folded, with the gradient bar on
    the current page; the phone and tablet top bar, drawer and tab bar. Phone: the avatar opens the
    account panel on the first tap, made as soon as it is on screen; the panel hangs from the top
    edge, comes to rest (its motion run and dropped) and is whole on the screen, every control in it
    reached by a tap where it is drawn, Sign out in view without scrolling. Tablet and desktop: the
    account menu opens on the first tap or click on its avatar or tile, made as soon as it is on
    screen.
  - All Champions (#178): compact rows, sorted by games, no heading cut short.
  - settings: the picture and display-name help name the public team page, and Settings never
    mentions a Public profile switch (retired; true or false only).
  - games (#178): Team Matches opens a game under its card (no window), with ?match= in the address;
    a copied link opens it; Back returns to it; the keyboard toggles it; "Close this game" closes it
    and keeps the focus on the card. Match History opens games under their cards; its Encounters
    view and the champion window still open.
  - accessibility (#173): axe (WCAG 2.1 A and AA, plus label-content-name-mismatch) on the main pages
    at every width, with a game open, and in the champion window: no serious or critical violation.
  - every page at every width: it loads signed in, no sideways scroll, no page error, no app console
    error, no failed request to the app, no broken image from the app, and a screenshot to review.
*/
import { chromium } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { redact } from "./redact.mjs";
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
    report.health = body ? { ok: body.ok === true, db: body.db?.ok ?? null } : null;
    if (!expected || report.deployment?.commit === expected || Date.now() > deadline) break;
    await new Promise((r) => setTimeout(r, 15_000));
  }
  pass("deploy", "the site answers /api/health, with the app and its database ok", health.status === 200 && report.health?.ok === true && report.health?.db !== false, { status: health.status, health: report.health });
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
  const paths = ["/team", "/players", "/matches", "/leaderboards", "/overview", "/overview/accounts", "/me", "/settings", "/admin", "/admin/players", "/admin/people", "/admin/audit", "/admin/system", "/admin/data"];
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
}

/**
 * Signed in as the verification account, a standard member: Admin Mode stays closed. Requests only
 * (no page, so no document is loaded and no field measurement is sent), GET only, and only the
 * status, the address it is sent to and true/false are reported.
 */
async function memberRefusals(context) {
  const outsideAdmin = (to) => !!to && !new URL(to, base).pathname.startsWith("/admin") && !new URL(to, base).pathname.startsWith("/login");
  for (const path of ["/admin", "/admin/people", "/admin/audit", "/admin/system", "/admin/data", "/admin/settings"]) {
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

async function frameChecks(page, kind, context) {
  await page.goto(`${base}/team`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const paint = await colours(page, { sidebar: "[data-testid=sidebar-window]", top: "[data-testid=mobile-topbar]", tabs: "nav[aria-label=Primary]" });
  pass("frame", `${kind}: the --color-chrome token is deployed`, !!paint.token, paint.token);
  if (kind === "desktop") {
    const side = await page.evaluate(() => {
      const current = document.querySelector("[data-testid=sidebar] nav a[aria-current=page]");
      const bars = current ? [...current.querySelectorAll("span")].map((s) => getComputedStyle(s).backgroundImage).filter((b) => b.includes("gradient")) : [];
      return { current: !!current, gradient: bars.length > 0 };
    });
    pass("frame", "desktop: the sidebar is painted with the frame colour", sameAsFrame(paint.sidebar, paint.chrome), { sidebar: paint.sidebar, chrome: paint.chrome });
    pass("frame", "desktop: the current page carries the blue-to-violet bar", side.current && side.gradient, side);
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
    // Phones have no drawer: the avatar opens the account panel (docs/MOBILE.md, "The account panel").
    // The first tap counts: a fresh load, one tap as soon as the avatar is on screen (before the
    // page's code has run, on a slow load, it is kept and applied once it runs: early-taps.ts), and
    // no second one.
    await page.goto(`${base}/team`, { waitUntil: "commit" });
    const avatar = page.getByTestId("account-sheet-button");
    await avatar.waitFor({ timeout: 20_000 });
    const tappedAt = Date.now();
    await avatar.tap();
    const panel = page.getByTestId("account-sheet");
    const opened = await panel.waitFor({ timeout: 15_000 }).then(() => true, () => false);
    pass("frame", "phone: the avatar opens the account panel on the first tap", opened, { openedAfterMs: opened ? Date.now() - tappedAt : null });
    if (opened) {
      // At rest: its opening motion run and dropped (data-entered), within a second.
      const rested = await page.waitForFunction(() => {
        const d = document.querySelector("[data-testid=account-sheet]");
        return !!d && d.getAttribute("data-entered") === "true" && d.getAnimations().length === 0;
      }, null, { timeout: 5_000 }).then(() => true, () => false);
      // Where it rests: from the top edge (0.5rem down; this browser has no status bar), whole on the
      // screen, every control on it reached by a tap where it is drawn, its body not scrolling, and
      // Sign out (with an account) in view.
      const fit = await panel.evaluate((d) => {
        const box = d.getBoundingClientRect();
        const body = d.querySelector("[data-sheet-scroll]");
        const controls = [...d.querySelectorAll("[data-testid=account-sheet-close], nav a, nav button, [data-testid=mode-switch], [data-testid=sign-out]")];
        const missed = controls.filter((el) => {
          const r = el.getBoundingClientRect();
          const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !(r.top >= 0 && r.bottom <= innerHeight && at && (at === el || el.contains(at)));
        }).length;
        const signOut = d.querySelector("[data-testid=sign-out]");
        const s = signOut?.getBoundingClientRect();
        return {
          top: Math.round(box.top),
          bottom: Math.round(box.bottom),
          height: innerHeight,
          controls: controls.length,
          missed,
          bodyScrolls: !!body && body.scrollHeight > body.clientHeight + 1,
          signOut: s ? { inView: s.top >= Math.max(0, box.top) - 1 && s.bottom <= Math.min(innerHeight, box.bottom) + 1 } : null,
        };
      });
      pass("frame", "phone: the account panel comes to rest, hangs from the top edge and is whole on the screen", rested && Math.abs(fit.top - 8) <= 1 && fit.bottom <= fit.height && !fit.bodyScrolls, { rested, top: fit.top, bottom: fit.bottom, screen: fit.height, bodyScrolls: fit.bodyScrolls });
      pass("frame", "phone: every control in the account panel is reached by a tap where it is drawn", fit.controls >= 3 && fit.missed === 0, { controls: fit.controls, missed: fit.missed });
      if (fit.signOut) pass("frame", "phone: Sign out is in view without scrolling the panel", fit.signOut.inView, fit.signOut);
      else if (local) warn("frame", "phone: Sign out not offered", { why: "LIVE_LOCAL=1: the demo build has no sign-in; the panel holds the mode switch" });
      else pass("frame", "phone: Sign out is in view without scrolling the panel", false, { signOut: null });
      await shot(page, "phone-account-panel");
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    return;
  }
  await page.getByTestId("menu-button").click();
  await page.getByTestId("mobile-drawer-panel").waitFor({ timeout: 5_000 });
  const drawer = await colours(page, { panel: "[data-testid=mobile-drawer-panel]" });
  pass("frame", `${kind}: the drawer is painted with the frame colour`, sameAsFrame(drawer.panel, drawer.chrome), { drawer: drawer.panel, chrome: drawer.chrome });
  await shot(page, `${kind}-frame-drawer`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await accountMenuFirstTap(page, kind, page.getByTestId("mobile-topbar").getByTestId("account-menu-button"));
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
}

async function allChampions(page, log, kind, playerId) {
  const path = playerId ? `/players/${playerId}/champions` : "/overview/champions";
  if (!(await visit(page, log, kind, "all-champions", path))) return;
  await page.getByTestId("all-champions").waitFor({ timeout: 20_000 });
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
    if (kind !== "phone") {
      const roles = await everyRoleRow(page);
      pass("all-champions", `${kind}: rows stay compact for every role beside "In pool" (at most 56 px)`, !!roles && Math.max(...Object.values(roles.heights)) <= 56, roles ?? "no row with a role line to measure");
    }
    pass("all-champions", `${kind}: sorted by games by default`, /games/i.test(facts.sortedBy ?? ""), facts.sortedBy);
  }
  pass("all-champions", `${kind}: no heading cut short`, facts.cut.length === 0, facts.cut);
  await axe(page, kind, "all-champions");
  // The champion window still opens from the list, and Escape closes it.
  const open = page.getByTestId("open-champion").first();
  if (await open.count()) {
    await open.click();
    const win = page.getByTestId("champion-detail");
    const opened = await win.waitFor({ timeout: 15_000 }).then(() => true, () => false);
    if (opened) {
      await page.getByTestId("champion-detail-loading").waitFor({ state: "detached", timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(600);
      await shot(page, `${kind}-champion-window`);
      await axe(page, kind, "champion-window", "[data-testid=champion-detail]");
      await page.keyboard.press("Escape");
    }
    const closed = await win.waitFor({ state: "hidden", timeout: 5_000 }).then(() => true, () => false);
    pass("games", `${kind}: the champion window opens and Escape closes it`, opened && closed, { opened, closed });
  }
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
  }
  await page.goBack();
  const closed = await win.waitFor({ state: "detached", timeout: 15_000 }).then(() => true, () => false);
  pass("games", `${kind}: Back closes the game and returns to ${name}`, closed && !/[?&]match=/.test(page.url()), page.url().replace(base, ""));
}

async function teamMatches(page, log, kind, context) {
  if (!(await visit(page, log, kind, "team-matches", "/matches", { fullPage: false }))) return;
  const games = page.getByTestId("together-game");
  if (!(await games.first().waitFor({ timeout: 20_000 }).then(() => true, () => false))) return warn("games", `${kind}: Team Matches lists no games`, "nothing to open");
  const game = games.first();
  if (kind === "phone") return phoneGame(page, kind, "Team Matches", "team-matches", () => game.getByTestId("together-card").click({ position: { x: 24, y: 12 } }));
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

async function matchHistory(page, log, kind, playerId) {
  const path = playerId ? `/players/${playerId}/matches` : "/overview/matches";
  if (!(await visit(page, log, kind, "match-history", path, { fullPage: false }))) return;
  const card = page.getByTestId("match-card").first();
  if (!(await card.waitFor({ timeout: 20_000 }).then(() => true, () => false))) return warn("games", `${kind}: Match History lists no games`, path);
  if (kind === "phone") await phoneGame(page, kind, "Match History", "match-history", () => card.click({ position: { x: 24, y: 16 } }));
  else {
    await card.click({ position: { x: 24, y: 16 } });
    const opened = await page.getByTestId("match-expanded").getByTestId("match-breakdown").first().waitFor({ timeout: 30_000 }).then(() => true, () => false);
    pass("games", `${kind}: Match History opens a game under its card`, opened);
    await shot(page, `${kind}-match-history-open`);
    if (kind !== "tablet") await axe(page, kind, "match-history-game-open");
  }
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
        if (await visit(page, log, kind, `public-${name}`, path, { publicPage: true })) await axe(page, kind, `public-${name}`);
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
    }
  });
  await guarded(kind, "players", async () => {
    if (await visit(page, log, kind, "players", "/players")) await axe(page, kind, "players");
  });
  if (playerId) {
    await guarded(kind, "profile", async () => {
      if (await visit(page, log, kind, "profile", `/players/${playerId}`)) await axe(page, kind, "profile");
    });
  }
  await guarded("all-champions", `${kind}: All Champions`, () => allChampions(page, log, kind, playerId));
  await guarded("games", `${kind}: Team Matches`, () => teamMatches(page, log, kind, context));
  await guarded("games", `${kind}: Match History`, () => matchHistory(page, log, kind, playerId));
  await guarded(kind, "leaderboards", async () => {
    if (await visit(page, log, kind, "leaderboards", "/leaderboards")) await axe(page, kind, "leaderboards");
  });
  await guarded(kind, "settings", async () => {
    if (await visit(page, log, kind, "settings", "/settings")) {
      await settingsFacts(page, kind);
      await axe(page, kind, "settings");
    }
  });
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
