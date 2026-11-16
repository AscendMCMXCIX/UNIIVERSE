import { expect, test, type Locator, type Page } from "./test";
import { openFilterBar } from "./filters";
import { openMatchWindow } from "./match-history";
import { untilStill } from "./modal-corner";
import { playerEntry } from "./players";

/*
  Popups over and inside windows. Every window is a modal <dialog> in the browser's top layer
  (DetailModal; the tablet's menu), drawn above the whole page with the rest of the page inert, so
  what must show over a window is drawn inside it (src/components/ui/top-layer.ts):
    - an ⓘ's bubble in a window is drawn inside that window, above it, where its trigger puts it,
      also while the window is moved and scaled (its opening motion); Escape closes the bubble and
      leaves the window open;
    - a toast raised while a window is open is drawn inside it, above it, heard once (one live
      region, its role), and its dismiss button is a 44px target pressed where it is drawn; when the
      window closes the toast comes back in place, not heard again;
    - a window opened by a tap or a click takes the focus itself, without a ring; opened from the
      keyboard its close button has the focus, ringed; the tablet's menu the same, with the page
      behind locked as behind a window;
    - phones: the member and champion pickers in the Filters sheet and the champion window's
      opponent picker open their list in the window's body (no scroller of their own, nothing cut
      off, the page behind unmoved), the opponent search is 16px (iOS zooms into a smaller field),
      and the add-champion list ends above the tab bar, opening above its field near it.
  Each test opens its own page; nothing depends on another test. Demo roster, in-memory only.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const touches = (page: Page) => page.evaluate(() => matchMedia("(pointer: coarse)").matches);

/** A tap on a touch screen, a click with a mouse. */
async function press(page: Page, target: Locator, options: { timeout?: number } = {}) {
  if (await touches(page)) await target.tap(options);
  else await target.click(options);
}

