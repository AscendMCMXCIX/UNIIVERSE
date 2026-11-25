import { expect, test, type Locator, type Page, type Route } from "./test";
import { openFilterBar } from "./filters";
import { openMatchWindow, showGamePage } from "./match-history";
import { untilStill } from "./modal-corner";
import { playerEntry } from "./players";
import { bubbleFacts, NOT_A_PICTURE, NOT_A_PICTURE_ERROR, openPictureEditor, picture, placedRight, press, toastFacts, touches, untilAtRest } from "./popups";

/*
  Popups over and inside windows. Every window is a modal <dialog> in the browser's top layer
  (DetailModal), drawn above the whole page with the rest of the page inert, so
  what must show over a window is drawn inside it (src/components/ui/top-layer.ts):
    - an ⓘ's bubble in a window is drawn inside that window, above it, where its trigger puts it,
      also while the window is moved and scaled (its opening motion); Escape closes the bubble and
      leaves the window open;
    - an ⓘ arriving under a pointer at rest as its window opens (a click leaves the pointer on
      whatever of the window arrives under it) stays closed until the pointer moves onto it, so
      Escape closes the window, whatever has its focus: the window itself, its close button, or
      nothing after a press inside; a mouse that moved onto an ⓘ while the page hydrated, and rests
      on it, opens its bubble as the ⓘ hydrates (a move then reaches nothing else), and the coming
      in React replays once the ⓘ has hydrated is the same visit, so Escape keeps it closed; on the
      page too, a bubble lands 6px from its ⓘ whatever its height;
    - a toast raised while a window is open is drawn inside it, above it, heard once (one live
      region, its role), and its dismiss button is a 44px target pressed where it is drawn; a
      window moving (opening, closing) never carries a toast with it: the toast goes into it once
      it is at rest and leaves it as its closing motion starts, back in place, not heard again; a
      toast raised as its window closes is heard on the page instead of lost with the window;
    - a window opened by a tap or a click takes the focus itself, without a ring, until it is
      pressed (the keys then scroll its body); opened from the keyboard its close button has the
      focus, ringed (the tablet's menu drawer did the same until its destinations moved into the
      top bar: e2e/navigation-reach.spec.ts has the avatar menu that holds its account items);
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
  // On a phone the notes are on the window's Scoreboard page.
  await showGamePage(win.getByTestId("match-breakdown"), "board");
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

test("an ⓘ arriving under a pointer at rest as its window opens stays closed until the pointer moves onto it: Escape closes the window, whatever has its focus", async ({ page, isMobile }, info) => {
  test.skip(info.project.name !== "phone", "the Team player is a window on phones; from 640px it is a docked Peek, not a window");
  await page.goto("/team");
  const open = page.getByTestId("lineup-row-MID").getByTestId("open-player-detail");
  const win = page.getByTestId("player-detail");
  // The ⓘ of the season's figures, its bubble, and any bubble at all (a pool row's tier label is one).
  const tip = win.getByTestId("info-tip");
  const bubble = page.getByTestId("info-tip-bubble");
  const bubbles = page.locator("[role=tooltip]");
  // Where the ⓘ comes to rest: the window opened once from the keyboard, the pointer out of its way.
  await page.mouse.move(0, 0);
  await expect(async () => {
    if (!(await win.isVisible())) {
      await open.focus();
      await page.keyboard.press("Enter");
    }
    await expect(win).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await untilStill(page);
  const b = (await tip.boundingBox())!;
  const spot = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  await page.keyboard.press("Escape");
  await expect(win).toBeHidden();
  /** The window at rest, the ⓘ under the resting pointer, and no bubble open: none was pointed at. */
  const restsUnopened = async () => {
    await expect(win).toBeVisible();
    await untilStill(page);
    expect(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest("[data-testid=info-tip]"), spot), "the ⓘ is under the pointer").toBe(true);
    // The browser tells what arrives under a pointer at rest so (pointerover, pointerenter, no move)
    // a frame or more after the window shows.
    await page.waitForTimeout(400);
    await expect(bubbles).toHaveCount(0);
  };
  // The pointer at rest where the ⓘ arrives, and the window opened by a press that leaves it there,
  // as a click leaves the pointer on whatever of the window then arrives under it (at the tablet's
  // size, a pool row's tier label under the MID card's opener). The window takes the focus itself.
  await page.mouse.move(spot.x, spot.y);
  await open.dispatchEvent("pointerdown");
  await open.dispatchEvent("click");
  await restsUnopened();
  await expect(win).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(win).toBeHidden();
  // From the keyboard, the pointer still at rest there: the close button has the focus.
  await open.focus();
  await page.keyboard.press("Enter");
  await restsUnopened();
  await expect(win.getByRole("button", { name: "Close" })).toBeFocused();
  if (!isMobile) {
    // A pointer moving onto the ⓘ opens its bubble, and then the first Escape is the bubble's alone;
    // closed so, it stays closed while the pointer moves on over its ⓘ.
    await page.mouse.move(spot.x + 1, spot.y + 1);
    await expect(bubble).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(bubble).toHaveCount(0);
    await page.mouse.move(spot.x - 1, spot.y);
    await page.waitForTimeout(300);
    await expect(bubble).toHaveCount(0);
    await expect(win).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(win).toBeHidden();
  // Pressed inside on nothing focusable (the season's padding), the window leaves nothing focused,
  // as a page does (letGoWhenPressed): Escape still closes it.
  await open.dispatchEvent("pointerdown");
  await open.dispatchEvent("click");
  await expect(win).toBeVisible();
  await untilStill(page);
  const season = (await win.getByTestId("detail-season").boundingBox())!;
  if (await touches(page)) await page.touchscreen.tap(season.x + 4, season.y + season.height / 2);
  else await page.mouse.click(season.x + 4, season.y + season.height / 2);
  await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true);
  await expect(bubbles).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(win).toBeHidden();
});

