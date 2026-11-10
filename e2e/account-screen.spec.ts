import { expect, test, type Page } from "./test";

/*
  The phone's account screen (docs/MOBILE.md, "The account screen"): a screen of its own, fixed to
  the screen's four edges. The menus before it were windows as tall as their content, which Safari
  26 collapsed to their header (a 95pt strip on the owner's iPhone, 10 Nov; DetailModal's
  BODY_SCROLLS); that collapse only shows in WebKit 26 itself, so scripts/webkit26-check.mjs checks
  every window there.

  These check the account screen on the phones members use, with an iPhone's safe areas (the status
  bar or Dynamic Island, the home indicator), on long and short pages scrolled anywhere: it fills the
  screen, every control in it is a full-width target that answers a tap where it is drawn, nothing
  scrolls on a normal phone, the page behind never moves; its motion never strands it; one scroll
  region where it must scroll. Chromium told an iPhone's insets: the layout an iPhone gets, not an
  iPhone (docs/RESPONSIVE.md → Safari and iPhones).
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

/** Opens the account screen from the avatar and waits for it to be at rest (its motion run and dropped). */
async function openScreen(page: Page) {
  await page.getByTestId("account-sheet-button").tap();
  const screen = page.getByTestId("account-sheet");
  await expect(screen).toHaveAttribute("data-entered", "true");
  await expect(async () => expect(await screen.evaluate((d) => d.getAnimations().length)).toBe(0)).toPass();
  return screen;
}

/**
 * Where the open screen is and whether it works where it is: its box; its body's scrolling; every
 * control (the close button, the rows, the mode switch, Sign out): on screen, what a tap at its middle
 * reaches, its height and width; the close button's box; what has the focus.
 */
function layout(page: Page) {
  return page.getByTestId("account-sheet").evaluate((d) => {
    const box = d.getBoundingClientRect();
    const body = d.querySelector<HTMLElement>("[data-sheet-scroll]")!;
    const column = d.querySelector("nav")!.getBoundingClientRect();
    const controls = [...d.querySelectorAll<HTMLElement>("[data-testid=account-sheet-close], nav a, nav button, [data-testid=mode-switch], [data-testid=sign-out]")];
    const rows = controls.slice(1).map((el) => {
      const r = el.getBoundingClientRect();
      return { name: el.textContent!.trim(), height: r.height, width: r.width };
    });
    const missed = controls
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !(r.top >= 0 && r.bottom <= box.bottom && !!at && (at === el || el.contains(at)));
      })
      .map((el) => el.getAttribute("data-testid") ?? el.textContent?.trim());
    const close = d.querySelector("[data-testid=account-sheet-close]")!.getBoundingClientRect();
    return {
      box: { top: box.top, left: box.left, width: box.width, height: box.height },
      bodyScrolls: body.scrollHeight > body.clientHeight + 1,
      column: column.width,
      rows,
      missed,
      close: { top: close.top, width: close.width, height: close.height, middleX: close.left + close.width / 2, middleY: close.top + close.height / 2 },
      focus: document.activeElement === d ? "screen" : (document.activeElement?.getAttribute("data-testid") ?? document.activeElement?.tagName ?? null),
    };
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
  test(`${phone.name}: the account screen fills the screen, everything in it a full-width target in view without scrolling, on every page and wherever it is scrolled, and the page stays put`, async ({ page }) => {
    await page.setViewportSize(phone.viewport);
    await safeAreas(page, phone.top, phone.bottom);
    for (const path of ["/team", "/players", "/resources", "/leaderboards", "/settings"]) {
      await page.goto(path);
      for (const at of [0, 0.5, 1]) {
        const where = `${path}, scrolled ${at * 100}%`;
        await page.evaluate((f) => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), at);
        const scrolled = await page.evaluate(() => scrollY);
        await openScreen(page);
        const l = await layout(page);
        // The whole screen, exactly: fixed to its four edges.
        expect(l.box, where).toEqual({ top: 0, left: 0, width: phone.viewport.width, height: phone.viewport.height });
        // Everything at once on a normal phone: nothing scrolls, every control is on the screen and
        // reached by a tap where it is drawn.
        expect(l.bodyScrolls, where).toBe(false);
        expect(l.missed, where).toEqual([]);
        // Full-width rows at least 48px tall.
        expect(l.rows.length, where).toBeGreaterThanOrEqual(3);
        for (const r of l.rows) {
          expect(r.height, `${where}: ${r.name}`).toBeGreaterThanOrEqual(48);
          expect(r.width, `${where}: ${r.name}`).toBeGreaterThanOrEqual(l.column - 2);
        }
        // The close button sits below the status bar and the Dynamic Island, at the top right, a
        // quiet 36px circle; the screen itself has the focus, so nothing is lit up.
        expect(l.close.top, where).toBeGreaterThanOrEqual(phone.top);
        expect(l.close.middleY, where).toBeLessThan(phone.top + 60);
        expect(l.close.middleX, where).toBeGreaterThan(phone.viewport.width - 60);
        expect(l.close.width, where).toBeLessThanOrEqual(40);
        expect(l.focus, where).toBe("screen");
        // The page behind never moved, open or closed, and focus returns to the avatar.
        expect(await page.evaluate(() => scrollY), where).toBe(scrolled);
        await page.getByTestId("account-sheet-close").tap();
        await expect(page.getByTestId("account-sheet")).toHaveCount(0);
        expect(await page.evaluate(() => scrollY), where).toBe(scrolled);
        await expect(page.getByTestId("account-sheet-button")).toBeFocused();
      }
    }
  });
}

