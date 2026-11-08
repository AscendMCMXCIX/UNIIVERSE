import { devices, expect, test, type Browser, type BrowserContextOptions, type Page } from "./test";
import { openMatchWindow } from "./match-history";
import { playerEntry } from "./players";

/*
  PHONES HELD EITHER WAY (in-memory demo; Chromium emulating each device, not the devices
  themselves). A phone held sideways is a short window (under 480px tall): the tab bar is a compact
  row, and both bars slide away while reading and come back on any scroll up, detail windows take the
  whole screen and scroll as one with their controls in reach, and dialogs keep their title and
  actions on screen. Turning the phone keeps what was open and chosen.
*/

const SE_LANDSCAPE = devices["iPhone SE landscape"];
const IPHONE_LANDSCAPE = devices["iPhone 15 landscape"];
const IPHONE = devices["iPhone 15"];
const SE = devices["iPhone SE"];

async function phone(browser: Browser, baseURL: string, device: BrowserContextOptions & { defaultBrowserType?: string }, view: "player" | "admin" = "player"): Promise<Page> {
  const { defaultBrowserType: _, ...options } = device;
  const context = await browser.newContext(options);
  await context.addCookies([{ name: "uniiverse_view", value: view, url: baseURL }]);
  return context.newPage();
}

/**
 * Closes a test's own context once the page is quiet. Closing while a request is still streaming
 * (Next prefetches the links on screen) can catch the trace mid-write: Playwright then fails the
 * close with "file data stream has unexpected number of bytes".
 */
async function done(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.context().close();
}

/** Where an element sits on screen, once its opening motion (if any) is over. */
const rect = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((a) => a.finished));
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height, vw: window.innerWidth, vh: window.innerHeight };
  });

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "phone", "the device matrix runs once, with its own devices");
});

test("held sideways: a compact tab bar, and both bars get out of the way while reading", async ({ browser, baseURL }) => {
  const page = await phone(browser, baseURL!, SE_LANDSCAPE);
  await page.goto("/players");
  await expect(playerEntry(page).first()).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Primary" });
  // The places to go stay one tap away sideways too (there is no menu drawer on a phone).
  await expect(tabs).toBeVisible();
  const tabBox = await rect(page, "[data-testid=phone-tabbar]");
  expect(tabBox.height).toBeLessThanOrEqual(56);
  // Room is kept under the page for the compact bar, so nothing sits under it.
  expect(await page.locator("main").evaluate((m) => parseFloat(getComputedStyle(m).paddingBottom))).toBeGreaterThanOrEqual(tabBox.height - 1);

  const bar = page.getByTestId("mobile-topbar");
  await expect(bar).toHaveAttribute("data-hidden", "false");
  await page.mouse.wheel(0, 700);
  await expect(bar).toHaveAttribute("data-hidden", "true");
  await expect(tabs).toHaveAttribute("data-hidden", "true");
  await expect.poll(async () => (await rect(page, "[data-testid=mobile-topbar]")).bottom).toBeLessThanOrEqual(1);
  await expect.poll(async () => (await rect(page, "[data-testid=phone-tabbar]")).top).toBeGreaterThanOrEqual(tabBox.vh - 1);
  // A slow drag up (two pixels a frame) brings them back...
  await page.evaluate(async () => {
    for (let i = 0; i < 8; i++) {
      window.scrollBy(0, -2);
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    }
  });
  await expect(bar).toHaveAttribute("data-hidden", "false");
  await expect(tabs).toHaveAttribute("data-hidden", "false");
  // ...and so does any quicker scroll up, after they have gone again.
  await page.mouse.wheel(0, 300);
  await expect(bar).toHaveAttribute("data-hidden", "true");
  await page.mouse.wheel(0, -120);
  await expect(bar).toHaveAttribute("data-hidden", "false");
  await expect.poll(async () => (await rect(page, "[data-testid=mobile-topbar]")).top).toBeGreaterThanOrEqual(0);
  await done(page);
});

test("held upright: the tab bar stays and the top bar stays put", async ({ browser, baseURL }) => {
  const page = await phone(browser, baseURL!, IPHONE);
  await page.goto("/players");
  await expect(page.locator("main [data-testid='player-row']").first()).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(300);
  await expect(page.getByTestId("mobile-topbar")).toHaveAttribute("data-hidden", "false");
  await done(page);
});

