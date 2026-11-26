/*
  The page budgets (docs/MOBILE.md, "Page budgets"): one set of ceilings, two runners.
    - scripts/ux-measure.mjs, the full matrix (every page × every setup × four text sizes), run by
      hand before a pull request is ready; no CI time, no deploy. Its table goes in the PR body.
    - e2e/page-budgets.spec.ts, a fixed subset on the phone project in CI (every page at i15 100% and
      se1 150%, and the pages a stage changes at its acceptance setups).
  Both open pages the same way and measure them with `measure` below, so a figure means the same in
  either. The ceilings are e2e/page-budgets.json: a ratchet, started at the measured values plus 2%;
  a stage lowers the ceilings of the pages it changes to its acceptance figures, never raises one.

  The setups are the mobile audit's (docs/overhaul ux-mobile.md §0): Chromium with touch and an
  iPhone's safe areas (CDP Emulation.setSafeAreaInsetsOverride); i15s is an iPhone 15 in Safari's
  tab (no insets). Text size is the browser's own default font size (CDP Page.setFontSizes), what a
  real text-size setting changes: the breakpoints move with it (docs/RESPONSIVE.md, "Two ways to
  emulate a larger text size").

  Nothing here names a person: pages are addressed by role ("a profile"), and the output holds
  figures only.
*/

/** @type {Record<string, { width: number; height: number; insets: [number, number, number, number] }>} top, bottom, left, right */
export const SETUPS = {
  se1: { width: 320, height: 568, insets: [20, 0, 0, 0] },
  se3: { width: 375, height: 667, insets: [20, 0, 0, 0] },
  i12: { width: 390, height: 844, insets: [47, 34, 0, 0] },
  i15: { width: 393, height: 852, insets: [59, 34, 0, 0] },
  max: { width: 430, height: 932, insets: [59, 34, 0, 0] },
  land: { width: 852, height: 393, insets: [0, 21, 59, 59] },
  i15s: { width: 393, height: 659, insets: [0, 0, 0, 0] },
};

export const TEXT_SIZES = [100, 125, 150, 200];

/**
 * The pages, by key: Player Mode's, a teammate's profile (its id found on Players), and Admin
 * Mode's (the `uniiverse_view=admin` cookie). `{player}` is replaced by a demo player's id.
 * `data`: the page's height grows with what the demo holds (members, games together, the audit
 * log), which other specs add to in the same run: CI holds its frame, overflow and targets, and
 * its height only in the full matrix, on a fresh demo.
 */