test("a mouse that moved onto an ⓘ while the page hydrated, and rests on it, opens its bubble as the ⓘ hydrates, that ⓘ's alone; the visit goes on as any other", async ({ page, isMobile }) => {
  test.skip(!!isMobile, "a mouse's hover");
  const profile = await teammateProfile(page);
  // The page drawn (its styles load) with its code held back, so nothing on it listens yet but the
  // head's script. A move then was lost: React replays a pointer's coming in once the ⓘ has
  // hydrated, never its moves, and the bubble stayed shut until the pointer moved again (the
  // status ⓘ hovered as soon as a profile had loaded).
  const held: Route[] = [];
  let release = false;
  await page.route(/\/_next\/static\/chunks\/.+\.js(\?|$)/, async (route) => {
    if (release) await route.continue();
    else held.push(route);
  });
  await page.goto(profile, { waitUntil: "commit" });
  const tip = page.getByTestId("data-refresh-info");
  await expect(tip).toBeVisible();
  const box = (await tip.boundingBox())!;
  const spot = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(spot.x, spot.y);
  await page.waitForTimeout(300);
  expect(held.length, "the page's code is held back").toBeGreaterThan(0);
  const bubble = page.getByTestId("data-refresh-info-bubble");
  const bubbles = page.locator("[role=tooltip]");
  await expect(bubbles).toHaveCount(0);
  // The code runs; the pointer stays where it is.
  release = true;
  for (const route of held.splice(0)) await route.continue();
  await expect(bubble).toBeVisible();
  await expect(bubbles).toHaveCount(1);
  // The same visit as any: Escape closes the bubble, and it stays closed while the pointer moves on
  // over its ⓘ; leaving and coming back opens it again.
  await page.keyboard.press("Escape");
  await expect(bubble).toHaveCount(0);
  await page.mouse.move(spot.x + 1, spot.y);
  await page.waitForTimeout(300);
  await expect(bubble).toHaveCount(0);
  await page.mouse.move(0, 0);
  await page.mouse.move(spot.x, spot.y);
  await expect(bubble).toBeVisible();
});

