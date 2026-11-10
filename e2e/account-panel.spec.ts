import { expect, test, type Page } from "./test";

/*
  The phone's account panel (docs/MOBILE.md, "The account panel") against what took the account
  sheet off an iPhone's screen (10 Nov): the sheet was docked to the bottom edge and rose from below
  it, and an iPhone, installed or in Safari, drew it with only its header on the screen and the
  rest, Settings and Sign out among it, below the screen. The panel hangs from the top edge and is as
  tall as its content. These check it on the phone screens members use, with an iPhone's safe areas
  (the status bar or Dynamic Island, the home indicator), on long and short pages scrolled anywhere:
  that it is whole on the screen and every control in it answers a tap where it is drawn; that no
  frame of its motion is off the screen and it comes to rest even if its motion never runs on; that
  it stays inside what is visible when that is less than the page's viewport; and that the page
  behind never moves. Chromium told an iPhone's insets: the layout an iPhone gets, not an iPhone
  (docs/RESPONSIVE.md → Safari and iPhones).
*/

test.beforeEach(async ({ context, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "the phone frame");
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

/** Tells the page an iPhone's safe areas (CSS px): the status bar or Dynamic Island, and the home indicator. */
async function safeAreas(page: Page, top: number, bottom: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top, topMax: top, bottom, bottomMax: bottom, left: 0, leftMax: 0, right: 0, rightMax: 0 } });
  return cdp;
}

/** Opens the account panel from the avatar and waits for it to be at rest (its motion run and dropped). */
async function openPanel(page: Page) {
  await page.getByTestId("account-sheet-button").tap();
  const panel = page.getByTestId("account-sheet");
  await expect(panel).toHaveAttribute("data-entered", "true");
  await expect(async () => expect(await panel.evaluate((d) => d.getAnimations().length)).toBe(0)).toPass();
  return panel;
}

/**
 * Where the open panel is and whether it works where it is: its edges; whether every control (the
 * close button, the tiles, the mode switch, Sign out) is on screen and is what a tap at its middle
 * reaches; where the close button sits beside where the avatar was.
 */
function placement(page: Page) {
  return page.getByTestId("account-sheet").evaluate((d) => {
    const box = d.getBoundingClientRect();
    const controls = [...d.querySelectorAll<HTMLElement>("[data-testid=account-sheet-close], nav a, nav button, [data-testid=mode-switch], [data-testid=sign-out]")];
    const missed = controls
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !(r.top >= 0 && r.bottom <= innerHeight && !!at && (at === el || el.contains(at)));
      })
      .map((el) => el.getAttribute("data-testid") ?? el.textContent?.trim());
    const close = d.querySelector("[data-testid=account-sheet-close]")!.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, controls: controls.length, missed, closeMiddle: { x: close.left + close.width / 2, y: close.top + close.height / 2 }, height: innerHeight, width: innerWidth };
  });
}

// The phones members use, with the safe areas each gives an installed app (Safari's own tabs start
// below the status bar and above its toolbar, so the page there gets none).
const PHONES = [
  { name: "iPhone 15 installed", viewport: { width: 393, height: 852 }, top: 59, bottom: 34 },
  { name: "iPhone 15 in Safari", viewport: { width: 393, height: 659 }, top: 0, bottom: 0 },
  { name: "iPhone 16 Pro Max installed", viewport: { width: 440, height: 956 }, top: 62, bottom: 34 },
  { name: "iPhone 13 mini installed", viewport: { width: 375, height: 812 }, top: 50, bottom: 34 },
  { name: "iPhone SE installed", viewport: { width: 375, height: 667 }, top: 20, bottom: 0 },
  { name: "iPhone SE (1st generation) installed", viewport: { width: 320, height: 568 }, top: 20, bottom: 0 },
  { name: "Pixel 7", viewport: { width: 412, height: 839 }, top: 0, bottom: 0 },
];

