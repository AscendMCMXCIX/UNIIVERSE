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
  presses Back, Forward, Enter and Escape. It never submits a form after signing in, and never
  presses a bookmark, edit, save, sync, refresh, invite or admin control. As with any member's
  visit, an open game can start the app's own background reads (rank checks).

  Checks:
  - security (#170): signed-out and forged-cookie requests to member pages are turned away to the
    sign-in page and carry no player data; security headers on the sign-in page.
  - riot (docs/RIOT_COMPLIANCE.md), signed out: /riot.txt, the code Riot's Developer Portal fetches,
    is served as plain text; public Riot data is off, as a Personal key requires
    (/public/leaderboards is not found and the public team page shows no rank); the public team
    page shows Riot's required notice.
  - frame (#178): the charcoal frame token; the sidebar, open and folded, with the gradient bar on
    the current page; the phone and tablet top bar, drawer and tab bar.
  - All Champions (#178): compact rows, sorted by games, no heading cut short.
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
function check(area, name, status, detail) {
  report.checks.push({ area, name, status, detail: detail ?? null });
  const shown = detail === undefined ? "" : `  ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
  console.log(`${status.padEnd(4)} [${area}] ${name}${shown.slice(0, 400)}`);
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
function http(path, cookie) {
  const head = `${out}/.headers`, body = `${out}/.body`;
  const args = ["-s", "--max-time", "30", "-D", head, "-o", body, "-w", "%{http_code}|%{redirect_url}|%{time_total}"];
  if (cookie) args.push("-H", `Cookie: ${cookie}`);
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
const leaks = (r) => /puuid|data-player-id|data-player-name|gameName|tagLine/i.test(r.text);

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

function healthAndSecurity(playerId) {
  if (local) return warn("security", "security checks skipped", "LIVE_LOCAL=1: the demo build has no sign-in");
  const forged = `uniiverse_session=s1.${"x".repeat(40)}`;
  const paths = ["/team", "/players", "/matches", "/leaderboards", "/overview", "/me", "/settings", "/admin/players"];
  if (playerId) paths.push(`/players/${playerId}`, `/players/${playerId}/champions`, `/players/${playerId}/matches`);
  for (const path of paths) {
    const anon = http(path);
    pass("security", `signed out: ${path} is turned away to sign-in, with no player data`, turnedAway(anon) && !leaks(anon), { status: anon.status, to: anon.redirect.replace(base, ""), leak: leaks(anon) });
    const fake = http(path, forged);
    pass("security", `forged session cookie: ${path} is turned away, with no player data`, turnedAway(fake) && !leaks(fake), { status: fake.status, to: fake.redirect.replace(base, ""), leak: leaks(fake) });
  }
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

// ── Browser ───────────────────────────────────────────────────────────────────────────────────
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  tablet: { viewport: { width: 768, height: 1024 }, hasTouch: true, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const proxy = !local && process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined;
const executablePath = process.env.PW_CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

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
  const facts = await page.evaluate(() => ({
    at: location.pathname + location.search,
    scrollX: document.documentElement.scrollWidth - innerWidth,
    brokenImages: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc.startsWith(location.origin)).map((i) => i.currentSrc.slice(location.origin.length, location.origin.length + 80)),
  }));
  await shot(page, `${kind}-${name}`, fullPage);
  const consoleErrors = log.console.slice(from.c), pageErrors = log.pageErrors.slice(from.e), failed = log.failed.slice(from.f);
  const status = res?.status() ?? 0;
  report.pages.push({ kind, name, path, status, ...facts, consoleErrors, pageErrors, failed });
  const loaded = status > 0 && status < 400 && (publicPage || (!facts.at.startsWith("/login") && !facts.at.startsWith("/no-access")));
  pass(kind, `${name}: loads${publicPage ? "" : " signed in"} (${path})`, loaded, { status, at: facts.at });
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
    return;
  }
  pass("frame", `${kind}: the top bar is painted with the frame colour`, sameAsFrame(paint.top, paint.chrome), { topBar: paint.top, chrome: paint.chrome });
  if (kind === "phone") pass("frame", "phone: the tab bar is painted with the frame colour", sameAsFrame(paint.tabs, paint.chrome), { tabBar: paint.tabs, chrome: paint.chrome });
  await page.getByTestId("menu-button").click();
  await page.getByTestId("mobile-drawer-panel").waitFor({ timeout: 5_000 });
  const drawer = await colours(page, { panel: "[data-testid=mobile-drawer-panel]" });
  pass("frame", `${kind}: the drawer is painted with the frame colour`, sameAsFrame(drawer.panel, drawer.chrome), { drawer: drawer.panel, chrome: drawer.chrome });
  await shot(page, `${kind}-frame-drawer`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
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
    };
  });
  pass("all-champions", `${kind}: lists champions`, facts.rows > 0, facts.rows);
  if (kind !== "phone") pass("all-champions", `${kind}: rows are compact (at most 56 px)`, facts.heights.length > 0 && Math.max(...facts.heights) <= 56, facts.heights);
  pass("all-champions", `${kind}: sorted by games by default`, /games/i.test(facts.sortedBy ?? ""), facts.sortedBy);
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

async function teamMatches(page, log, kind, context) {
  if (!(await visit(page, log, kind, "team-matches", "/matches", { fullPage: false }))) return;
  const games = page.getByTestId("together-game");
  if (!(await games.first().waitFor({ timeout: 20_000 }).then(() => true, () => false))) return warn("games", `${kind}: Team Matches lists no games`, "nothing to open");
  const game = games.first();
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
  await card.click({ position: { x: 24, y: 16 } });
  const opened = await page.getByTestId("match-expanded").getByTestId("match-breakdown").first().waitFor({ timeout: 30_000 }).then(() => true, () => false);
  pass("games", `${kind}: Match History opens a game under its card`, opened);
  await shot(page, `${kind}-match-history-open`);
  if (kind !== "tablet") await axe(page, kind, "match-history-game-open");
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
// The public pages, signed out, at every width: what anyone can open (the public team page and its
// leaderboards only where the team turned them on).
if (!local) {
  for (const [kind, options] of Object.entries(VIEWPORTS)) {
    const context = await browser.newContext({ ...options, reducedMotion: "reduce" });
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
  const context = await browser.newContext({ ...options, reducedMotion: "reduce" });
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
    if (await visit(page, log, kind, "settings", "/settings")) await axe(page, kind, "settings");
  });
  await context.close();
}
await browser.close();
healthAndSecurity(playerId);
riotCompliance();

// ── Report ──────────────────────────────────────────────────────────────────────────────────────
const count = (s) => report.checks.filter((c) => c.status === s).length;
report.finishedAt = new Date().toISOString();
report.totals = { pass: count("PASS"), fail: count("FAIL"), warn: count("WARN") };
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
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
writeFileSync(`${out}/summary.md`, lines.join("\n") + "\n");
console.log(`\n${report.totals.pass} passed, ${report.totals.fail} failed, ${report.totals.warn} warnings · deployment ${report.deployment?.commit ?? "unknown"} · report in ${out}`);
process.exit(report.totals.fail ? 1 : 0);
