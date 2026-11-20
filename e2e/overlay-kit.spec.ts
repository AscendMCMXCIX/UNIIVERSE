import { expect, test, type Page } from "./test";
import { pullDown } from "./pull";

/*
  The overlay kit's acceptance (PLAN S4a; docs/DESIGN_SYSTEM.md §7, "Containers"):
  - the phone window shell (PreviewWindow on DetailModal): a whole-screen window's header collapses
    to a 56px bar once its body scrolls, and a pull on the header closes every whole-screen window,
    not only sheets;
  - closing a window opened from a row partly under the tab bar moves the list 0px (UM.X4: 70–109px
    when audited), and a filter's Done still brings the list's start under the bars;
  - the pinned row's Filters is a 34rem Popover: "Support" whole, nothing scrolling sideways, at
    1440, 1920 and 2560; Escape gives the focus back to the button;
  - Android's Back in the emulated installed app closes the Team player Peek and changes nothing
    else; the Filters have no history entry (a choice in them replaces the query), so a choice made
    in the popover stays however it closes, and Back afterwards leaves the page.
  Phone parts run on the phone project, the desktop sizes on the desktop project (each sets its own
  sizes), so the file costs one project's time for each.
*/

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;

async function teammate(page: Page): Promise<string> {
  await page.goto("/team");
  return `/players/${await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id")}`;
}

/** Scrolls to the end in steps (the frame watches the bar go up under it), as a reader does. */
async function scrollToEnd(page: Page) {
  await page.evaluate(async () => {
    const end = document.documentElement.scrollHeight - innerHeight;
    for (let y = window.scrollY; y < end; y += 240) {
      window.scrollTo(0, y);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    window.scrollTo(0, end);
  });
}

test("phone: a whole-screen window's header collapses to a 56px bar as its body scrolls, opens again at the top, and a pull on the header closes it", async ({ page }) => {
  test.skip(!isPhone(page), "the phone window shell");
  await page.goto("/team");
  await page.getByTestId("lineup-row-TOP").getByTestId("open-player-detail").tap();
  const win = page.getByTestId("player-detail");
  await expect(win).toBeVisible();
  await expect(page).toHaveURL(/player=/);
  const bar = win.getByTestId("modal-compact-bar");
  await expect(bar).toHaveCSS("opacity", "0");
  // The window's scroller: its body, or the window itself where it scrolls as one (a small phone).
  const scroll = (top: number) =>
    win.evaluate((el, t) => {
      const body = el.querySelector<HTMLElement>("[data-modal-handle]:not([data-testid=modal-compact-bar]) + div")!;
      (getComputedStyle(el).overflowY === "auto" ? el : body).scrollTop = t;
    }, top);
  await scroll(160);
  await expect(bar).toHaveCSS("opacity", "1");
  const shown = await bar.boundingBox();
  expect(Math.round(shown!.height), "the bar is 56px").toBe(56);
  expect(Math.round(shown!.y), "at the top of the screen").toBe(0);
  await expect(bar).toContainText(await page.locator("#player-detail-title").innerText());
  // The header itself, where the body scrolls under it, collapses to the bar's height.
  const header = await win.evaluate((el) => (getComputedStyle(el).overflowY === "auto" ? null : Math.round(el.querySelector("[data-modal-handle]:not([data-testid=modal-compact-bar])")!.getBoundingClientRect().height)));
  if (header !== null) expect(header).toBeLessThanOrEqual(56);
  await scroll(0);
  await expect(bar).toHaveCSS("opacity", "0");
  await pullDown(win.locator("[data-modal-handle]:not([data-testid=modal-compact-bar])"));
  await expect(win).toBeHidden();
  await expect(page).not.toHaveURL(/player=/);

  // A game's window (Match History) is pulled down the same way. (The account screen is a screen of
  // its own, not a window over an item: nothing on it pulls, e2e/mobile-nav.spec.ts.)
  const profile = await teammate(page);
  await page.goto(`${profile}/matches`);
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  const row = await page.getByTestId("match-row").nth(1).boundingBox();
  await page.touchscreen.tap(row!.x + 30, row!.y + 20);
  const game = page.getByTestId("match-detail");
  await expect(game).toBeVisible();
  await pullDown(page.getByTestId("match-detail-header"));
  await expect(game).toBeHidden();
  await expect(page).not.toHaveURL(/match=/);
});

test("phone: closing a window opened from a row partly under the tab bar moves the list 0px (UM.X4), on Match History and Team Matches", async ({ page }) => {
  test.skip(!isPhone(page), "the phone's tab bar");
  const profile = await teammate(page);
  for (const [path, rows, close] of [
    [`${profile}/matches`, "match-row", "match-detail-close"],
    ["/matches", "together-card", "match-detail-close"],
  ] as const) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const bar = await page.getByTestId("phone-tabbar").boundingBox();
    const row = page.getByTestId(rows).nth(3);
    // The row's top 30px above the tab bar, the rest under it.
    const top = await row.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    await page.evaluate((y) => window.scrollTo(0, y), top - (bar!.y - 30));
    await page.waitForTimeout(200);
    const before = await page.evaluate(() => window.scrollY);
    const box = await row.boundingBox();
    await page.touchscreen.tap(box!.x + 30, box!.y + 15);
    await expect(page.locator("dialog[open]")).toHaveCount(1);
    await page.getByTestId(close).tap();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY), `${rows}: the list does not move`).toBe(before);
  }
});