for (const phone of PHONES) {
  test(`${phone.name}: the account panel hangs below the status bar, whole on the screen, on every page and wherever it is scrolled, and the page stays put`, async ({ page }) => {
    await page.setViewportSize(phone.viewport);
    await safeAreas(page, phone.top, phone.bottom);
    for (const path of ["/team", "/players", "/resources", "/leaderboards", "/settings"]) {
      await page.goto(path);
      for (const at of [0, 0.5, 1]) {
        const where = `${path}, scrolled ${at * 100}%`;
        await page.evaluate((f) => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), at);
        const scrolled = await page.evaluate(() => scrollY);
        const avatar = (await page.getByTestId("account-sheet-button").boundingBox())!;
        await openPanel(page);
        const p = await placement(page);
        // 0.5rem below the status bar: from the top edge, whatever the page and wherever it is.
        expect(Math.abs(p.top - (phone.top + 8)), where).toBeLessThanOrEqual(1);
        // Ends above the bottom edge, clear of the home indicator, with room to spare.
        expect(p.bottom, where).toBeLessThanOrEqual(p.height - Math.max(8, phone.bottom));
        expect(p.bottom, where).toBeLessThan(p.height * 0.75);
        // Every control on the screen and reached by a tap where it is drawn.
        expect(p.missed, where).toEqual([]);
        expect(p.controls, where).toBeGreaterThanOrEqual(4);
        // The close button takes the avatar's corner, near where the tap was.
        expect(Math.abs(p.closeMiddle.x - (avatar.x + avatar.width / 2)), where).toBeLessThanOrEqual(48);
        expect(p.closeMiddle.y, where).toBeLessThan(phone.top + 100);
        // The page behind never moved, open or closed.
        expect(await page.evaluate(() => scrollY), where).toBe(scrolled);
        await page.getByTestId("account-sheet-close").tap();
        await expect(page.getByTestId("account-sheet")).toHaveCount(0);
        expect(await page.evaluate(() => scrollY), where).toBe(scrolled);
        await expect(page.getByTestId("account-sheet-button")).toBeFocused();
      }
    }
  });
}

test("no frame of the panel's motion is off the screen: it opens from just above where it rests", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await safeAreas(page, 59, 34);
  // As the panel is shown, its opening motion is held and stepped through, on the next frame (long
  // before the motion would be dropped): where is the panel at each point of it?
  await page.addInitScript(() => {
    const show = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      show.call(this);
      requestAnimationFrame(() => {
        const motion = this.getAnimations().find((a) => (a as CSSAnimation).animationName === "panel-in");
        if (!motion) return;
        motion.pause();
        const duration = Number(motion.effect!.getComputedTiming().duration);
        (window as unknown as { __frames: unknown }).__frames = [0, 0.1, 0.25, 0.5, 0.75, 1].map((share) => {
          motion.currentTime = duration * share;
          const r = this.getBoundingClientRect();
          return { share, top: r.top, bottom: r.bottom };
        });
      });
    };
  });
  await page.goto("/resources");
  await page.getByTestId("account-sheet-button").tap();
  await expect(page.getByTestId("account-sheet")).toBeVisible();
  type Frame = { share: number; top: number; bottom: number };
  const frames = (await page.waitForFunction(() => (window as unknown as { __frames?: Frame[] }).__frames).then((h) => h.jsonValue())) as Frame[];
  expect(frames.length, "the panel opens with its own motion (panel-in)").toBe(6);
  // Every frame wholly on the screen, below the status bar and within 0.5rem of where the panel
  // rests. The sheet's first frame was a whole sheet below the bottom edge.
  for (const f of frames) {
    const when = `at ${f.share * 100}% of the motion`;
    expect(f.top, when).toBeGreaterThanOrEqual(59 - 0.5);
    expect(f.bottom, when).toBeLessThanOrEqual(852 - 34);
    expect(Math.abs(f.top - (59 + 8)), when).toBeLessThanOrEqual(8.5);
  }
  // And it still comes to rest.
  await expect(page.getByTestId("account-sheet")).toHaveAttribute("data-entered", "true");
});