test("a mouse that moved onto an ⓘ while React listened and the ⓘ had yet to hydrate: the coming in React replays once it has hydrated is the same visit, so after Escape a move keeps its bubble closed", async ({ page, isMobile }) => {
  test.skip(!!isMobile, "a mouse's hover");
  const profile = await teammateProfile(page);
  // Unlike the test above, React already listens as the mouse moves: every chunk runs but those with
  // InfoTip's code (found by its bubble's test id, "-bubble"; on a profile that is one page chunk,
  // which also carries much of the page's own code), so the page, the ⓘ in it, has yet to hydrate.
  // React then queues the mouse's coming in onto the ⓘ, and replays it once the ⓘ has hydrated,
  // after the ⓘ has opened its bubble for the resting mouse.
  // That replayed coming in must start no new visit, else the move after Escape opens the bubble
  // again. This is the state in which multikills.spec.ts lost its hover of the status ⓘ on a tablet.
  // With all of the page's code held (the test above), nothing listens as the mouse moves and
  // nothing is replayed, so that test passes whether a replayed coming in starts a new visit or not.
  await page.addInitScript(() => {
    // React's replay is dispatched by the page itself, not by the browser: an untrusted pointerover.
    const w = window as Window & { __tipReplays?: number };
    w.__tipReplays = 0;
    const onOver = (e: PointerEvent) => {
      if (!e.isTrusted && (e.target as Element | null)?.closest?.("[data-testid=data-refresh-info]")) w.__tipReplays = (w.__tipReplays ?? 0) + 1;
    };
    w.addEventListener("pointerover", onOver, true);
  });
  const held: (() => Promise<void>)[] = [];
  let release = false;
  await page.route(/\/_next\/static\/chunks\/.+\.js(\?|$)/, async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (!release && body.includes("-bubble")) held.push(() => route.fulfill({ response, body }));
    else await route.fulfill({ response, body });
  });
  await page.goto(profile, { waitUntil: "commit" });
  const tip = page.getByTestId("data-refresh-info");
  await expect(tip).toBeVisible();
  // React keeps a node's props on it once it has hydrated it.
  const hydrated = () => tip.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps$")));
  // React marks the document it hydrates as it starts listening to it.
  await expect.poll(() => page.evaluate(() => Object.keys(document).some((k) => k.startsWith("_reactListening"))), { message: "React listens" }).toBe(true);
  await expect.poll(() => held.length, { message: "the chunks with InfoTip's code are held back" }).toBeGreaterThan(0);
  const box = (await tip.boundingBox())!;
  const spot = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(spot.x, spot.y);
  await page.waitForTimeout(300);
  const bubble = page.getByTestId("data-refresh-info-bubble");
  const bubbles = page.locator("[role=tooltip]");
  await expect(bubbles).toHaveCount(0);
  expect(await hydrated(), "the ⓘ has yet to hydrate").toBe(false);
  // The ⓘ's code arrives; the pointer stays where it is. The bubble opens as the ⓘ hydrates, that
  // ⓘ's alone, and React replays the mouse's coming in.
  release = true;
  for (const fulfil of held.splice(0)) await fulfil();
  await expect(bubble).toBeVisible();
  await expect(bubbles).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => (window as Window & { __tipReplays?: number }).__tipReplays), { message: "React replayed the mouse's coming in" }).toBeGreaterThan(0);
  // The same visit: Escape closes the bubble, and it stays closed while the pointer moves on over
  // its ⓘ; leaving and coming back opens it again.
  await page.keyboard.press("Escape");
  await expect(bubble).toHaveCount(0);
  await page.mouse.move(spot.x + 1, spot.y);
  await page.waitForTimeout(300);
  await expect(bubble).toHaveCount(0);
  await page.mouse.move(0, 0);
  await page.mouse.move(spot.x, spot.y);
  await expect(bubble).toBeVisible();
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("an ⓘ's bubble on the page lands where its ⓘ puts it, 6px from it, whatever its height", async ({ page }) => {
  // A bubble's size is read unrounded: read whole (offsetHeight), a bubble 63.5px tall was taken for
  // one scaled by 0.992 and landed up to 3.5px nearer its ⓘ, the lower the further off, and on the page
  // nothing placed it again (the first of a teammate's ⓘs at 1440 × 900 are 63.5px tall).
  await teammateProfile(page);
  await page.waitForLoadState("networkidle");
  const tips = page.locator("main [data-testid=info-tip]:visible");
  const bubble = page.getByTestId("info-tip-bubble");
  const touch = await touches(page);
  const count = Math.min(await tips.count(), 3);
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const tip = tips.nth(i);
    await tip.scrollIntoViewIfNeeded();
    if (touch) await tip.tap();
    else {
      await page.mouse.move(0, 0);
      await tip.hover();
    }
    await expect(bubble).toBeVisible();
    await untilAtRest(bubble);
    const facts = await tip.evaluate((t) => {
      const b = document.querySelector("[data-testid=info-tip-bubble]")!.getBoundingClientRect();
      const r = t.getBoundingClientRect();
      return { bubble: { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }, trigger: { left: r.left, top: r.top, bottom: r.bottom, width: r.width }, screen: { width: innerWidth, height: innerHeight } };
    });
    expect(placedRight({ window: null, onTop: true, ...facts }), `ⓘ ${i + 1}: ${JSON.stringify(facts)}`).toBe(true);
    await page.keyboard.press("Escape");
    await expect(bubble).toHaveCount(0);
  }
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
  // The toasts' region is in the window, and has been for a moment: a toast raised now is drawn in
  // the window with its live role (toast.tsx, SETTLE_MS), then the window closes at once.
  await expect.poll(() => win.evaluate((d) => !!d.querySelector("[data-testid=toaster]"))).toBe(true);
  await page.waitForTimeout(400);
  const heard = await win.evaluate(async (d) => {
    // A screen reader hears what the browser draws: a toast each time it is drawn with its live role
    // (where it is then), sampled at every frame. A toast added and taken away again before the next
    // frame (here, in the window's region, which leaves with the window in the same moment) is never
    // drawn, and never reaches a screen reader. (Counted as it was added, it was taken for a second
    // toast on the page: the region had left the window by the time its addition was read.)
    const heard: string[] = [];
    const live = new WeakMap<Element, boolean>();
    let sampling = true;
    const sample = () => {
      for (const t of document.querySelectorAll("[data-testid=toast]")) {
        const now = t.hasAttribute("role");
        if (now && !live.get(t)) heard.push(t.closest("dialog") ? "window" : "page");
        live.set(t, now);
      }
      if (sampling) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    // In one moment: a file that is not a picture (an error toast), then the window's close button.
    const input = document.querySelector<HTMLInputElement>("[data-testid=avatar-file]")!;
    const files = new DataTransfer();
    files.items.add(new File(["not a picture"], "notes.txt", { type: "text/plain" }));
    input.files = files.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    d.querySelector<HTMLElement>("[data-testid=dialog-close]")!.click();
    // Until the window has gone and the toast has been drawn where it settles, and a moment more.
    for (let i = 0; i < 150 && ((d as HTMLDialogElement).open || heard.length === 0); i++) await new Promise((r) => setTimeout(r, 20));
    await new Promise((r) => setTimeout(r, 400));
    sampling = false;
    return heard;
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

test("a window opened by a tap or a click takes the focus itself, without a ring; opened from the keyboard, its close button has the focus, ringed", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the Team player is a window on phones; from 640px it is a docked Peek, not a window");
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
  test.skip(info.project.name === "phone", "a keyboard's Page Down: a desktop's after a click, a tablet's after a tap");
  // A window shorter than its content (above 480px tall, where a window scrolls as one).
  await page.setViewportSize({ width: 1440, height: 540 });
  const profile = await teammateProfile(page);
  await page.goto(`${profile}/champions`);
  // A game's window, opened from All Champions' preview (an opponent's games).
  const open = page.getByTestId("top-champion").first().getByTestId("open-champion");
  const opponent = page.getByTestId("champion-preview-opponent").first();
  await expect(async () => {
    if (!(await page.getByTestId("champion-preview-content").count())) await press(page, open, { timeout: 2_000 });
    await expect(opponent).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await press(page, opponent.getByRole("button").first());
  const game = page.getByTestId("champion-preview-game").first();
  await expect(game).toBeVisible();
  await press(page, game);
  const win = page.locator("dialog[open]").filter({ has: page.getByTestId("match-detail-body") });
  await expect(win).toBeVisible();
  await untilStill(page);
  // Opened by a tap or a click: the window holds the focus itself.
  await expect(win).toBeFocused();
  const body = win.getByTestId("match-detail-body");
  await expect(body).toHaveCSS("opacity", "1", { timeout: 15_000 });
  expect(await body.evaluate((el) => el.scrollHeight - el.clientHeight), "the window's body scrolls").toBeGreaterThan(40);
  expect(await body.evaluate((el) => el.scrollTop)).toBe(0);
  // A tap or a click on the body's own padding, on nothing focusable: the window lets the focus go,
  // as a page does. The browser focuses a dialog itself at such a press, with or without a
  // tabindex; held there, the keys scrolled nothing. And so at every press, not only the first.
  const tap = await touches(page);
  const pressBody = async () => {
    const b = (await body.boundingBox())!;
    if (tap) await page.touchscreen.tap(b.x + 4, b.y + b.height / 2);
    else await page.mouse.click(b.x + 4, b.y + b.height / 2);
  };
  await pressBody();
  await expect(win).not.toBeFocused();
  expect(await win.evaluate((d) => d.hasAttribute("tabindex"))).toBe(false);
  await page.keyboard.press("PageDown");
  await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await body.evaluate((el) => el.scrollTo({ top: 0, behavior: "instant" }));
  await pressBody();
  await expect(win).not.toBeFocused();
  await page.keyboard.press("PageDown");
  await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(win).toBeVisible();
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
