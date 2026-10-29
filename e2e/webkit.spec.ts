import { devices, expect, test, type Locator, type Page } from "./test";
import { emulateKeyboard, keyboard } from "./keyboard";
import { expectClearCorner } from "./modal-corner";
import path from "node:path";

/*
  SAFARI'S ENGINE. Runs only in the opt-in "webkit" project (E2E_WEBKIT=1 locally, or the WebKit
  workflow on GitHub, started by hand): the priority pages in WebKit as Playwright builds it, on an
  iPhone-sized touch screen. That is Safari's engine on Linux, not Safari on an iPhone: the Home
  Screen app, the iOS keyboard (emulated here, as in the Chromium tests) and real touch scrolling
  still need a device (docs/RESPONSIVE.md → Safari and iPhones). Every other test runs in Chromium
  on the phone, tablet and desktop projects.
  The shared fixture fails a test on any uncaught page error, hydration mismatches included.
*/

test.describe.configure({ timeout: 120_000 });

test.beforeEach(async ({ context, baseURL }, info) => {
  test.skip(info.project.name !== "webkit", "Safari's engine only (E2E_WEBKIT=1)");
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

/** Nothing on the page is wider than the screen. */
async function fitsWidth(page: Page, label: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${label}: no sideways scrolling`).toBeLessThanOrEqual(1);
}

test("the priority pages load without an error and without sideways scrolling", async ({ page }) => {
  for (const route of ["/team", "/players", "/leaderboards", "/matches", "/resources", "/settings", "/admin", "/admin/people", "/admin/system"]) {
    await page.goto(route);
    await expect(page.locator("main"), route).toBeVisible();
    await expect(page.locator("h1").first(), route).toBeVisible();
    await fitsWidth(page, route);
  }
});

test("Team Overview: the cards are one sideways track, a role tab brings its card into view, and names are whole", async ({ page }) => {
  await page.goto("/team");
  await expect(page.getByTestId("lineup-cell")).toHaveCount(5);
  await fitsWidth(page, "/team");
  const pager = page.getByTestId("lineup-pager");
  // A tap before the page is interactive does nothing: tap until the track has moved. The tab's job
  // is to bring its card across into view, whole from side to side; how much of its height fits
  // depends on what is above the track (the page scrolls for the rest).
  await expect(async () => {
    await pager.getByRole("tab", { name: /^Mid/ }).tap();
    const box = (await page.getByTestId("lineup-row-MID").boundingBox())!;
    expect(box.x, "the card's left edge on screen").toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width, "the card's right edge on screen").toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    await expect(page.getByTestId("lineup-row-MID")).toBeInViewport({ ratio: 0.75, timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(pager.getByRole("tab", { name: /^Mid/ })).toHaveAttribute("aria-selected", "true");
  const name = page.getByTestId("lineup-row-MID").getByTestId("card-name");
  await expect(name).toBeVisible();
  expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1)).toBe(true);
});

test("Team Overview: a card turns over with nothing of the side turned away left drawn, its links and controls included", async ({ page }) => {
  await page.goto("/team");
  await expect(page.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
  // The demo's Support card has a substitute, and the substitute's side has a link.
  await expect(async () => {
    await page.getByTestId("lineup-pager").getByRole("tab", { name: /^Support/ }).tap();
    await expect(page.getByTestId("lineup-row-SUPPORT")).toBeInViewport({ ratio: 0.5, timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  const card = page.getByTestId("lineup-card-SUPPORT");
  // A turn there and a turn back, each with its clock stepped by hand (WebKit here draws few frames
  // a second, so live sampling would see almost none): how far through the turn, what each side
  // shows, and what is drawn over the art on each side.
  const turns = await card.evaluate(async (el) => {
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const face = (s: string) => el.querySelector<HTMLElement>(s)!;
    const overlay = (f: HTMLElement) => Math.max(...[...f.querySelectorAll<HTMLElement>("[data-card-overlay]")].map((o) => Number(getComputedStyle(o).opacity)));
    const run = async (from: string, to: string, control: string) => {
      // The turn's own animations (not CSS transitions), as soon as React has started them.
      const started = async () => {
        for (let i = 0; i < 50; i++) {
          const own = el.getAnimations({ subtree: true }).filter((a) => !(a instanceof CSSTransition) && !(a instanceof CSSAnimation));
          if (own.length) return own;
          await new Promise((r) => setTimeout(r, 0));
        }
        return [];
      };
      (face(from).querySelector(`[data-testid=${control}]`) as HTMLElement).click();
      const turn = await started();
      const total = Number(turn[0]?.effect?.getComputedTiming().duration ?? 0);
      turn.forEach((a) => a.pause());
      const out: Array<{ t: number; leaving: string; leavingOverlay: number; arriving: number; arrivingOverlay: number }> = [];
      for (let step = 0; step <= 20; step++) {
        turn.forEach((a) => (a.currentTime = (total * step) / 20));
        out.push({ t: step / 20, leaving: getComputedStyle(face(from)).visibility, leavingOverlay: overlay(face(from)), arriving: Number(getComputedStyle(face(to)).opacity), arrivingOverlay: overlay(face(to)) });
      }
      turn.forEach((a) => a.finish());
      while ((await frame(), el.dataset.turn));
      const links = [...face(from).querySelectorAll<HTMLElement>("[data-card-overlay] a, [data-card-overlay] button")];
      // Settled: every link and control of the side turned away is hidden and cannot be hit.
      const rest = links.map((l) => {
        const b = l.getBoundingClientRect();
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return { hidden: getComputedStyle(l).visibility === "hidden", hit: !!hit && l.contains(hit) };
      });
      return { out, animations: turn.length, rest };
    };
    const there = await run(".flip-face-front", ".flip-face-back", "flip-to-substitute");
    const back = await run(".flip-face-back", ".flip-face-front", "flip-back");
    return [there, back];
  });
  for (const [i, turn] of turns.entries()) {
    const which = i === 0 ? "to the substitute" : "back to the starter";
    expect(turn.animations, `${which}: the turn runs on its own animations`).toBeGreaterThan(3);
    for (const f of turn.out) {
      if (f.t > 0.2) expect(f.leavingOverlay, `${which} at ${f.t.toFixed(2)}: the leaving side's links and controls are gone`).toBe(0);
      if (f.t > 0.5) expect(f.leaving, `${which} at ${f.t.toFixed(2)}: the leaving side is hidden`).toBe("hidden");
      if (f.t < 0.5) expect(f.arriving, `${which} at ${f.t.toFixed(2)}: the arriving side is not drawn yet`).toBe(0);
      if (f.t < 0.6) expect(f.arrivingOverlay, `${which} at ${f.t.toFixed(2)}: the arriving side's links and controls wait`).toBe(0);
    }
    expect(turn.rest.length, which).toBeGreaterThan(0);
    for (const r of turn.rest) expect(r, `${which}: settled`).toEqual({ hidden: true, hit: false });
  }
  await expect(page.getByTestId("lineup-row-SUPPORT")).toBeVisible();
});

