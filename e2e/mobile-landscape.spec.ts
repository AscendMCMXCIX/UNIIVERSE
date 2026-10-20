import { devices, expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";

/*
  PHONES HELD EITHER WAY (in-memory demo; Chromium emulating each device, not the devices
  themselves). A phone held sideways is a short window (under 480px tall): the tab bar is hidden,
  the top bar slides away while reading and comes back on any scroll up, detail windows take the
  whole screen and scroll as one with their controls in reach, and dialogs keep their title and
  actions on screen. Turning the phone keeps what was open and chosen.
*/

const SE_LANDSCAPE = devices["iPhone SE landscape"];
const IPHONE_LANDSCAPE = devices["iPhone 15 landscape"];
const IPHONE = devices["iPhone 15"];

async function phone(browser: Browser, baseURL: string, device: BrowserContextOptions & { defaultBrowserType?: string }, view: "player" | "admin" = "player"): Promise<Page> {
  const { defaultBrowserType: _, ...options } = device;
  const context = await browser.newContext(options);
  await context.addCookies([{ name: "uniiverse_view", value: view, url: baseURL }]);
  return context.newPage();
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

test("held sideways: no tab bar, and the top bar gets out of the way while reading", async ({ browser, baseURL }) => {
  const page = await phone(browser, baseURL!, SE_LANDSCAPE);
  await page.goto("/players");
  await expect(page.locator("main a[data-testid='player-card']").first()).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeHidden();
  // No room is kept for a tab bar that is not there.
  expect(await page.locator("main").evaluate((m) => parseFloat(getComputedStyle(m).paddingBottom))).toBeLessThan(32);

  const bar = page.getByTestId("mobile-topbar");
  await expect(bar).toHaveAttribute("data-hidden", "false");
  await page.mouse.wheel(0, 700);
  await expect(bar).toHaveAttribute("data-hidden", "true");
  await expect.poll(async () => (await rect(page, "[data-testid=mobile-topbar]")).bottom).toBeLessThanOrEqual(1);
  // A slow drag up (two pixels a frame) brings it back...
  await page.evaluate(async () => {
    for (let i = 0; i < 8; i++) {
      window.scrollBy(0, -2);
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    }
  });
  await expect(bar).toHaveAttribute("data-hidden", "false");
  // ...and so does any quicker scroll up, after it has gone again.
  await page.mouse.wheel(0, 300);
  await expect(bar).toHaveAttribute("data-hidden", "true");
  await page.mouse.wheel(0, -120);
  await expect(bar).toHaveAttribute("data-hidden", "false");
  await expect.poll(async () => (await rect(page, "[data-testid=mobile-topbar]")).top).toBeGreaterThanOrEqual(0);
  await page.context().close();
});

test("held upright: the tab bar stays and the top bar stays put", async ({ browser, baseURL }) => {
  const page = await phone(browser, baseURL!, IPHONE);
  await page.goto("/players");
  await expect(page.locator("main a[data-testid='player-card']").first()).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(300);
  await expect(page.getByTestId("mobile-topbar")).toHaveAttribute("data-hidden", "false");
  await page.context().close();
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
  await page.context().close();
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
  await page.context().close();
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
  await page.context().close();
});

test("tab rows too wide for the screen fade only where more is hidden, and keep the current tab in view", async ({ browser, baseURL }) => {
  const page = await phone(browser, baseURL!, devices["iPhone SE"]);
  await page.goto("/team");
  const list = page.getByTestId("team-tabs").locator("ul");
  await expect(list).toHaveAttribute("data-fade-start", "false");
  await expect(list).toHaveAttribute("data-fade-end", "true");
  await page.goto("/matches");
  await expect(list).toHaveAttribute("data-fade-start", "true");
  const current = await page.getByTestId("team-tabs").locator("[aria-current=page]").boundingBox();
  const row = await list.boundingBox();
  expect(current!.x).toBeGreaterThanOrEqual(row!.x);
  expect(current!.x + current!.width).toBeLessThanOrEqual(row!.x + row!.width + 1);
  await page.context().close();
});

test("a wider phone fits all four Team tabs without scrolling", async ({ browser, baseURL }) => {
  const page = await phone(browser, baseURL!, IPHONE);
  await page.goto("/team");
  const list = page.getByTestId("team-tabs").locator("ul");
  await expect(list).toHaveAttribute("data-fade-end", "false");
  expect(await list.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  await page.context().close();
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
  await page.context().close();
});

test("Branding's save bar is pinned only while there is something to save, and never floats mid-screen when held sideways", async ({ browser, baseURL }) => {
  const page = await phone(browser, baseURL!, SE_LANDSCAPE, "admin");
  await page.goto("/admin/branding");
  const bar = page.getByTestId("branding-actions");
  await expect(bar).toBeVisible();
  expect(await bar.evaluate((el) => getComputedStyle(el).position)).not.toBe("sticky");
  await page.getByLabel("App name").fill("Team Hub Landscape");
  await expect.poll(() => bar.evaluate((el) => getComputedStyle(el).position)).toBe("sticky");
  const box = await rect(page, "[data-testid=branding-actions]");
  // Near the bottom edge (no tab bar to clear), not 72px above it.
  expect(box.vh - box.bottom).toBeLessThan(40);
  await page.getByTestId("branding-cancel").click();
  await page.context().close();
});