test("the close button's touch area reaches 44px around its 36px circle", async ({ page }) => {
  await page.goto("/team");
  await openScreen(page);
  const close = page.getByTestId("account-sheet-close");
  const box = (await close.boundingBox())!;
  const reached = await page.evaluate(({ x, y, h }) => {
    const button = document.querySelector("[data-testid=account-sheet-close]")!;
    const at = (dy: number) => {
      const el = document.elementFromPoint(x, y + dy);
      return !!el && (el === button || button.contains(el));
    };
    return { above: at(-(h / 2) - 3), below: at(h / 2 + 3) };
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2, h: box.height });
  expect(reached).toEqual({ above: true, below: true });
  await close.tap();
  await expect(page.getByTestId("account-sheet")).toHaveCount(0);
});

test("held sideways and with large text, the account screen scrolls as one region under its header, every control can be shown whole, and the close button never scrolls away", async ({ page, context, baseURL }) => {
  // 200% text on an upright 320px phone is left out: there the page itself is wider than the phone
  // (the tab bar's labels, the top bar, some page buttons), so the browser widens the area every
  // fixed element is placed in, the tab bar and every window included. The large-text layout that
  // keeps pages within the phone's width is its own piece of work (STATUS.md, follow-ups).
  const cases = [
    { size: "sideways", viewport: { width: 734, height: 343 }, root: 100 },
    { size: "sideways at 150% text", viewport: { width: 734, height: 343 }, root: 150 },
    { size: "150% text upright", viewport: { width: 393, height: 659 }, root: 150 },
  ];
  for (const { size, viewport, root } of cases) {
    await page.setViewportSize(viewport);
    for (const mode of ["player", "admin"] as const) {
      const where = `${size}, ${mode === "admin" ? "Admin Mode" : "Player Mode"}`;
      await context.addCookies([{ name: "uniiverse_view", value: mode, url: baseURL! }]);
      await page.goto(mode === "admin" ? "/admin" : "/team");
      if (root !== 100) await page.addStyleTag({ content: `html { font-size: ${root}% !important; }` });
      // From the keyboard: at large text the top bar can be wider than the phone.
      await page.getByTestId("account-sheet-button").focus();
      await page.keyboard.press("Enter");
      const screen = page.getByTestId("account-sheet");
      await expect(screen).toHaveAttribute("data-entered", "true");
      const box = (await screen.boundingBox())!;
      expect([box.x, box.y, box.width, box.height], where).toEqual([0, 0, viewport.width, viewport.height]);
      // One scroll region, never one inside another.
      const scrollers = await screen.evaluate((d) => [d, ...d.querySelectorAll<HTMLElement>("*")].filter((el) => el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY)).length);
      expect(scrollers, where).toBeLessThanOrEqual(1);
      // Each control brought to the top of the body is whole on screen, and the close button stays put.
      const close = (await screen.getByTestId("account-sheet-close").boundingBox())!;
      const whole = await screen.evaluate((d) => {
        const body = d.querySelector<HTMLElement>("[data-sheet-scroll]")!;
        const band = () => {
          const s = body.getBoundingClientRect();
          return { top: Math.max(0, s.top), bottom: Math.min(d.getBoundingClientRect().bottom, s.bottom) };
        };
        const out = [...body.querySelectorAll<HTMLElement>("nav a, nav button, [data-testid=mode-switch], [data-testid=sign-out]")].map((el) => {
          body.scrollTop += el.getBoundingClientRect().top - band().top - 1;
          const r = el.getBoundingClientRect();
          const b = band();
          return r.top >= b.top - 1 && r.bottom <= b.bottom + 1;
        });
        body.scrollTo(0, body.scrollHeight);
        return out;
      });
      expect(whole.length, where).toBeGreaterThanOrEqual(3);
      expect(whole, where).not.toContain(false);
      await expect(screen.getByText("Not endorsed by Riot Games."), where).toBeInViewport();
      expect((await screen.getByTestId("account-sheet-close").boundingBox())!.y, where).toBe(close.y);
      await page.keyboard.press("Escape");
      await expect(screen).toHaveCount(0);
    }
  }
});