export const PAGES = {
  team: { path: "/team" },
  players: { data: true, path: "/players" },
  leaderboards: { data: true, path: "/leaderboards" },
  matches: { data: true, path: "/matches" },
  "p-overview": { path: "/players/{player}" },
  "p-champions": { path: "/players/{player}/champions" },
  "p-history": { path: "/players/{player}/matches" },
  "p-accounts": { path: "/players/{player}/accounts" },
  me: { path: "/overview" },
  lookup: { path: "/lookup" },
  resources: { path: "/resources" },
  settings: { path: "/settings" },
  // S8a's audit of the pages stage 0 did not cover. `cookies`: a visitor without an account (the
  // local guest cookie) or one of the in-memory demo's viewers (server/auth/demo-viewer.ts: a member
  // with a player profile, or the demo's members in their first sign-in). `then`: what is opened on
  // the page before it is measured. `requires`: a deployment setting the CI demo does not set (the
  // page answers 404 without it), measured only in the full matrix on a server started with it.
  login: { path: "/login", cookies: { uniiverse_guest: "1" } },
  recover: { path: "/recover", cookies: { uniiverse_guest: "1" } },
  privacy: { path: "/privacy", cookies: { uniiverse_guest: "1" } },
  "no-access": { path: "/no-access" },
  public: { path: "/public", cookies: { uniiverse_guest: "1" } },
  "public-lb": { path: "/public/leaderboards", cookies: { uniiverse_guest: "1" }, requires: "UNIIVERSE_PUBLIC_RIOT_DATA" },
  "welcome-password": { path: "/welcome", cookies: { uniiverse_demo_viewer: "newcomer" } },
  "welcome-setup": { path: "/welcome", cookies: { uniiverse_demo_viewer: "halfway" } },
  personalise: { path: "/welcome/personalise", cookies: { uniiverse_demo_viewer: "member" } },
  "own-overview": { path: "/overview", cookies: { uniiverse_demo_viewer: "member" } },
  "own-history": { path: "/overview/matches", cookies: { uniiverse_demo_viewer: "member" } },
  studio: { path: "/players/{player}", then: "studio" },
  "a-dash": { data: true, path: "/admin", admin: true },
  "a-people": { data: true, path: "/admin/people", admin: true },
  "a-branding": { path: "/admin/branding", admin: true },
  "a-system": { data: true, path: "/admin/system", admin: true },
  "a-data": { data: true, path: "/admin/data", admin: true },
  "a-audit": { data: true, path: "/admin/audit", admin: true },
  "a-settings": { path: "/admin/settings", admin: true },
  // Every Admin page since S9c (20 Nov 2026).
  "a-access": { path: "/admin/people/access", admin: true },
  "a-privacy": { data: true, path: "/admin/people/privacy", admin: true },
  "a-previews": { path: "/admin/previews", admin: true },
  "a-resources": { data: true, path: "/admin/resources", admin: true },
};

/** A demo player's id with a full profile (the lineup's first card), from Team Overview. */
export async function findPlayerId(page, base) {
  await page.goto(`${base}/team`, { waitUntil: "domcontentloaded" });
  const id = await page.locator("[data-testid=lineup-row-MID]").first().getAttribute("data-player-id");
  if (!id) throw new Error("no demo player on Team Overview");
  return id;
}

/** Tells a page the setup's safe areas and text size (both through CDP: Chromium only). */
export async function applySetup(page, setup, text) {
  const s = SETUPS[setup];
  const cdp = await page.context().newCDPSession(page);
  const [top, bottom, left, right] = s.insets;
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top, topMax: top, bottom, bottomMax: bottom, left, leftMax: left, right, rightMax: right } });
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: Math.round((16 * text) / 100), fixed: Math.round((13 * text) / 100) } });
  return cdp;
}