test("held sideways, Team Overview's lineup is one sideways track: the cards side by side at one height, about two screens of page, never wider than the window", async ({ browser, baseURL }) => {
  for (const device of [IPHONE_LANDSCAPE, SE_LANDSCAPE]) {
    const page = await phone(browser, baseURL!, device);
    await page.goto("/team");
    const track = page.getByTestId("lineup-overview");
    await expect(track).toHaveAttribute("data-ready", "true");
    const cells = await page.getByTestId("lineup-cell").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ top: Math.round(r.top), left: r.left, right: r.right })));
    expect(cells).toHaveLength(5);
    // One row (it was three rows of cards taller than the window), the first card at the page's
    // gutter under the header's start, the next one beside it in view.
    expect(new Set(cells.map((c) => c.top)).size, "one row").toBe(1);
    const header = (await page.getByTestId("team-header").boundingBox())!;
    expect(Math.abs(cells[0]!.left - header.x)).toBeLessThanOrEqual(1);
    const vw = page.viewportSize()!.width;
    expect(cells[1]!.left).toBeLessThan(vw - 100);
    // The track scrolls sideways on its own; the page never does.
    expect(await track.evaluate((el) => el.scrollWidth > el.clientWidth + 100)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    // About two screens of page for the whole lineup and its substitutes (four before).
    expect(await page.evaluate(() => document.documentElement.scrollHeight / window.innerHeight)).toBeLessThanOrEqual(2);
    // No role bar: the cards side by side are the way through; the substitutes follow the track.
    await expect(page.getByTestId("lineup-pager")).toBeHidden();
    await expect(page.getByTestId("lineup-bench")).toBeVisible();
    await done(page);
  }
});

