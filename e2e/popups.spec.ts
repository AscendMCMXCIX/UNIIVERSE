import { expect, test, type Locator, type Page } from "./test";
import { openFilterBar } from "./filters";
import { openMatchWindow } from "./match-history";
import { untilStill } from "./modal-corner";
import { playerEntry } from "./players";
import { bubbleFacts, NOT_A_PICTURE, NOT_A_PICTURE_ERROR, openPictureEditor, picture, placedRight, press, toastFacts, touches, untilAtRest } from "./popups";

/*
  Popups over and inside windows. Every window is a modal <dialog> in the browser's top layer
  (DetailModal; the tablet's menu), drawn above the whole page with the rest of the page inert, so
  what must show over a window is drawn inside it (src/components/ui/top-layer.ts):
    - an ⓘ's bubble in a window is drawn inside that window, above it, where its trigger puts it,
      also while the window is moved and scaled (its opening motion); Escape closes the bubble and
      leaves the window open;
    - a toast raised while a window is open is drawn inside it, above it, heard once (one live
      region, its role), and its dismiss button is a 44px target pressed where it is drawn; a
      window moving (opening, closing) never carries a toast with it: the toast goes into it once
      it is at rest and leaves it as its closing motion starts, back in place, not heard again; a
      toast raised as its window closes is heard on the page instead of lost with the window;
    - a window opened by a tap or a click takes the focus itself, without a ring, until it is
      pressed (the keys then scroll its body); opened from the keyboard its close button has the
      focus, ringed; the tablet's menu the same, with the page behind locked as behind a window;
    - phones: the member and champion pickers in the Filters sheet and the champion window's
      opponent picker open their list in the window's body (no scroller of their own, nothing cut
      off, the page behind unmoved), a tap below an open list reaches what was tapped, the opponent
      search is 16px (iOS zooms into a smaller field), and the add-champion list ends above the tab
      bar, opening above its field near it.
  Each test opens its own page; nothing depends on another test. Demo roster, in-memory only. Some
  of this runs in Safari's engine too (e2e/webkit.spec.ts).
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

/** A teammate's profile, by the Players directory (the demo's local owner may edit any profile). */
async function teammateProfile(page: Page): Promise<string> {
  await page.goto("/players");
  await playerEntry(page, "Demo Top").click();
  await page.waitForURL(/\/players\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname;
}

test("an ⓘ in a window: its bubble is drawn inside the window, above it, where its trigger puts it, also while the window moves; Escape closes the bubble only", async ({ page }) => {
  const win = await openMatchWindow(page);
  await untilStill(page);
  // The notes under the scoreboard settle first (a rank check or the possible groups arriving
  // redraws the lines above the ⓘ, which would move it under an open bubble).
  await expect(win.getByTestId("ranks-note")).not.toHaveAttribute("data-state", "checking", { timeout: 15_000 });
  await expect(win.getByTestId("possible-groups-note")).not.toHaveAttribute("data-state", "loading", { timeout: 15_000 });
  const tip = win.getByTestId("ranks-info");
  await tip.scrollIntoViewIfNeeded();
  const bubble = page.getByTestId("ranks-info-bubble");
  // A tap; with a mouse, the keyboard's focus (a hovered bubble closes as the pointer leaves its ⓘ,
  // and the window is moved under the pointer below).
  if (await touches(page)) await tip.tap();
  else {
    await page.mouse.move(0, 0);
    await tip.focus();
  }
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
  // A motion of the window's own (an animation, as its opening motion is), with the bubble placed
  // again in the middle of it (a resize, as a scroll would): once the motion is over, with no event
  // to say so, the bubble is still where its trigger puts it (it follows the window at every frame,
  // and once more as it stops; placed once against the moving window, it was left off its ⓘ).
  await win.evaluate(async (d) => {
    const style = document.createElement("style");
    style.textContent = "@keyframes popups-move { from { transform: translate(40px, 30px) scale(0.95); } to { transform: none; } }";
    document.head.append(style);
    const ended = new Promise((r) => d.addEventListener("animationend", (e) => (e as AnimationEvent).animationName === "popups-move" && r(null)));
    (d as HTMLElement).style.animation = "popups-move 600ms linear";
    await new Promise((r) => setTimeout(r, 250));
    window.dispatchEvent(new Event("resize"));
    await ended;
    (d as HTMLElement).style.removeProperty("animation");
    style.remove();
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

test("a toast raised while a window is open is drawn in the window, heard once, and its 44px dismiss button answers where it is drawn; the window closing with its motion sends it back in place at once, not heard again", async ({ page }) => {
  const win = await openPictureEditor(page);
  // A file that is not a picture, chosen while the window is open: an error toast.
  await page.getByTestId("avatar-file").setInputFiles(NOT_A_PICTURE);
  const toast = page.getByTestId("toast").filter({ hasText: NOT_A_PICTURE_ERROR });
  await expect(toast).toBeVisible();
  await expect(toast).toHaveCount(1);
  await expect(toast).toHaveAttribute("role", "alert");
  // Measured once its entrance motion (a slight scale) has run.
  const f = await toastFacts(toast);
  expect({ inWindow: f.inWindow, live: f.live, onTop: f.onTop }).toEqual({ inWindow: true, live: 1, onTop: true });
  // The dismiss button: 44px, inside the toast's own box, and what a finger finds at its centre.
  expect(f.dismiss.width).toBeGreaterThanOrEqual(44);
  expect(f.dismiss.height).toBeGreaterThanOrEqual(44);
  expect(f.dismiss.box.right - f.dismiss.box.left).toBeGreaterThanOrEqual(44 - 0.5);
  expect(f.dismiss.box.bottom - f.dismiss.box.top).toBeGreaterThanOrEqual(44 - 0.5);
  expect(f.dismiss.box.left).toBeGreaterThanOrEqual(f.toast.left - 0.5);
  expect(f.dismiss.box.top).toBeGreaterThanOrEqual(f.toast.top - 0.5);
  expect(f.dismiss.box.right).toBeLessThanOrEqual(f.toast.right + 0.5);
  expect(f.dismiss.box.bottom).toBeLessThanOrEqual(f.toast.bottom + 0.5);
  expect(f.dismiss.reached).toBe(true);
  await press(page, toast.getByRole("button", { name: "Dismiss notification" }));
  await expect(toast).toHaveCount(0);
  await expect(win).toBeVisible();
  // Another, heard in the window (live there for a moment). Then the window closes with its motion
  // (its close button): the toast leaves it as the motion starts, so it never rides the window off
  // the screen, and is back on the page, once, without its live role.
  await page.getByTestId("avatar-file").setInputFiles(NOT_A_PICTURE);
  await expect(toast).toHaveAttribute("role", "alert");
  await page.waitForTimeout(500);
  const closing = await win.evaluate(async (d) => {
    d.querySelector<HTMLElement>("[data-testid=dialog-close]")!.click();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const t = document.querySelector("[data-testid=toast]");
    return { closing: (d as HTMLDialogElement).open && d.getAttribute("data-closing") === "true", toastInWindow: !!t && d.contains(t) };
  });
  expect(closing).toEqual({ closing: true, toastInWindow: false });
  await expect(win).toBeHidden();
  await expect(toast).toHaveCount(1);
  await expect(toast).toBeVisible();
  expect(await toast.evaluate((el) => el.closest("dialog") === null)).toBe(true);
  await expect(toast).not.toHaveAttribute("role");
});

test("a toast raised in the moment its window closes (a save: the toast, then close) is heard once, on the page, not lost with the window", async ({ page }) => {
  const win = await openPictureEditor(page);
  const heard = await win.evaluate(async (d) => {
    // Every toast added with its live role is a toast a screen reader speaks: where it was added.
    const added: string[] = [];
    const watch = new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes) {
          if (!(n instanceof Element)) continue;
          for (const t of [n, ...n.querySelectorAll("[data-testid=toast]")]) if (t.matches("[data-testid=toast][role]")) added.push(t.closest("dialog") ? "window" : "page");
        }
    });
    watch.observe(document.body, { childList: true, subtree: true });
    // In one moment: a file that is not a picture (an error toast), then the window's close button.
    const input = document.querySelector<HTMLInputElement>("[data-testid=avatar-file]")!;
    const files = new DataTransfer();
    files.items.add(new File(["not a picture"], "notes.txt", { type: "text/plain" }));
    input.files = files.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    d.querySelector<HTMLElement>("[data-testid=dialog-close]")!.click();
    // Until the window has gone and the toast has been added where it settles, and a moment more.
    for (let i = 0; i < 150 && ((d as HTMLDialogElement).open || added.length === 0); i++) await new Promise((r) => setTimeout(r, 20));
    await new Promise((r) => setTimeout(r, 400));
    watch.disconnect();
    return added;
  });
  expect(heard).toEqual(["page"]);
  const toast = page.getByTestId("toast").filter({ hasText: NOT_A_PICTURE_ERROR });
  await expect(toast).toHaveCount(1);
  await expect(toast).toHaveAttribute("role", "alert");
  const f = await toastFacts(toast);
  expect({ inWindow: f.inWindow, live: f.live, onTop: f.onTop }).toEqual({ inWindow: false, live: 1, onTop: true });
});

test("a toast showing as a window opens stays where it is while the window moves in, then is drawn in the window at rest, in the same place", async ({ page }) => {
  await page.goto("/settings");
  const file = await picture(page);
  const toast = page.getByTestId("toast").filter({ hasText: NOT_A_PICTURE_ERROR });
  // A toast on the page (an error stays 8 seconds): a file that is not a picture, no window open.
  // A file chosen before the page is interactive is ignored: chosen again until the toast shows.
  await expect(async () => {
    await page.getByTestId("avatar-file").setInputFiles(NOT_A_PICTURE);
    await expect(toast).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  const before = await toastFacts(toast);
  expect(before.inWindow).toBe(false);
  // Heard on the page (live there for a moment): it then stays drawn while a window moves in over it.
  await page.waitForTimeout(400);
  // From now, at every frame: whether the window is moving, and whether the toast is drawn in it.
  await page.evaluate(() => {
    const samples: Array<{ moving: boolean; inWindow: boolean }> = [];
    (window as unknown as { __toastSamples: typeof samples }).__toastSamples = samples;
    const sample = () => {
      const d = document.querySelector("dialog[open]");
      const t = document.querySelector("[data-testid=toast]");
      if (d && t) samples.push({ moving: d.getAnimations().some((a) => a.playState === "running"), inWindow: d.contains(t) });
      if (samples.length < 2000) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.getByTestId("avatar-file").setInputFiles(file);
  const win = page.getByRole("dialog", { name: "Position your picture" });
  await expect(win).toBeVisible();
  await untilAtRest(win);
  await expect.poll(() => toast.evaluate((el) => !!el.closest("dialog[open]"))).toBe(true);
  const samples = await page.evaluate(() => (window as unknown as { __toastSamples: Array<{ moving: boolean; inWindow: boolean }> }).__toastSamples);
  expect(samples.some((s) => s.moving), "frames of the window's opening motion were sampled").toBe(true);
  expect(samples.filter((s) => s.moving && s.inWindow), "never drawn in the window while it moves").toEqual([]);
  // In the window, where it was on the page, and pressed there.
  const after = await toastFacts(toast);
  expect(after.inWindow).toBe(true);
  for (const side of ["left", "top", "right", "bottom"] as const) expect(Math.abs(after.toast[side] - before.toast[side]), side).toBeLessThanOrEqual(1);
  expect(after.dismiss.reached).toBe(true);
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

test("a window that took the focus as it opened lets it go when pressed inside: the keys then scroll its body", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "a desktop keyboard's Page Down");
  // A window shorter than its content (above 480px tall, where a window scrolls as one).
  await page.setViewportSize({ width: 1440, height: 540 });
  const profile = await teammateProfile(page);
  await page.goto(`${profile}/champions`);
  const open = page.getByTestId("top-champion").first().getByTestId("open-champion");
  const win = page.getByTestId("champion-detail");
  await expect(async () => {
    if (!(await win.isVisible())) await open.click({ timeout: 2_000 });
    await expect(win).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await untilStill(page);
  // Opened by a click: the window holds the focus itself.
  await expect(win).toBeFocused();
  const body = win.getByTestId("champion-detail-body");
  await expect(body).toHaveCSS("opacity", "1", { timeout: 15_000 });
  expect(await body.evaluate((el) => el.scrollHeight - el.clientHeight), "the window's body scrolls").toBeGreaterThan(40);
  expect(await body.evaluate((el) => el.scrollTop)).toBe(0);
  // A click on the body's own padding, on nothing focusable: the window lets the focus go, as a
  // page does (focusable for good, it kept it, and the keys then scrolled nothing).
  const b = (await body.boundingBox())!;
  await page.mouse.click(b.x + 4, b.y + b.height / 2);
  await expect(win).not.toBeFocused();
  expect(await win.evaluate((d) => d.hasAttribute("tabindex"))).toBe(false);
  await page.keyboard.press("PageDown");
  await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(win).toBeVisible();
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
 * Measured once the list's entrance (a fade) has run.
 */
async function expectInWindowBody(page: Page, panel: Locator) {
  await untilAtRest(panel);
  const facts = await panel.evaluate((el) => {
    const scrolls = (e: Element) => /(auto|scroll)/.test(getComputedStyle(e).overflowY);
    const dialog = el.closest("dialog")!;
    let scroller: Element | null = null;
    for (let e: Element | null = el.parentElement; e && !scroller; e = e === dialog ? null : e.parentElement) if (scrolls(e)) scroller = e;
    const p = el.getBoundingClientRect();
    const s = (scroller ?? dialog).getBoundingClientRect();
    return {
      position: getComputedStyle(el).position,
      transform: getComputedStyle(el).transform,
      ownScrollers: [el, ...el.querySelectorAll("*")].filter(scrolls).length,
      listMaxHeight: getComputedStyle(el.querySelector("[role=listbox]")!).maxHeight,
      scroller: scroller === null ? "none" : scroller === dialog ? "window" : scroller.parentElement === dialog ? "body" : `other: ${scroller.className}`,
      inView: p.top >= s.top - 1 && p.top < s.bottom && (p.bottom <= s.bottom + 1 || p.height > s.height),
    };
  });
  expect(facts.position).toBe("static");
  expect(facts.transform, "no rise moves it after it was brought into view").toBe("none");
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

  test("a tap below an open list in the sheet reaches what was tapped: the list closes on the tap's click, so nothing moves under the finger before it", async ({ page }) => {
    await page.goto("/matches");
    await openFilterBar(page.getByTestId("together-filters"), "together-filters-toggle");
    const sheet = page.getByTestId("together-filters-sheet");
    await expect(sheet).toBeVisible();
    await untilStill(page);
    await sheet.getByTestId("together-with-button").tap();
    const panel = sheet.getByTestId("together-with-panel");
    await expect(panel).toHaveAttribute("data-flow", "true");
    await untilAtRest(panel);
    // The field under the list ("Team members in the game"), pushed down by it.
    const below = sheet.locator("#together-min");
    expect(await below.evaluate((el, p) => el.getBoundingClientRect().top >= p!.getBoundingClientRect().bottom - 1, await panel.elementHandle())).toBe(true);
    await below.tap();
    await expect(panel).toHaveCount(0);
    await expect(below).toBeFocused();
    await expect(sheet).toBeVisible();
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
    await untilAtRest(results);
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