test("the panel comes to rest where its styles put it even when its motion never runs on", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await safeAreas(page, 59, 34);
  await page.goto("/resources");
  // Every animation on the page held at its first frame, as a browser that never moved one on would.
  await page.addStyleTag({ content: "*, *::backdrop { animation-play-state: paused !important; }" });
  await page.getByTestId("account-sheet-button").tap();
  const panel = page.getByTestId("account-sheet");
  await expect(panel).toBeVisible();
  expect(await panel.evaluate((d) => d.getAnimations().map((a) => a.playState))).toEqual(["paused"]);
  // The motion is dropped all the same (data-entered), and the panel rests where its styles put it,
  // drawn in full.
  await expect(panel).toHaveAttribute("data-entered", "true", { timeout: 2_000 });
  expect(await panel.evaluate((d) => ({ animations: d.getAnimations().length, opacity: getComputedStyle(d).opacity, transform: getComputedStyle(d).transform }))).toEqual({ animations: 0, opacity: "1", transform: "none" });
  const p = await placement(page);
  expect(Math.abs(p.top - (59 + 8))).toBeLessThanOrEqual(1);
  expect(p.missed).toEqual([]);
});

test("with reduced motion the panel is at rest as soon as it opens", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/team");
  await page.getByTestId("account-sheet-button").tap();
  const panel = page.getByTestId("account-sheet");
  await expect(panel).toHaveAttribute("data-entered", "true", { timeout: 300 });
  expect(await panel.evaluate((d) => ({ animations: d.getAnimations().filter((a) => a.playState === "running").length, transform: getComputedStyle(d).transform }))).toEqual({ animations: 0, transform: "none" });
});

test("the panel stays inside what is visible when that is less than the page's viewport (zoomed in)", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  const cdp = await safeAreas(page, 59, 34);
  await page.goto("/resources");
  await openPanel(page);
  // Zoomed in three times: a third of the page's viewport is visible. The panel's room comes from
  // what is visible (usePanelRoom), not from the viewport, so it ends inside it and its body scrolls.
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 3 });
  const panel = page.getByTestId("account-sheet");
  await expect(async () => {
    const seen = await panel.evaluate((d) => {
      const r = d.getBoundingClientRect();
      const body = d.querySelector<HTMLElement>("[data-sheet-scroll]")!;
      return { top: r.top, bottom: r.bottom, visibleTop: visualViewport!.offsetTop, visibleBottom: visualViewport!.offsetTop + visualViewport!.height, bodyScrolls: body.scrollHeight > body.clientHeight + 1 };
    });
    expect(seen.visibleBottom).toBeLessThan(300);
    expect(seen.top).toBeGreaterThanOrEqual(seen.visibleTop);
    expect(seen.bottom).toBeLessThanOrEqual(seen.visibleBottom);
    expect(seen.bodyScrolls).toBe(true);
  }).toPass();
  // Its header, with the close button, still within what is visible, and the whole panel in reach
  // again once the zoom is undone.
  const closeBox = await panel.getByTestId("account-sheet-close").evaluate((b) => {
    const r = b.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, visibleBottom: visualViewport!.offsetTop + visualViewport!.height };
  });
  expect(closeBox.bottom).toBeLessThanOrEqual(closeBox.visibleBottom);
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await expect(async () => expect((await placement(page)).missed).toEqual([])).toPass();
});

test("the page behind is put back if anything scrolls it while the panel is open", async ({ page }) => {
  // No browser here moves the page as the panel opens; the panel keeps it in place whatever does (a
  // browser revealing the focused close button, a viewport that settles). Scrolled from script here,
  // while the panel is open.
  await page.goto("/players");
  await page.evaluate(() => window.scrollTo(0, 400));
  const scrolled = await page.evaluate(() => scrollY);
  expect(scrolled).toBeGreaterThan(300);
  await openPanel(page);
  for (const to of [0, scrolled - 57, scrolled + 120]) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), to);
    await expect(async () => expect(await page.evaluate(() => scrollY)).toBe(scrolled)).toPass({ timeout: 2_000 });
  }
  // Once the panel has gone, the page scrolls as ever.
  await page.getByTestId("account-sheet-close").tap();
  await expect(page.getByTestId("account-sheet")).toHaveCount(0);
  expect(await page.evaluate(() => scrollY)).toBe(scrolled);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect(async () => expect(await page.evaluate(() => scrollY)).toBe(0)).toPass({ timeout: 2_000 });
});
