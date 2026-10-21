import { devices, expect, test, type Page } from "./test";

/*
  SAFARI'S ENGINE. Runs only in the opt-in "webkit" project (E2E_WEBKIT=1 locally, or the WebKit
  workflow on GitHub, started by hand): the priority pages in WebKit as Playwright builds it, on an
  iPhone-sized touch screen. That is Safari's engine on Linux, not Safari on an iPhone: the Home
  Screen app, the iOS keyboard and real touch scrolling still need a device (docs/RESPONSIVE.md →
  Safari and iPhones). Every other test runs in Chromium on the phone, tablet and desktop projects.
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
  for (const route of ["/team", "/players", "/clash", "/leaderboards", "/matches", "/resources", "/settings", "/admin", "/admin/people", "/admin/system"]) {
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
  // A tap before the page is interactive does nothing: tap until the track has moved.
  await expect(async () => {
    await pager.getByRole("tab", { name: /^Mid/ }).tap();
    await expect(page.getByTestId("lineup-row-MID")).toBeInViewport({ ratio: 0.9, timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(pager.getByRole("tab", { name: /^Mid/ })).toHaveAttribute("aria-selected", "true");
  const name = page.getByTestId("lineup-row-MID").getByTestId("card-name");
  await expect(name).toBeVisible();
  expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1)).toBe(true);
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
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("champion-detail")).toBeHidden();
  await tabs.getByRole("link", { name: "Match History" }).tap();
  await expect(page).toHaveURL(new RegExp(`${href}/matches$`));
  await expect(tabs.getByRole("link", { name: "Match History" })).toHaveAttribute("aria-current", "page");
});

test("Clash Scout: both screenshots fill five cards, and the draft is discarded", async ({ page }) => {
  // A 1×1 PNG; the stand-in reader (UNIIVERSE_FAKE_SCOUT_OCR) reads files named ranked… and mastery….
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  const shot = (name: string) => ({ name, mimeType: "image/png", buffer: Buffer.concat([png, Buffer.from(`${name}:webkit`)]) });
  await page.goto("/clash", { waitUntil: "load" });
  // A screenshot chosen before the workspace is interactive is never seen: it says when it is.
  await expect(page.getByTestId("clash-workspace")).toHaveAttribute("data-ready", "true");
  const discard = page.getByTestId("clash-discard");
  if (await discard.count()) {
    page.once("dialog", (d) => void d.accept());
    await discard.click();
  }
  await expect(page.getByTestId("clash-dropzone")).toBeVisible();
  await page.getByTestId("clash-file-input").setInputFiles([shot("ranked.png"), shot("mastery.png")]);
  await expect(page.locator('[data-testid="clash-shot"][data-status="done"]')).toHaveCount(2);
  await expect(page.getByTestId("scout-card")).toHaveCount(5);
  await fitsWidth(page, "/clash");
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("clash-discard").click();
  await expect(page.getByTestId("clash-shot")).toHaveCount(0);
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
  await expect(tabs).toHaveText(["Profile", "Team", "Matches", "Clash"]);
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

test("held sideways: the pages fit and the phone tab bar steps aside", async ({ browser }) => {
  const { defaultBrowserType: _, ...landscape } = devices["iPhone 15 landscape"];
  const context = await browser.newContext(landscape);
  const page = await context.newPage();
  for (const route of ["/team", "/players", "/clash"]) {
    await page.goto(route);
    await expect(page.locator("main"), route).toBeVisible();
    await fitsWidth(page, `${route}, sideways`);
    await expect(page.getByRole("navigation", { name: "Primary" }), route).toBeHidden();
  }
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