test("phone 320 × 568: after stepping through games in the window, closing it (✕ or Back) leaves the last game viewed on screen, under the bars, with the focus", async ({ page }) => {
  test.skip(!isPhone(page), "the phone's window over Match History");
  await page.setViewportSize({ width: 320, height: 568 });
  const profile = await teammate(page);
  for (const close of ["button", "back"] as const) {
    await page.goto(`${profile}/matches`);
    await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
    const first = await page.getByTestId("match-row").first().boundingBox();
    await page.touchscreen.tap(first!.x + 30, first!.y + 20);
    const win = page.getByTestId("match-detail");
    await expect(win).toBeVisible();
    for (let i = 0; i < 5; i++) {
      const at = page.url();
      await win.getByTestId("match-detail-next").tap();
      await expect.poll(() => page.url()).not.toBe(at);
    }
    const last = new URL(page.url()).searchParams.get("match")!;
    if (close === "back") await page.goBack();
    else await win.getByTestId("match-detail-close").tap();
    await expect(win).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate((id) => {
          const li = document.getElementById(`match-${id}`)!;
          const r = li.getBoundingClientRect();
          const top = document.querySelector("[data-testid=mobile-topbar]")!.getBoundingClientRect().bottom;
          const bar = document.querySelector("[data-testid=phone-tabbar]")!.getBoundingClientRect().top;
          return { focused: li.contains(document.activeElement), onScreen: r.top >= top - 1 && r.top + 48 <= bar };
        }, last),
      { message: close },
      )
      .toEqual({ focused: true, onScreen: true });
  }
});

test("phone 390 × 844 (i12): a game's window, header, body and the Previous/Next bar with its folds closed, is at most 2.0 screens (PLAN S6)", async ({ page }) => {
  test.skip(!isPhone(page), "the phone's window over Match History");
  await page.setViewportSize({ width: 390, height: 844 });
  const profile = await teammate(page);
  await page.goto(`${profile}/matches`);
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  const row = await page.getByTestId("match-row").first().boundingBox();
  await page.touchscreen.tap(row!.x + 30, row!.y + 20);
  const win = page.getByTestId("match-detail");
  // The demo's first three games (1.50–1.82 screens on 20 Nov 2026; 2.9 with the gold and build folds open).
  for (let i = 0; i < 3; i++) {
    await expect(win.getByTestId("match-detail-body")).toBeVisible();
    await page.waitForLoadState("networkidle");
    const m = await win.evaluate((w) => {
      const panel = (w.closest("dialog") ?? w) as HTMLElement;
      // The whole game: the window as drawn plus what its scrolling part holds below the fold.
      let hidden = 0;
      for (const el of [panel, ...panel.querySelectorAll<HTMLElement>("*")]) {
        if (/(auto|scroll)/.test(getComputedStyle(el).overflowY)) hidden = Math.max(hidden, el.scrollHeight - el.clientHeight);
      }
      return { screens: (panel.getBoundingClientRect().height + hidden) / innerHeight, open: panel.querySelectorAll("details[open]").length };
    });
    expect(m.open, `game ${i + 1}: its folds closed`).toBe(0);
    expect(Math.round(m.screens * 100) / 100, `game ${i + 1}: ${m.screens.toFixed(2)} screens`).toBeLessThanOrEqual(2.0);
    if (i < 2) {
      const at = page.url();
      await win.getByTestId("match-detail-next").tap();
      await expect.poll(() => page.url()).not.toBe(at);
    }
  }
});