test("no frame of the account screen's motion is off the screen, and it comes to rest even when its motion never runs on", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await safeAreas(page, 59, 34);
  // As the screen is shown, its opening motion is held and stepped through on the next frame.
  await page.addInitScript(() => {
    const show = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      show.call(this);
      requestAnimationFrame(() => {
        const motion = this.getAnimations().find((a) => (a as CSSAnimation).animationName === "screen-in");
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
  type Frame = { share: number; top: number; bottom: number };
  const frames = (await page.waitForFunction(() => (window as unknown as { __frames?: Frame[] }).__frames).then((h) => h.jsonValue())) as Frame[];
  expect(frames.length, "the screen opens with its own motion (screen-in)").toBe(6);
  // Every frame within 1rem of where the screen rests; the sheet's first frame was a whole sheet below the screen.
  for (const f of frames) expect(Math.abs(f.top), `at ${f.share * 100}% of the motion`).toBeLessThanOrEqual(16.5);

  // Every animation held at its first frame, as a browser that never moved one on would: the screen
  // still drops its motion and rests where its styles put it, drawn in full.
  await page.goto("/team");
  await page.addStyleTag({ content: "*, *::backdrop { animation-play-state: paused !important; }" });
  await page.getByTestId("account-sheet-button").tap();
  const screen = page.getByTestId("account-sheet");
  await expect(screen).toHaveAttribute("data-entered", "true", { timeout: 2_000 });
  expect(await screen.evaluate((d) => ({ animations: d.getAnimations().length, opacity: getComputedStyle(d).opacity, transform: getComputedStyle(d).transform }))).toEqual({ animations: 0, opacity: "1", transform: "none" });
  expect((await layout(page)).missed).toEqual([]);
});

test("with reduced motion the account screen is at rest as soon as it opens", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/team");
  await page.getByTestId("account-sheet-button").tap();
  const screen = page.getByTestId("account-sheet");
  await expect(screen).toHaveAttribute("data-entered", "true", { timeout: 300 });
  expect(await screen.evaluate((d) => ({ animations: d.getAnimations().filter((a) => a.playState === "running").length, transform: getComputedStyle(d).transform }))).toEqual({ animations: 0, transform: "none" });
});

test("the page behind is put back if anything scrolls it while the account screen is open", async ({ page }) => {
  // No browser here moves the page as the screen opens; the screen keeps it in place whatever does.
  await page.goto("/players");
  await page.evaluate(() => window.scrollTo(0, 400));
  const scrolled = await page.evaluate(() => scrollY);
  expect(scrolled).toBeGreaterThan(300);
  await openScreen(page);
  for (const to of [0, scrolled - 57, scrolled + 120]) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), to);
    await expect(async () => expect(await page.evaluate(() => scrollY)).toBe(scrolled)).toPass({ timeout: 2_000 });
  }
  await page.getByTestId("account-sheet-close").tap();
  await expect(page.getByTestId("account-sheet")).toHaveCount(0);
  expect(await page.evaluate(() => scrollY)).toBe(scrolled);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect(async () => expect(await page.evaluate(() => scrollY)).toBe(0)).toPass({ timeout: 2_000 });
});