/** The context options a setup needs (touch, the window's size). */
export function contextOptions(setup) {
  const s = SETUPS[setup];
  return { viewport: { width: s.width, height: s.height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };
}

/**
 * Measures the page as it is (scrolled to the top): its height in screens, the frame's share of the
 * screen at rest and after a 100px scroll, sideways overflow, and the touch targets under 44px on
 * the first screen. Runs in the page.
 */
export async function measure(page) {
  const atRest = await page.evaluate(frameShare);
  await page.evaluate(() => window.scrollTo(0, 100));
  // The bar's slide (200ms) and a frame for the scroll listener.
  await page.waitForTimeout(350);
  const scrolled = await page.evaluate(frameShare);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
  const rest = await page.evaluate(() => {
    const doc = document.scrollingElement ?? document.documentElement;
    const h = innerHeight;
    // Touch targets on the first screen: links, buttons, tabs and fields drawn there, with the
    // touch-target utility's 44px ::after counted as part of a target.
    const small = [];
    for (const el of document.querySelectorAll("a[href], button, [role=tab], input:not([type=hidden]), select, summary")) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= h) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || Number(cs.opacity) === 0 || cs.clipPath !== "none" || cs.clip !== "auto") continue;
      // Inline links inside a sentence are exempt (WCAG 2.5.8's inline exception).
      if (el.tagName === "A" && cs.display === "inline" && el.parentElement && getComputedStyle(el.parentElement).display !== "flex") continue;
      let height = r.height;
      let width = r.width;
      const after = getComputedStyle(el, "::after");
      if (after.content !== "none" && after.position === "absolute") {
        height = Math.max(height, parseFloat(after.height) || 0);
        width = Math.max(width, (parseFloat(after.width) || 0) || r.width + 12);
      }
      if (Math.min(height, width) < 43.5) small.push(el.getAttribute("data-testid") ?? el.getAttribute("aria-label") ?? el.tagName.toLowerCase());
    }
    // A window open over the page (Card Studio) is what is measured: its own height plus what its
    // scrolling area holds below its fold, not the page under it (until 20 Nov 2026 the studio's
    // figures were the profile's).
    let content = doc.scrollHeight;
    const dialog = [...document.querySelectorAll("dialog[open]")].pop();
    if (dialog) {
      let extra = 0;
      for (const el of dialog.querySelectorAll("*")) {
        const oy = getComputedStyle(el).overflowY;
        if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1) extra = Math.max(extra, el.scrollHeight - el.clientHeight);
      }
      content = dialog.getBoundingClientRect().height + extra;
    }
    // Sideways overflow against the screen's own width (the root's clientWidth): on a phone the layout
    // viewport grows to a page wider than the screen (innerWidth with it), so measured against
    // innerWidth such a page read 0, and its height was measured against a zoomed-out screen (Riot
    // accounts at 320 x 568 and 150%, 26 Nov 2026: a 364px-wide page counted 1.54 screens for 2.03).
    const overflow = Math.max(0, doc.scrollWidth - doc.clientWidth, innerWidth - doc.clientWidth);
    return { screens: Math.round((content / h) * 100) / 100, overflow, small: small.length, smallNames: small.slice(0, 12) };
  });
  return { ...rest, frame: atRest, frameScrolled: scrolled };

  function frameShare() {
    let px = 0;
    for (const id of ["mobile-topbar", "phone-tabbar"]) {
      const el = document.querySelector(`[data-testid=${id}]`);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (getComputedStyle(el).display === "none") continue;
      px += Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    }
    return Math.round((px / innerHeight) * 100) / 100;
  }
}

/** Opens a page in a setup, waits for it to settle, and measures it. */
export async function openAndMeasure(page, base, key, playerId) {
  const p = PAGES[key];
  const path = p.path.replace("{player}", playerId ?? "");
  // Each page's own visitor: the cookies of the page before are taken away first.
  const ctx = page.context();
  for (const name of VISITOR_COOKIES) await ctx.clearCookies({ name });
  if (p.cookies) await ctx.addCookies(Object.entries(p.cookies).map(([name, value]) => ({ name, value, url: base })));
  const res = await page.goto(`${base}${path}`, { waitUntil: "load" });
  if (p.requires && res?.status() === 404) throw new Error(`needs ${p.requires}=true on the server`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  if (p.then) await OPEN[p.then](page);
  return measure(page);
}

const VISITOR_COOKIES = ["uniiverse_guest", "uniiverse_demo_viewer"];

/** What a page's `then` opens before it is measured. */
const OPEN = {
  // Card Studio, from the profile's header (the demo's viewer, the Owner, may edit any card).
  studio: async (page) => {
    await page.locator("[data-testid=profile-header] [data-testid=customise-card]").first().click();
    await page.locator("[data-testid=card-studio]").waitFor();
    await page.waitForTimeout(400);
  },
};

/** A figure over its ceiling (ceilings: e2e/page-budgets.json). Sideways overflow has no ceiling but 0. */
export function overBudget(figures, ceiling, { height = true } = {}) {
  const out = [];
  if (figures.overflow > 0) out.push(`overflow ${figures.overflow}px`);
  if (!ceiling) return out;
  for (const k of height ? ["screens", "frame", "frameScrolled", "small"] : ["frame", "frameScrolled", "small"]) if (ceiling[k] !== undefined && figures[k] > ceiling[k]) out.push(`${k} ${figures[k]} > ${ceiling[k]}`);
  return out;
}