/** A teammate's profile, by the Players directory (the demo's local owner may edit any profile). */
async function teammateProfile(page: Page): Promise<string> {
  await page.goto("/players");
  await playerEntry(page, "Demo Top").click();
  await page.waitForURL(/\/players\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname;
}

/** A picture made in the page (left half red, right half blue), as a PNG file to choose. */
async function picture(page: Page) {
  const data = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 320;
    c.height = 240;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#e02020";
    ctx.fillRect(0, 0, 160, 240);
    ctx.fillStyle = "#2040e0";
    ctx.fillRect(160, 0, 160, 240);
    return c.toDataURL("image/png");
  });
  return { name: "picture.png", mimeType: "image/png", buffer: Buffer.from(data.split(",")[1]!, "base64") };
}
const NOT_A_PICTURE = { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not a picture") };

/**
 * An open bubble and its trigger, measured on screen: which window holds it, whether it is what is
 * drawn at its centre (its pointer-events lifted for the moment), and both boxes.
 */
function bubbleFacts(bubble: Locator, triggerTestId: string) {
  return bubble.evaluate((el, id) => {
    const trigger = document.querySelector(`dialog[open] [data-testid="${id}"]`)!.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    (el as HTMLElement).style.pointerEvents = "auto";
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    (el as HTMLElement).style.pointerEvents = "";
    return {
      window: el.closest("dialog[open]")?.getAttribute("data-testid") ?? null,
      onTop: !!hit && el.contains(hit),
      bubble: { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width },
      trigger: { left: trigger.left, top: trigger.top, bottom: trigger.bottom, width: trigger.width },
      screen: { width: innerWidth, height: innerHeight },
    };
  }, triggerTestId);
}

/** Where placeTip puts a bubble: centred on its trigger (held 8px inside the screen), 6px above it, or below it. */
function placedRight(f: Awaited<ReturnType<typeof bubbleFacts>>): boolean {
  const left = Math.min(Math.max(8, f.trigger.left + f.trigger.width / 2 - f.bubble.width / 2), Math.max(8, f.screen.width - 8 - f.bubble.width));
  const above = Math.abs(f.bubble.bottom - (f.trigger.top - 6)) <= 1 || Math.abs(f.bubble.top - 8) <= 1;
  const below = Math.abs(f.bubble.top - (f.trigger.bottom + 6)) <= 1;
  return Math.abs(f.bubble.left - left) <= 1 && (above || below);
}

test("an ⓘ in a window: its bubble is drawn inside the window, above it, where its trigger puts it, also while the window moves; Escape closes the bubble only", async ({ page }) => {
  const win = await openMatchWindow(page);
  await untilStill(page);
  const tip = win.getByTestId("ranks-info");
  await tip.scrollIntoViewIfNeeded();
  const bubble = page.getByTestId("ranks-info-bubble");
  if (await touches(page)) await tip.tap();
  else await tip.hover();
  await expect(bubble).toBeVisible();
  const facts = await bubbleFacts(bubble, "ranks-info");
  // Inside the window (the top layer), not on the page under it, and what is drawn at its centre.
  expect(facts.window).toBe("match-detail");
  expect(facts.onTop).toBe(true);
  expect(placedRight(facts), JSON.stringify(facts)).toBe(true);
  expect(facts.bubble.left).toBeGreaterThanOrEqual(0);
  expect(facts.bubble.right).toBeLessThanOrEqual(facts.screen.width);
  // While a transform moves and scales the window (as its opening motion does, which makes it the
  // box the bubble is placed in), the bubble still lands where its trigger puts it.
  await win.evaluate((d) => {
    (d as HTMLElement).style.transform = "translate(12px, 24px) scale(0.9)";
    window.dispatchEvent(new Event("resize"));
  });
  await expect.poll(async () => placedRight(await bubbleFacts(bubble, "ranks-info"))).toBe(true);
  await win.evaluate((d) => {
    (d as HTMLElement).style.removeProperty("transform");
    window.dispatchEvent(new Event("resize"));
  });
  await expect.poll(async () => placedRight(await bubbleFacts(bubble, "ranks-info"))).toBe(true);
  // Escape closes the bubble, and only the bubble; a second one closes the window.
  await page.keyboard.press("Escape");
  await expect(bubble).toHaveCount(0);
  await page.waitForTimeout(300);
  await expect(win).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(win).toBeHidden();
});

test("a toast raised while a window is open is drawn in the window, heard once, and its 44px dismiss button answers where it is drawn; closing the window brings it back in place, not heard again", async ({ page }) => {
  await page.goto("/settings");
  const win = page.getByRole("dialog", { name: "Position your picture" });
  const file = await picture(page);
  // A file chosen before the page is interactive is ignored: choose it again until the editor opens.
  await expect(async () => {
    await page.getByTestId("avatar-file").setInputFiles(file);
    await expect(win).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await untilStill(page);
  // A file that is not a picture, chosen while the window is open: an error toast.
  await page.getByTestId("avatar-file").setInputFiles(NOT_A_PICTURE);
  const toast = page.getByTestId("toast").filter({ hasText: "Use a PNG, JPEG or WebP picture." });
  await expect(toast).toBeVisible();
  await expect(toast).toHaveCount(1);
  await expect(toast).toHaveAttribute("role", "alert");
  const drawn = await toast.evaluate((el) => {
    const t = el.getBoundingClientRect();
    const hit = document.elementFromPoint(t.left + 24, t.top + t.height / 2);
    let live = 0;
    for (let e: Element | null = el; e; e = e.parentElement) if (e.hasAttribute("aria-live")) live++;
    return { inWindow: !!el.closest("dialog[open]"), onTop: !!hit && el.contains(hit), live };
  });
  expect(drawn).toEqual({ inWindow: true, onTop: true, live: 1 });
  // The dismiss button: 44px, inside the toast's own box, and what a finger finds at its centre.
  const dismiss = toast.getByRole("button", { name: "Dismiss notification" });
  const b = (await dismiss.boundingBox())!;
  const t = (await toast.boundingBox())!;
  expect(b.width).toBeGreaterThanOrEqual(44);
  expect(b.height).toBeGreaterThanOrEqual(44);
  expect(b.x).toBeGreaterThanOrEqual(t.x - 0.5);
  expect(b.y).toBeGreaterThanOrEqual(t.y - 0.5);
  expect(b.x + b.width).toBeLessThanOrEqual(t.x + t.width + 0.5);
  expect(b.y + b.height).toBeLessThanOrEqual(t.y + t.height + 0.5);
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("button")?.getAttribute("aria-label") ?? null, { x: b.x + b.width / 2, y: b.y + b.height / 2 })).toBe("Dismiss notification");
  await press(page, dismiss);
  await expect(toast).toHaveCount(0);
  await expect(win).toBeVisible();
  // Another, then the window closes: the toast is back on the page, once, without its live role
  // (it was heard in the window).
  await page.getByTestId("avatar-file").setInputFiles(NOT_A_PICTURE);
  await expect(toast).toBeVisible();
  await expect(toast).toHaveAttribute("role", "alert");
  await press(page, win.getByTestId("avatar-cancel"));
  await expect(win).toBeHidden();
  await expect(toast).toHaveCount(1);
  await expect(toast).toBeVisible();
  expect(await toast.evaluate((el) => el.closest("dialog") === null)).toBe(true);
  await expect(toast).not.toHaveAttribute("role");
});

test("a window opened by a tap or a click takes the focus itself, without a ring; opened from the keyboard, its close button has the focus, ringed", async ({ page }) => {
  await page.goto("/team");
  const open = page.getByTestId("lineup-row-TOP").getByTestId("open-player-detail");
  const win = page.getByTestId("player-detail");
  // The opener works once the page is interactive.
  await expect(async () => {
    if (!(await win.isVisible())) await press(page, open, { timeout: 2_000 });
    await expect(win).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(win).toBeFocused();
  expect(await win.evaluate((d) => getComputedStyle(d).outlineStyle)).toBe("none");
  await page.keyboard.press("Escape");
  await expect(win).toBeHidden();
  // From the keyboard: Enter on the opener.
  await open.focus();
  await page.keyboard.press("Enter");
  await expect(win).toBeVisible();
  const close = win.getByRole("button", { name: "Close" });
  await expect(close).toBeFocused();
  expect(await close.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(win).toBeHidden();
  await expect(open).toBeFocused();
});

test("the tablet's menu takes the focus itself when tapped open, gives it to its close button from the keyboard, and locks the page behind as a window does", async ({ page }, info) => {
  test.skip(info.project.name !== "tablet", "the drawer is the tablet's menu");
  await page.goto("/players");
  const menu = page.getByTestId("menu-button");
  const drawer = page.getByTestId("mobile-drawer");
  await expect(async () => {
    if (!(await drawer.isVisible())) await menu.tap({ timeout: 2_000 });
    await expect(drawer).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(drawer).toBeFocused();
  expect(await drawer.evaluate((d) => getComputedStyle(d).outlineStyle)).toBe("none");
  expect(await page.evaluate(() => ({ overflow: document.documentElement.style.overflow, overscroll: document.documentElement.style.overscrollBehavior }))).toEqual({ overflow: "hidden", overscroll: "none" });
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(menu).toBeFocused();
  expect(await page.evaluate(() => ({ overflow: document.documentElement.style.overflow, overscroll: document.documentElement.style.overscrollBehavior }))).toEqual({ overflow: "", overscroll: "" });
  // From the keyboard: the focused menu button, Enter.
  await page.keyboard.press("Enter");
  await expect(drawer).toBeVisible();
  await expect(page.getByRole("button", { name: "Close menu" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(menu).toBeFocused();
});

/**
 * An open picker's list is part of the window's body: nothing in it scrolls, the body (or the
 * window, where it scrolls as one) is the one scroller, the list was brought into view in it as it
 * opened, and its first and last options are each drawn where a finger finds them once scrolled to.
 */
async function expectInWindowBody(page: Page, panel: Locator) {
  const facts = await panel.evaluate((el) => {
    const scrolls = (e: Element) => /(auto|scroll)/.test(getComputedStyle(e).overflowY);
    const dialog = el.closest("dialog")!;
    let scroller: Element | null = null;
    for (let e: Element | null = el.parentElement; e && !scroller; e = e === dialog ? null : e.parentElement) if (scrolls(e)) scroller = e;
    const p = el.getBoundingClientRect();
    const s = (scroller ?? dialog).getBoundingClientRect();
    return {
      position: getComputedStyle(el).position,
      ownScrollers: [el, ...el.querySelectorAll("*")].filter(scrolls).length,
      listMaxHeight: getComputedStyle(el.querySelector("[role=listbox]")!).maxHeight,
      scroller: scroller === null ? "none" : scroller === dialog ? "window" : scroller.parentElement === dialog ? "body" : `other: ${scroller.className}`,
      inView: p.top >= s.top - 1 && p.top < s.bottom && (p.bottom <= s.bottom + 1 || p.height > s.height),
    };
  });
  expect(facts.position).toBe("static");
  expect(facts.ownScrollers).toBe(0);
  expect(facts.listMaxHeight).toBe("none");
  expect(["body", "window", "none"]).toContain(facts.scroller);
  expect(facts.inView, "brought into view as it opened").toBe(true);
  const options = panel.getByRole("option");
  for (const option of [options.first(), options.last()]) {
    await option.evaluate((e) => e.scrollIntoView({ block: "nearest" }));
    const b = (await option.boundingBox())!;
    const id = await option.getAttribute("id");
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("[role=option]")?.id ?? null, { x: b.x + b.width / 2, y: b.y + b.height / 2 })).toBe(id);
  }
}

const pageScroll = (page: Page) => page.evaluate(() => window.scrollY);

test.describe("phones", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "phone", "phones (below sm)"));

  test("the Filters sheet's member picker opens its list in the sheet's body: no scroller of its own, nothing cut off", async ({ page }) => {
    await page.goto("/matches");
    await openFilterBar(page.getByTestId("together-filters"), "together-filters-toggle");
    const sheet = page.getByTestId("together-filters-sheet");
    await expect(sheet).toBeVisible();
    await untilStill(page);
    const before = await pageScroll(page);
    await sheet.getByTestId("together-with-button").tap();
    const panel = sheet.getByTestId("together-with-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-flow", "true");
    await expectInWindowBody(page, panel);
    expect(await pageScroll(page)).toBe(before);
  });

  test("the Filters sheet's champion picker opens its list in the sheet's body: no scroller of its own, nothing cut off", async ({ page }) => {
    await teammateProfile(page);
    await openFilterBar(page.getByTestId("overview-filters"));
    const sheet = page.getByTestId("filter-sheet");
    await expect(sheet).toBeVisible();
    await untilStill(page);
    const before = await pageScroll(page);
    await sheet.getByTestId("overview-champion-button").tap();
    const panel = sheet.getByTestId("overview-champion-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-flow", "true");
    await expectInWindowBody(page, panel);
    expect(await pageScroll(page)).toBe(before);
  });

  test("the champion window's opponent picker opens its list in the window's body, and its search is 16px", async ({ page }) => {
    const profile = await teammateProfile(page);
    await page.goto(`${profile}/champions`);
    const open = page.getByTestId("top-champion").first().getByTestId("open-champion");
    const win = page.getByTestId("champion-detail");
    await expect(async () => {
      if (!(await win.isVisible())) await open.tap({ timeout: 2_000 });
      await expect(win).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await page.getByTestId("champion-tab-matchups").tap();
    const button = win.getByTestId("opponent-picker-button");
    await expect(button).toBeVisible();
    await untilStill(page);
    const before = await pageScroll(page);
    await button.tap();
    const popover = win.getByTestId("opponent-picker-popover");
    await expect(popover).toBeVisible();
    await expect(popover).toHaveAttribute("data-flow", "true");
    // iOS zooms the page into a field under 16px as it is focused.
    expect(await win.getByTestId("opponent-picker-search").evaluate((el) => getComputedStyle(el).fontSize)).toBe("16px");
    await expectInWindowBody(page, popover);
    expect(await pageScroll(page)).toBe(before);
    // Escape closes the list, never the window.
    await win.getByTestId("opponent-picker-search").press("Escape");
    await expect(popover).toHaveCount(0);
    await expect(win).toBeVisible();
  });

  test("the add-champion list ends above the tab bar: near it, the list opens above its field", async ({ page }) => {
    await teammateProfile(page);
    await page.getByTestId("pools-edit").click();
    const toggle = page.getByTestId("primary-pool-toggle");
    await expect(toggle).toBeVisible();
    // The field just above the tab bar, where a list opened below it would run under the bar.
    await toggle.evaluate((el) => {
      const bar = document.querySelector("[data-testid=phone-tabbar]")!.getBoundingClientRect();
      window.scrollBy({ top: el.getBoundingClientRect().bottom - (bar.top - 24), behavior: "instant" });
    });
    await toggle.tap();
    const results = page.getByTestId("primary-pool-results");
    await expect(results).toBeVisible();
    const room = await results.evaluate((el) => ({
      list: el.getBoundingClientRect().toJSON() as DOMRect,
      field: el.parentElement!.getBoundingClientRect().toJSON() as DOMRect,
      tabBar: document.querySelector("[data-testid=phone-tabbar]")!.getBoundingClientRect().top,
      topBar: document.querySelector("[data-testid=mobile-topbar]")!.getBoundingClientRect().bottom,
    }));
    expect(room.list.bottom, "above the tab bar").toBeLessThanOrEqual(room.tabBar + 0.5);
    expect(room.list.top, "below the top bar").toBeGreaterThanOrEqual(room.topBar - 0.5);
    // With the field this low, the list opened above it.
    if (room.field.bottom > room.tabBar - 120) {
      await expect(results).toHaveAttribute("data-side", "above");
      expect(room.list.bottom).toBeLessThanOrEqual(room.field.top + 0.5);
    }
    // An option is pressed where it is drawn.
    const option = results.getByRole("option").first();
    const b = (await option.boundingBox())!;
    expect(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest("[role=option]"), { x: b.x + b.width / 2, y: b.y + b.height / 2 })).toBe(true);
    await page.keyboard.press("Escape");
    await expect(results).toHaveCount(0);
  });
});