test("held sideways: a detail window takes the whole screen, scrolls as one, and its controls stay in reach", async ({ browser, baseURL }) => {
  const page = await phone(browser, baseURL!, IPHONE_LANDSCAPE);
  await page.goto("/team");
  const open = page.getByTestId("open-player-detail").first();
  const win = page.locator("dialog[open]");
  await expect(async () => {
    if (!(await win.isVisible())) await open.click({ timeout: 2_000 });
    await expect(win).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  const box = await rect(page, "dialog[open]");
  expect(box.top).toBeLessThanOrEqual(1);
  expect(box.left).toBeLessThanOrEqual(1);
  expect(box.bottom).toBeGreaterThanOrEqual(box.vh - 1);
  expect(box.right).toBeGreaterThanOrEqual(box.vw - 1);

  // The whole window scrolls (its header is taller than the screen allows to keep pinned)...
  const scrolled = await win.evaluate((d) => {
    d.scrollTop = d.scrollHeight;
    return d.scrollTop;
  });
  expect(scrolled).toBeGreaterThan(0);
  // ...and the close button is still on screen, finger-sized, and closes it.
  const close = win.getByRole("button", { name: "Close" });
  const c = (await close.boundingBox())!;
  expect(c.y).toBeGreaterThanOrEqual(0);
  expect(c.y + c.height).toBeLessThanOrEqual(box.vh);
  expect(Math.min(c.width, c.height)).toBeGreaterThanOrEqual(44);
  await close.click();
  await expect(win).toBeHidden();
  await done(page);
});

test("held sideways: a dialog keeps its title and actions on screen and scrolls only its body", async ({ browser, baseURL }) => {
  const page = await phone(browser, baseURL!, SE_LANDSCAPE, "admin");
  await page.goto("/admin/people");
  const open = page.locator("[data-testid=open-access]:not([disabled])").first();
  const dialog = page.locator("dialog[open]");
  await expect(async () => {
    if (!(await dialog.isVisible())) await open.click({ timeout: 2_000 });
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  const box = await rect(page, "dialog[open]");
  expect(box.top).toBeGreaterThanOrEqual(0);
  expect(box.bottom).toBeLessThanOrEqual(box.vh + 0.5);
  for (const target of [dialog.locator("#dialog-title"), dialog.getByTestId("save-access"), dialog.getByTestId("dialog-close")]) {
    const b = (await target.boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(box.top - 1);
    expect(b.y + b.height).toBeLessThanOrEqual(box.bottom + 1);
  }
  const close = (await dialog.getByTestId("dialog-close").boundingBox())!;
  expect(Math.min(close.width, close.height)).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await done(page);
});

test("turning the phone keeps the open window, the chosen filters and the place in the tabs", async ({ browser, baseURL }) => {
  const page = await phone(browser, baseURL!, IPHONE);
  await page.goto("/players");
  const profile = new URL((await page.locator("main a[data-testid='player-card'][data-player-name='Demo Mid']").getAttribute("href"))!, "http://x").pathname;
  await page.goto(`${profile}/champions?mode=solo`);
  const win = page.getByTestId("champion-detail");
  const open = page.getByTestId("top-champion").first().getByTestId("open-champion");
  await expect(async () => {
    if (!(await win.isVisible())) await open.click({ timeout: 2_000 });
    await expect(win).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(page).toHaveURL(/champion=/);
  const url = page.url();

  for (const size of [{ width: 852, height: 393 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(size);
    await expect(win).toBeVisible();
    expect(page.url()).toBe(url);
    const box = await rect(page, "[data-testid=champion-detail]");
    // Whole screen both ways round on a phone.
    expect(box.width).toBeGreaterThanOrEqual(size.width - 1);
    expect(box.height).toBeGreaterThanOrEqual(size.height - 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  }
  await page.getByTestId("champion-detail-close").click();
  await expect(win).toBeHidden();
  await expect(page).toHaveURL(/mode=solo/);
  await done(page);
});

test("tab rows too wide for the screen fade only where more is hidden, and keep the current tab in view", async ({ browser, baseURL }) => {
  // Audit Logs' six categories do not fit a small phone: the row scrolls on its own.
  const page = await phone(browser, baseURL!, devices["iPhone SE"], "admin");
  await page.goto("/admin/audit");
  const list = page.getByTestId("audit-categories");
  await expect(list).toHaveAttribute("data-fade-start", "false");
  await expect(list).toHaveAttribute("data-fade-end", "true");
  await page.goto("/admin/audit?category=privacy");
  await expect(list).toHaveAttribute("data-fade-start", "true");
  const current = await list.locator("[aria-current=page]").boundingBox();
  const row = await list.boundingBox();
  expect(current!.x).toBeGreaterThanOrEqual(row!.x);
  expect(current!.x + current!.width).toBeLessThanOrEqual(row!.x + row!.width + 1);
  await done(page);
});

test("the tab bar's five destinations fit side by side on the narrowest phones, each label whole", async ({ browser, baseURL }) => {
  for (const device of [devices["iPhone SE"], IPHONE]) {
    const page = await phone(browser, baseURL!, device);
    await page.setViewportSize({ width: device === IPHONE ? device.viewport.width : 320, height: device.viewport.height });
    await page.goto("/matches");
    const bar = page.getByTestId("phone-tabbar");
    await expect(bar.getByRole("link")).toHaveText(["Team", "Players", "Leaderboards", "Matches", "Profile"]);
    const width = page.viewportSize()!.width;
    for (const tab of await bar.getByRole("link").all()) {
      const box = (await tab.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(-0.5);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
      expect(box.height).toBeGreaterThanOrEqual(44);
      // The label is never cut.
      expect(await tab.locator("span").last().evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    }
    await done(page);
  }
});

test("the (i) marks are 24px targets, 40px to a finger, without changing the line they sit in", async ({ browser, baseURL }) => {
  const page = await phone(browser, baseURL!, IPHONE);
  await page.goto("/players");
  const profile = new URL((await page.locator("main a[data-testid='player-card'][data-player-name='Demo Mid']").getAttribute("href"))!, "http://x").pathname;
  await page.goto(profile);
  const tip = page.getByTestId("info-tip").first();
  await expect(tip).toBeVisible();
  const b = (await tip.boundingBox())!;
  expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(24);
  // The mark itself is still 16px.
  expect(await tip.locator("span").evaluate((s) => s.getBoundingClientRect().width)).toBe(16);
  // A tap 18px from its centre still lands on it.
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("[data-testid=info-tip]") !== null, { x: b.x + b.width / 2 + 18, y: b.y + b.height / 2 });
  expect(hit).toBe(true);
  await done(page);
});

test("Branding's save bar is pinned only while there is something to save, and never floats mid-screen when held sideways", async ({ browser, baseURL }) => {
  const page = await phone(browser, baseURL!, SE_LANDSCAPE, "admin");
  await page.goto("/admin/branding");
  const bar = page.getByTestId("branding-actions");
  await expect(bar).toBeVisible();
  expect(await bar.evaluate((el) => getComputedStyle(el).position)).not.toBe("sticky");
  await page.getByLabel("App name").fill("Team Hub Landscape");
  await expect.poll(() => bar.evaluate((el) => getComputedStyle(el).position)).toBe("sticky");
  // Just above the compact tab bar while it shows, never 72px up as over the upright bar...
  const box = await rect(page, "[data-testid=branding-actions]");
  const tabs = await rect(page, "[data-testid=phone-tabbar]");
  expect(box.bottom).toBeLessThanOrEqual(tabs.top + 1);
  expect(box.vh - box.bottom).toBeLessThan(tabs.height + 20);
  // ...and down to the bottom edge once the bars have slid away while reading.
  await page.mouse.wheel(0, 400);
  await expect(page.getByTestId("phone-tabbar")).toHaveAttribute("data-hidden", "true");
  await expect.poll(async () => (await rect(page, "[data-testid=branding-actions]")).vh - (await rect(page, "[data-testid=branding-actions]")).bottom).toBeLessThan(40);
  await page.getByTestId("branding-cancel").click();
  await done(page);
});

test("upright on a small phone, the player window scrolls as one, so its list is not a strip under the header", async ({ browser, baseURL }) => {
  const page = await phone(browser, baseURL!, SE);
  await page.goto("/team");
  const open = page.getByTestId("open-player-detail").first();
  const win = page.locator("dialog[open]");
  await expect(async () => {
    if (!(await win.isVisible())) await open.click({ timeout: 2_000 });
    await expect(win).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  // Its header would fill most of the screen, so the whole window scrolls instead of the list alone.
  await expect(win).toHaveAttribute("data-flow", "true");
  const box = await rect(page, "dialog[open]");
  expect(box.height).toBeGreaterThanOrEqual(box.vh - 1);
  const scrolled = await win.evaluate((d) => {
    d.scrollTop = d.scrollHeight;
    return d.scrollTop;
  });
  expect(scrolled).toBeGreaterThan(0);
  // Scrolled down, the header has made way for the list, and the controls are still in reach.
  const hero = (await win.getByTestId("player-detail-hero").boundingBox())!;
  expect(hero.y + hero.height).toBeLessThan(box.vh * 0.25);
  const close = win.getByRole("button", { name: "Close" });
  const c = (await close.boundingBox())!;
  expect(c.y).toBeGreaterThanOrEqual(0);
  expect(Math.min(c.width, c.height)).toBeGreaterThanOrEqual(44);
  await close.click();
  await expect(win).toBeHidden();
  await done(page);
});

test("turning a small phone with the player window open keeps it open and whole-screen, scrolling as one both ways", async ({ browser, baseURL }) => {
  const page = await phone(browser, baseURL!, SE);
  await page.goto("/team");
  const open = page.getByTestId("open-player-detail").first();
  const win = page.locator("dialog[open]");
  await expect(async () => {
    if (!(await win.isVisible())) await open.click({ timeout: 2_000 });
    await expect(win).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  const url = page.url();
  for (const size of [{ width: 568, height: 320 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(size);
    await expect(win).toBeVisible();
    expect(page.url()).toBe(url);
    const box = await rect(page, "dialog[open]");
    expect(box.width).toBeGreaterThanOrEqual(size.width - 1);
    expect(box.height).toBeGreaterThanOrEqual(size.height - 1);
    // Upright it flows by measurement, sideways as every short window does: either way the whole
    // window scrolls and the close button stays on screen.
    expect(await win.evaluate((d) => getComputedStyle(d).overflowY)).toBe("auto");
    const c = (await win.getByRole("button", { name: "Close" }).boundingBox())!;
    expect(c.y).toBeGreaterThanOrEqual(0);
    expect(c.y + c.height).toBeLessThanOrEqual(size.height);
  }
  await expect(win).toHaveAttribute("data-flow", "true");
  await page.keyboard.press("Escape");
  await expect(win).toBeHidden();
  await done(page);
});

test("a window whose header leaves room keeps its own scrolling body on a phone held upright", async ({ browser, baseURL }) => {
  const page = await phone(browser, baseURL!, IPHONE);
  // A link to a game that is not on the page shown opens it in the match window (lists open their
  // games under their cards).
  const win = await openMatchWindow(page);
  await expect(page.getByTestId("match-detail-figures")).toBeVisible();
  await expect(win).not.toHaveAttribute("data-flow", /.*/);
  // The header stays; the body below it scrolls.
  expect(await page.getByTestId("match-detail-body").evaluate((b) => b.scrollHeight > b.clientHeight && getComputedStyle(b).overflowY === "auto")).toBe(true);
  await page.keyboard.press("Escape");
  await expect(win).toBeHidden();
  await done(page);
});

test("on the preview pages the badge never covers the team name, either way round", async ({ browser, baseURL }) => {
  for (const device of [SE, SE_LANDSCAPE]) {
    const page = await phone(browser, baseURL!, device, "admin");
    for (const path of ["/preview/login", "/preview/setup"]) {
      await page.goto(path);
      const block = page.getByTestId("brand-frame-block");
      await expect(block).toBeVisible();
      const badge = (await page.getByTestId("preview-badge").boundingBox())!;
      const top = (await block.boundingBox())!;
      expect(badge.y + badge.height, path).toBeLessThanOrEqual(top.y);
    }
    await done(page);
  }
});