test("a teammate's profile: its sections switch, and a champion's window opens and closes", async ({ page }) => {
  await page.goto("/players");
  const href = (await page.locator("main a[data-testid='player-card'][data-player-name='Demo Top']").getAttribute("href"))!;
  await page.goto(`${href}/champions`);
  const tabs = page.getByTestId("profile-tabs");
  await expect(tabs.getByRole("link", { name: "All Champions" })).toHaveAttribute("aria-current", "page");
  await fitsWidth(page, "All Champions");
  const open = page.getByTestId("open-champion").first();
  await expect(async () => {
    await open.tap();
    await expect(page.getByTestId("champion-overview")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  // The window fills the phone's width and nothing in it scrolls sideways.
  const box = (await page.locator("dialog[open]").boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  // Its close button keeps the corner to itself, a 44px target (e2e/modal-corner.ts).
  await expectClearCorner(page);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("champion-detail")).toBeHidden();
  await tabs.getByRole("link", { name: "Match History" }).tap();
  await expect(page).toHaveURL(new RegExp(`${href}/matches$`));
  await expect(tabs.getByRole("link", { name: "Match History" })).toHaveAttribute("aria-current", "page");
});

test("Match History: a game opens under its card, and once it has checked the players' ranks the card shows them under their icons, inside the card", async ({ page }) => {
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-ADC").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/matches`);
  // A game nobody has opened yet (its players show no rank).
  const unchecked = page.getByTestId("match-card").filter({ has: page.getByTestId("match-teams") }).filter({ hasNot: page.getByTestId("slot-rank") });
  const matchId = (await unchecked.first().getByTestId("match-row").getAttribute("data-match"))!;
  const card = page.getByTestId("match-card").filter({ has: page.locator(`[data-match="${matchId}"]`) });
  const row = card.getByTestId("match-row");
  await expect(async () => {
    if ((await row.getAttribute("aria-expanded")) !== "true") await card.tap({ position: { x: 24, y: 16 }, timeout: 2_000 });
    await expect(row).toHaveAttribute("aria-expanded", "true", { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  const breakdown = card.locator("xpath=..").getByTestId("match-breakdown");
  await expect(breakdown).toBeVisible({ timeout: 15_000 });
  // The breakdown and its scoreboard fit the phone's width.
  await fitsWidth(page, "an open game");
  // The browser tests' Riot stand-in answers the check (server/riot/browser-test.ts).
  const note = breakdown.getByTestId("ranks-note");
  await expect(note).toBeVisible({ timeout: 15_000 });
  await expect(note).not.toHaveAttribute("data-state", "checking", { timeout: 15_000 });
  // The card closes it again.
  await card.tap({ position: { x: 24, y: 16 } });
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await expect(breakdown).toHaveCount(0);
  await expect(card.getByTestId("slot-rank").first()).toBeVisible();
  // On a phone each rank sits under its opponent's icon: the ten icons stay on one line, no two
  // ranks overlap, and every rank is inside the card.
  const g = await card.evaluate((el) => {
    const box = (e: Element) => e.getBoundingClientRect().toJSON() as DOMRect;
    const slots = [...el.querySelectorAll('[data-testid="team-slot"]')];
    return {
      card: box(el),
      iconTops: slots.map((s) => box(s.firstElementChild!).top),
      ranks: slots.flatMap((s) => {
        const r = s.querySelector('[data-testid="slot-rank"]');
        return r ? [{ rank: box(r), icon: box(s.firstElementChild!) }] : [];
      }),
    };
  });
  expect(g.ranks.length).toBeGreaterThan(0);
  expect(Math.max(...g.iconTops) - Math.min(...g.iconTops), "the icons on one line").toBeLessThanOrEqual(1);
  for (const [i, { rank, icon }] of g.ranks.entries()) {
    expect(rank.top, "under its icon").toBeGreaterThanOrEqual(icon.bottom - 0.5);
    expect(rank.left >= g.card.left - 0.5 && rank.right <= g.card.right + 0.5 && rank.bottom <= g.card.bottom + 0.5, "inside the card").toBe(true);
    for (const { rank: other } of g.ranks.slice(i + 1)) expect(rank.right <= other.left + 0.5 || other.right <= rank.left + 0.5, "two ranks overlap").toBe(true);
  }
  await fitsWidth(page, "Match History");
});

test("Encounters: each player's badge, chips and record share the line under the name, and a Mixed player's window splits the games by side", async ({ page }) => {
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-SUPPORT").getAttribute("data-player-id"))!;
  // Everyone, every player met at least once (the demo has each member meet one player on both sides).
  await page.goto(`/players/${id}/matches?view=encounters&rel=everyone&min=1`);
  await expect(page.locator("[data-testid='encounters'][data-ready]")).toBeVisible();
  const rows = page.getByTestId("encounter-row");
  await expect(rows.first()).toBeVisible();
  for (const row of (await rows.all()).slice(0, 6)) {
    expect(await row.locator("[title]").first().evaluate((name) => name.scrollWidth - name.clientWidth), "the name is whole").toBeLessThanOrEqual(1);
    const [badge, record] = [(await row.getByTestId("encounter-kind").boundingBox())!, (await row.getByTestId("encounter-record").boundingBox())!];
    expect(Math.abs(badge.y + badge.height / 2 - (record.y + record.height / 2)), "the badge and the record on one line").toBeLessThanOrEqual(2);
  }
  await fitsWidth(page, "Encounters");
  // A Mixed player's window: the games against them, then those alongside them.
  const detail = page.getByTestId("encounter-detail");
  const mixed = page.locator("[data-testid='encounter-row'][data-kind='mixed']").first();
  await expect(async () => {
    if (!(await detail.isVisible())) await mixed.tap({ timeout: 2_000 });
    await expect(detail).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(detail.getByTestId("encounter-kind")).toHaveText("Mixed");
  await expect(detail.getByTestId("encounter-games-section")).toHaveCount(2);
  expect((await page.locator("dialog[open]").boundingBox())!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await expectClearCorner(page);
  await page.keyboard.press("Escape");
  await expect(detail).toBeHidden();
});

test("Player Customisation: the Studio opens, its sections switch from the section list, and Cancel keeps the saved card", async ({ page }) => {
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}`);
  await expect(page.getByTestId("profile-header")).toBeVisible();
  const frame = await page.getByTestId("profile-header").getAttribute("data-frame");
  await expect(async () => {
    await page.getByTestId("profile-header").getByTestId("customise-card").tap();
    await expect(page.getByTestId("card-studio")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await page.getByTestId("studio-section-toggle").tap();
  await page.getByTestId("studio-section-colours").tap();
  await expect(page.getByTestId("card-studio")).toHaveAttribute("data-step", "colours");
  await page.getByTestId("palettes").getByRole("button", { name: /Ember/ }).tap();
  await expect(page.getByLabel("Primary colour: hex value")).toHaveValue("#ff8a3d");
  // The Studio fits the phone; only its controls scroll.
  expect(await page.evaluate((w) => [...document.querySelectorAll("dialog *")].filter((e) => e.getBoundingClientRect().right > w + 1).length, page.viewportSize()!.width)).toBe(0);
  await page.getByTestId("studio-cancel").tap();
  await page.getByTestId("studio-confirm-yes").tap();
  await expect(page.getByTestId("card-studio")).toBeHidden();
  await expect(page.getByTestId("profile-header")).toHaveAttribute("data-frame", frame ?? "none");
});

test("Admin Mode: the menu's switch moves between Admin Mode and Player Mode, each with its own tab bar", async ({ page }) => {
  const tabs = page.getByRole("navigation", { name: "Primary" }).getByRole("link");
  const drawer = page.getByRole("dialog", { name: "Menu" });
  await page.goto("/admin");
  await expect(page.getByTestId("mobile-topbar")).toContainText("Admin mode");
  await expect(tabs).toHaveText(["Dashboard", "Users", "Settings", "Health"]);
  await page.getByRole("button", { name: "Open menu" }).tap();
  await drawer.getByTestId("mode-switch").tap();
  await expect(page).toHaveURL(/\/team$/);
  await expect(tabs).toHaveText(["Profile", "Team", "Resources"]);
});

test("forms: text fields are at least 16px (Safari zooms into smaller ones) and sign-in offers saved passwords", async ({ browser, page, baseURL }) => {
  await page.goto("/settings");
  const field = page.getByTestId("display-name-form").getByLabel("Display name");
  await expect(field).toBeVisible();
  expect(parseFloat(await field.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  // Sign-in, as a visitor (locally, a browser holding the guest cookie): the browser's password
  // manager can fill both fields.
  const { defaultBrowserType: _, ...iphone } = devices["iPhone 15"];
  const guest = await browser.newContext(iphone);
  await guest.addCookies([{ name: "uniiverse_guest", value: "1", url: baseURL! }]);
  const login = await guest.newPage();
  await login.goto("/login");
  const username = login.locator("#username");
  const password = login.locator("#password");
  await expect(username).toHaveAttribute("autocomplete", "username");
  await expect(password).toHaveAttribute("autocomplete", "current-password");
  for (const input of [username, password]) expect(parseFloat(await input.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  await username.fill("someone");
  await expect(username).toHaveValue("someone");
  await guest.close();
});

test("the sign-in window on an iPhone: the whole screen, the fields and Sign in above the keyboard, an error in view, and Close back to Sign in", async ({ browser, baseURL }) => {
  // As a visitor (locally, a browser holding the guest cookie), with the keyboard emulated: WebKit
  // here has none either (keyboard.ts). What the real iOS keyboard does still needs a device.
  const { defaultBrowserType: _, ...iphone } = devices["iPhone 15"];
  const guest = await browser.newContext(iphone);
  await guest.addCookies([{ name: "uniiverse_guest", value: "1", url: baseURL! }]);
  const page = await guest.newPage();
  await emulateKeyboard(page);
  await page.goto("/public");
  const signIn = page.getByTestId("public-sign-in");
  const dialog = page.getByRole("dialog", { name: "Sign in" });
  // A tap before the page is interactive does nothing: tap until the window opens.
  await expect(async () => {
    await signIn.tap();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  const { width, height } = page.viewportSize()!;
  const box = async (target: Locator) => {
    const b = (await target.boundingBox())!;
    return { top: Math.round(b.y), bottom: Math.round(b.y + b.height), left: Math.round(b.x), width: Math.round(b.width), height: Math.round(b.height) };
  };
  await expect.poll(async () => Object.values(await box(dialog)).join(" ")).toBe(`0 ${height} 0 ${width} ${height}`);
  const username = dialog.getByLabel("Username");
  const password = dialog.getByLabel("Password");
  const submit = dialog.getByRole("button", { name: "Sign in" });
  const close = dialog.getByRole("button", { name: "Close" });
  await expect(username).toBeFocused();
  // The keyboard comes up: the window fits above it, with the fields, Sign in and Close in view.
  const above = height - 300;
  await keyboard(page, 300);
  await expect.poll(async () => (await box(dialog)).bottom).toBeLessThanOrEqual(above);
  for (const target of [username, password, submit, close]) {
    const { top, bottom } = await box(target);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(bottom).toBeLessThanOrEqual(above);
  }
  // Return goes on to the password; a wrong one is told in the window, above the keyboard.
  await username.fill("nobody-here");
  await username.press("Enter");
  await expect(password).toBeFocused();
  await password.fill("not-the-password-1");
  await submit.tap();
  const error = dialog.getByTestId("login-error");
  await expect(error).toBeVisible();
  await expect.poll(async () => (await box(error)).bottom).toBeLessThanOrEqual(above);
  // The keyboard goes away; Close is a full-size target and returns to Sign in.
  await keyboard(page, 0);
  expect(Math.min((await box(close)).width, (await box(close)).height)).toBeGreaterThanOrEqual(44);
  await close.tap();
  await expect(dialog).toBeHidden();
  await expect(signIn).toBeFocused();
  await guest.close();
});

test("held sideways: the pages fit and the phone tab bar steps aside", async ({ browser }) => {
  const { defaultBrowserType: _, ...landscape } = devices["iPhone 15 landscape"];
  const context = await browser.newContext(landscape);
  const page = await context.newPage();
  for (const route of ["/team", "/players", "/resources"]) {
    await page.goto(route);
    await expect(page.locator("main"), route).toBeVisible();
    await fitsWidth(page, `${route}, sideways`);
    await expect(page.getByRole("navigation", { name: "Primary" }), route).toBeHidden();
  }
  await context.close();
});

test("Players held sideways: cards side by side line up region by region, every portrait whole", async ({ browser, baseURL }) => {
  // Each card spans rows of the directory's grid (a subgrid): Safari has to share them too.
  const { defaultBrowserType: _, ...landscape } = devices["iPhone 15 landscape"];
  const context = await browser.newContext(landscape);
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  const page = await context.newPage();
  await page.goto("/players");
  await expect(page.locator("main [data-testid=player-card-item]").first()).toBeVisible();
  const rows = await page.getByTestId("players-directory").evaluate((grid) => {
    const cards = [...grid.querySelectorAll<HTMLElement>("[data-testid=player-card-item]")].map((card) => {
      const c = card.getBoundingClientRect();
      const top = (selector: string) => {
        const el = card.querySelector(selector);
        return el ? el.getBoundingClientRect().top - c.top : null;
      };
      const drawn = [...card.querySelectorAll("[data-testid=pool-portrait], [data-testid=directory-pool-more]")].filter((el) => el.getBoundingClientRect().width > 0 && getComputedStyle(el).display !== "none");
      return { top: Math.round(c.top), height: c.height, name: top("[data-testid=card-name]"), labels: top("[data-testid=card-fit]"), heading: top("[data-testid=directory-primary-role], [data-testid=directory-no-roles]"), cut: drawn.some((el) => el.getBoundingClientRect().right > c.right - 1) };
    });
    return [...new Set(cards.map((c) => c.top))].map((t) => cards.filter((c) => c.top === t));
  });
  const spread = (values: Array<number | null>) => Math.max(...values.map(Number)) - Math.min(...values.map(Number));
  expect(rows[0]!.length, "two cards side by side").toBeGreaterThan(1);
  for (const row of rows.filter((r) => r.length > 1)) {
    expect(spread(row.map((c) => c.height)), "the same height").toBeLessThanOrEqual(1);
    for (const key of ["name", "labels", "heading"] as const) expect(spread(row.map((c) => c[key])), `${key} level`).toBeLessThanOrEqual(1);
  }
  expect(rows.flat().filter((c) => c.cut), "no portrait cut").toEqual([]);
  await fitsWidth(page, "Players, sideways");
  await context.close();
});

test("Home Screen: the page declares itself an app for iOS, with its icon, the manifest and the notch's safe areas", async ({ page, request }) => {
  await page.goto("/team");
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"], meta[name="mobile-web-app-capable"]').first()).toHaveAttribute("content", "yes");
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute("content", "black-translucent");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);
  const icon = await page.locator('link[rel="apple-touch-icon"]').first().getAttribute("href");
  expect(icon).toBeTruthy();
  const res = await request.get(icon!);
  expect(res.ok()).toBe(true);
  expect(res.headers()["content-type"]).toMatch(/^image\//);
  expect((await request.get((await page.locator('link[rel="manifest"]').getAttribute("href"))!)).ok()).toBe(true);
});

test("an uploaded logo: at the start of the top bar, animated unless motion is reduced, and centred on the collapsed sidebar with the icons", async ({ page, browser, baseURL }) => {
  test.setTimeout(180_000);
  await page.context().addCookies([{ name: "uniiverse_view", value: "admin", url: baseURL! }]);
  await page.goto("/admin/branding");
  const card = page.locator("[data-testid=brand-logo][data-ready=true]");
  await expect(card).toBeVisible();
  await card.locator("input[type=file]").setInputFiles(path.join(__dirname, "fixtures/animated-logo.gif"));
  await expect(page.getByText(/Logo updated \(animated\)/)).toBeVisible({ timeout: 60_000 });
  try {
    // The logo is a picture whose still-frame source is not displayed: WebKit still picks the
    // source by its media query, and the source takes no place in the top bar's row.
    const { defaultBrowserType: _, ...iphone } = devices["iPhone 15"];
    for (const reducedMotion of ["no-preference", "reduce"] as const) {
      const context = await browser.newContext({ ...iphone, reducedMotion });
      await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
      const phone = await context.newPage();
      await phone.goto("/team");
      const link = phone.getByTestId("mobile-topbar").locator("a[title]");
      await expect.poll(() => link.locator("img").evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
      const shown = await link.evaluate((a) => {
        const img = a.querySelector("img")!;
        return { inset: img.getBoundingClientRect().left - a.getBoundingClientRect().left, src: new URL(img.currentSrc).pathname };
      });
      expect(Math.abs(shown.inset), `${reducedMotion}: the logo starts ${shown.inset}px into the top bar's link`).toBeLessThanOrEqual(0.5);
      expect(shown.src, reducedMotion).toBe(reducedMotion === "reduce" ? "/api/branding/logo-static" : "/api/branding/logo");
      await context.close();
    }
    // Safari on a Mac: the collapsed desktop sidebar's logo on the rail's centre line, with the icons.
    const { defaultBrowserType: __, ...mac } = devices["Desktop Safari"];
    const context = await browser.newContext({ ...mac, viewport: { width: 1440, height: 900 } });
    await context.addCookies([
      { name: "uniiverse_view", value: "player", url: baseURL! },
      { name: "uniiverse_sidebar", value: "collapsed", url: baseURL! },
    ]);
    const desk = await context.newPage();
    await desk.goto("/team");
    await desk.mouse.move(1430, 890);
    await expect(desk.getByTestId("sidebar")).toHaveAttribute("data-collapsed", "true");
    const c = await desk.evaluate(() => {
      const mid = (e: Element) => {
        const r = e.getBoundingClientRect();
        return (r.left + r.right) / 2;
      };
      const aside = document.querySelector("[data-testid=sidebar]")!;
      return { logo: mid(aside.querySelector("a[title] img")!), rail: mid(document.querySelector("[data-testid=sidebar-slot]")!), icons: [...aside.querySelectorAll("[data-testid=sidebar-toggle] svg, nav a svg")].map(mid) };
    });
    for (const x of [c.rail, ...c.icons]) expect(Math.abs(c.logo - x), `the logo's centre ${c.logo}, the rail's or an icon's ${x}`).toBeLessThanOrEqual(0.5);
    await context.close();
  } finally {
    // Back to the usual team mark for every other test.
    await page.goto("/admin/branding");
    await page.locator("[data-testid=brand-logo][data-ready=true]").getByRole("button", { name: "Remove" }).click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(page.getByTestId("brand-logo-empty")).toBeVisible();
  }
});