test("phone at 150% (320 wide) and 200% (390 wide): the game window's Previous, Next and \"Game n of m\" stay on the screen", async ({ page }) => {
  test.skip(!isPhone(page), "the phone's window over Match History");
  const profile = await teammate(page);
  for (const [width, size] of [[320, 150], [390, 200]] as const) {
    await page.setViewportSize({ width, height: 700 });
    await page.goto(`${profile}/matches`);
    await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
    await page.addStyleTag({ content: `html { font-size: ${size}% !important; }` });
    // The row in the middle of the screen, clear of the pinned bars (taller at a large text size).
    const target = page.getByTestId("match-row").nth(2);
    await target.evaluate((r) => r.scrollIntoView({ block: "center" }));
    const row = await target.boundingBox();
    await page.touchscreen.tap(row!.x + 20, row!.y + row!.height / 2);
    const win = page.getByTestId("match-detail");
    await expect(win.getByTestId("match-detail-nav")).toBeVisible();
    for (const id of ["match-detail-prev", "match-detail-position", "match-detail-next"]) {
      const b = (await win.getByTestId(id).boundingBox())!;
      expect(b.x, `${width}px at ${size}%: ${id}`).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, `${width}px at ${size}%: ${id}`).toBeLessThanOrEqual(width);
    }
  }
});

test("desktop: the pinned row's Filters is a 34rem popover with Support whole and nothing scrolling sideways at 1440, 1920 and 2560; Escape gives the focus back", async ({ page }) => {
  test.skip(page.viewportSize()?.width !== 1440, "the desktop project sets its sizes itself");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const profile = await teammate(page);
  for (const width of [1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${profile}/matches`);
    await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
    await scrollToEnd(page);
    const trigger = page.getByTestId("toolbar-filters");
    await expect(trigger).toBeVisible();
    const scrolled = await page.evaluate(() => window.scrollY);
    await trigger.click();
    const pop = page.getByTestId("filter-sheet");
    await expect(pop).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const measure = () => pop.evaluate((el) => {
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const support = [...el.querySelectorAll<HTMLElement>("label, button, a")].find((n) => n.textContent?.trim() === "Support")!;
      const s = support.getBoundingClientRect();
      const p = el.getBoundingClientRect();
      const sideways = [...el.querySelectorAll<HTMLElement>("*")].filter((n) => n.scrollWidth > n.clientWidth + 1 && !["visible", "hidden", "clip"].includes(getComputedStyle(n).overflowX)).length;
      const atPoint = document.elementFromPoint(s.left + s.width / 2, s.top + s.height / 2);
      return { popover: el.hasAttribute("data-popover"), modal: !!document.querySelector("dialog[open]"), rem: Math.round((p.width / root) * 10) / 10, inside: s.left >= p.left && s.right <= p.right, hit: !!atPoint && support.contains(atPoint), sideways, focused: el.contains(document.activeElement) };
    });
    await expect.poll(measure, { message: `${width}px` }).toEqual({ popover: true, modal: false, rem: 34, inside: true, hit: true, sideways: 0, focused: true });
    await page.keyboard.press("Escape");
    await expect(pop).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => window.scrollY), "the page does not move").toBe(scrolled);
  }
});

test("Android's installed app: Back closes the Team player Peek, however many players were switched to, and changes nothing else", async ({ page }) => {
  test.skip(!isPhone(page), "the phone project, emulating the installed app");
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q: string) => (q.includes("display-mode: standalone") || q.includes("display-mode:standalone") ? ({ ...real(q), matches: true, media: q, addEventListener() {}, removeEventListener() {} } as MediaQueryList) : real(q));
  });
  await page.goto("/team");
  await page.getByTestId("lineup-row-TOP").getByTestId("open-player-detail").tap();
  await expect(page.getByTestId("player-detail")).toBeVisible();
  await page.getByTestId("detail-next").tap();
  await page.getByTestId("detail-next").tap();
  await page.goBack();
  await expect(page.getByTestId("player-detail")).toBeHidden();
  await expect(page).toHaveURL(/\/team$/);

});

test("desktop: a choice in the Filters popover stays when it closes (Done, Escape, a press outside), and Back afterwards leaves the page as every filter's change does", async ({ page }) => {
  test.skip(page.viewportSize()?.width !== 1440, "the popover's own behaviour; one project");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const profile = await teammate(page);
  await page.goto("/team");
  await page.goto(`${profile}/matches`);
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  for (const close of ["Done", "Escape", "outside"] as const) {
    await scrollToEnd(page);
    await page.getByTestId("toolbar-filters").click();
    const pop = page.getByTestId("filter-sheet");
    await expect(pop).toBeVisible();
    const before = page.url();
    await pop.getByTestId(/role=support/i.test(before) ? "role-filter-TOP" : "role-filter-SUPPORT").click();
    // Closed at once, before the change has necessarily landed: the change still lands.
    if (close === "Done") await pop.getByTestId("filter-sheet-done").click();
    else if (close === "Escape") await page.keyboard.press("Escape");
    else await page.mouse.click(5, 450);
    await expect(pop).toHaveCount(0);
    await expect.poll(() => page.url(), `${close}: the choice stays`).not.toBe(before);
  }
  await page.goBack();
  await expect(page).toHaveURL(/\/team$/);
});
