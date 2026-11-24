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

test("phone 390 × 844 (i12): a game's window, header, body and the Previous/Next bar with its folds closed, is at most 2.32 screens (PLAN S6's 2.0, raised for Release 16's inspection and score)", async ({ page }) => {
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
    // Release 16 (owner's request of 23 Nov 2026): inspecting any player and the performance score add
    // Build Path | Skill Order | Runes, the score's line and a third line per scoreboard row (the rank
    // whole). With the support figures and the score's why, tiles and chart folded on phones, the
    // demo's three games measured 2.15, 2.20 and 2.27 screens (the first 2.42 unfolded): the ceiling
    // is the largest plus 2% (the page budgets' exception rule, e2e/page-budgets.json).
    expect(Math.round(m.screens * 100) / 100, `game ${i + 1}: ${m.screens.toFixed(2)} screens`).toBeLessThanOrEqual(2.32);
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

/*
  The phone window shell at large text (Release 10, PLAN S2b's frame rule): at 320 × 568 and
  375 × 667 (and held sideways, 568 × 320), at 100, 150 and 200% text, once the body has scrolled
  100px, 400px and to its end, every whole-screen window's
  frame (what stays at the top while the content goes under it: the header, its 56px bar, or the
  floating controls of a window that scrolls as one) takes at most a quarter of the screen. A plain
  title bar collapses too, its title kept on one line (cut short with an ellipsis, the whole title
  still the window's name): the person window in Admin was 387px of 568 at 200%. Every control of
  the frame stays on the screen, ✕ closes it with the focus back on what opened it, and Back closes
  the windows that have an address.
*/
const WINDOWS: { name: string; view: "player" | "admin"; path: (page: Page) => Promise<string>; opener: string; win: string; address?: RegExp }[] = [
  { name: "Team player", view: "player", path: async () => "/team", opener: "[data-testid=lineup-row-TOP] [data-testid=open-player-detail]", win: "player-detail", address: /player=/ },
  { name: "Players Peek", view: "player", path: async () => "/players", opener: "[data-testid=player-peek-open] >> nth=1", win: "player-peek", address: /player=/ },
  { name: "Leaderboards Peek", view: "player", path: async () => "/leaderboards", opener: "[data-testid=board-peek-open] >> nth=1", win: "player-peek", address: /player=/ },
  { name: "game", view: "player", path: async (page) => `${await teammate(page)}/matches`, opener: "[data-testid=match-row] >> nth=1", win: "match-detail", address: /match=/ },
  { name: "Champion Intel's All champions", view: "player", path: async () => "/lookup?champion=Ahri", opener: "[data-testid=lookup-change]", win: "lookup-picker" },
  { name: "Admin person", view: "admin", path: async () => "/admin/people", opener: "[data-person] >> nth=1", win: "person-view", address: /person=/ },
];

test("phone 320 × 568, 375 × 667 and sideways 568 × 320 at 100, 150 and 200% text: 100px down and further, every whole-screen window's frame is at most 25% of the screen, its controls on it; ✕ and Back close it", async ({ page, context, baseURL }) => {
  test.skip(!isPhone(page), "the phone window shell");
  test.setTimeout(360_000);
  for (const w of WINDOWS) {
    for (const [width, height] of [[320, 568], [375, 667], [568, 320]] as const) {
      await context.addCookies([{ name: "uniiverse_view", value: w.view, url: baseURL! }]);
      await page.setViewportSize({ width, height });
      await page.goto(await w.path(page));
      await page.waitForLoadState("networkidle");
      const opener = page.locator(w.opener);
      const open = () => opener.evaluate((e) => { (e as HTMLElement).focus({ preventScroll: true }); (e as HTMLElement).click(); });
      await open();
      const win = page.locator("dialog[open]");
      await expect(win).toHaveCount(1);
      if (w.win) await expect(win).toHaveAttribute("data-testid", w.win);
      let plain = false;
      for (const size of [100, 150, 200]) {
        await page.evaluate((s) => { document.documentElement.style.fontSize = `${s}%`; }, size);
        const m = await win.evaluate(async (d) => {
          const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          await frames();
          const header = d.querySelector<HTMLElement>("[data-modal-handle]:not([data-testid=modal-compact-bar])") ?? (d.firstElementChild as HTMLElement);
          const body = header.nextElementSibling as HTMLElement;
          // What scrolls: the window where it scrolls as one (a small phone, a short window), else its body.
          const scroller = getComputedStyle(body).overflowY === "visible" || getComputedStyle(d).overflowY === "auto" && d.scrollHeight > d.clientHeight + 1 ? d : body;
          scroller.scrollTop = 0;
          await frames();
          const vw = document.documentElement.clientWidth;
          const depths: { depth: number; scrolled: number; frame: number; off: string[] }[] = [];
          for (const depth of [100, 400, 1e6]) {
            // Set again once settled: a window's own effects (its content arriving) may move it back.
            for (let i = 0; i < 3 && Math.round(scroller.scrollTop) < Math.min(depth, scroller.scrollHeight - scroller.clientHeight) - 1; i++) {
              scroller.scrollTop = depth;
              await new Promise((r) => setTimeout(r, 350));
            }
            const bar = d.querySelector<HTMLElement>("[data-testid=modal-compact-bar]");
            const barBottom = bar && getComputedStyle(bar).opacity === "1" ? bar.getBoundingClientRect().bottom : 0;
            const controls = d.querySelector<HTMLElement>("[data-testid=modal-controls]")!;
            const fixed = getComputedStyle(controls).position === "fixed" ? controls.getBoundingClientRect().bottom : 0;
            // A header that scrolls away with the content is no frame; a pinned or sticky one is.
            const pinned = scroller === body || getComputedStyle(header).position === "sticky";
            const frame = Math.max(barBottom, fixed, pinned ? header.getBoundingClientRect().bottom : 0);
            const off = [...controls.querySelectorAll<HTMLElement>("button, a[href]")].filter((b) => { const r = b.getBoundingClientRect(); return r.left < -0.5 || r.right > vw + 0.5; }).map((b) => b.getAttribute("aria-label") ?? b.textContent ?? "");
            depths.push({ depth, scrolled: Math.round(scroller.scrollTop), frame: Math.round(frame), off });
          }
          return { depths, range: scroller.scrollHeight - scroller.clientHeight, plain: !d.querySelector("[data-testid=modal-compact-bar]"), top: Math.max(0, Math.round(d.getBoundingClientRect().top)) };
        });
        const at = `${w.name} at ${width} × ${height}, ${size}%`;
        // A body with room to scroll is scrolled: the frame rule is never skipped for want of a scroll.
        if (m.range > 300) expect(m.depths[0]!.scrolled, `${at}: the body scrolled 100px`).toBeGreaterThanOrEqual(100);
        for (const d of m.depths) {
          expect(d.off, `${at}, ${d.scrolled}px down: controls on the screen`).toEqual([]);
          // A body too short to scroll 100px leaves its header as it is: nothing to give back.
          if (d.scrolled >= 100) expect(d.frame, `${at}, ${d.scrolled}px down: the frame`).toBeLessThanOrEqual(height * 0.25);
          // A window that collapses to the compact bar keeps it at 56px at every text size (measured at most
          // 60 with its edge; in rem it was 112px at 200%), not merely under 25%.
          if (d.scrolled >= 100 && !m.plain) expect(d.frame - m.top, `${at}, ${d.scrolled}px down: the 56px bar`).toBeLessThanOrEqual(61);
        }
        plain = m.plain;
      }
      // The whole title stays the window's name, whatever the collapsed bar draws (still scrolled, at 200%).
      const name = await win.evaluate((d) => document.getElementById(d.getAttribute("aria-labelledby")!)?.textContent?.trim() ?? "");
      expect(name.length, `${w.name}: the window is named`).toBeGreaterThan(0);
      // (A plain title bar's title, cut short with an ellipsis once collapsed.)
      if (plain) await expect(page.getByRole("dialog", { name, exact: true }), `${w.name}: named by its whole title`).toHaveCount(1);
      if (width === 320) {
        if (w.address) {
          await expect(page).toHaveURL(w.address);
          await page.goBack();
          await expect(win).toHaveCount(0);
          await expect(page).not.toHaveURL(w.address);
          await open();
          await expect(win).toHaveCount(1);
        }
        await win.locator("[data-testid=modal-controls] button[aria-label=Close], [data-testid=modal-controls] button[aria-label^='Close']").last().tap();
        await expect(win).toHaveCount(0);
        if (w.address) await expect(page).not.toHaveURL(w.address);
        // The focus goes back to what opened the window.
        await expect(opener, `${w.name}: the focus is back on what opened it`).toBeFocused();
      }
      await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    }
  }
});

/*
  The player Peek at 320px with large text (Release 9's report: "Previous player" 9px past the left
  edge at 200%): on Players' and Leaderboards' rows and Team's lineup, upright (320 × 568, 375 × 667)
  and sideways (568 × 320), at
  125, 150, 175 and 200% text, every control of the Peek, its ‹ › and ✕ and everything in its body,
  is on the screen, the frame's controls 44px on touch, nothing scrolls sideways, and the pool's
  experience labels are whole (the name's column was 0px wide at 200%, the label 23px past the edge).
*/
test("phone: the player Peek on Players and Leaderboards, and the Team player window, keep every control on a 320px screen at 125–200% text, upright and sideways, with every pool row whole", async ({ page }) => {
  test.skip(!isPhone(page), "the Peek's phone window");
  test.setTimeout(240_000);
  for (const [path, opener, id] of [["/players", "[data-testid=player-peek-open] >> nth=1", "player-peek"], ["/leaderboards", "[data-testid=board-peek-open] >> nth=1", "player-peek"], ["/team", "[data-testid=lineup-row-TOP] [data-testid=open-player-detail]", "player-detail"]] as const) {
    for (const [width, height] of [[320, 568], [375, 667], [568, 320]] as const) {
      await page.setViewportSize({ width, height });
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await page.locator(opener).evaluate((e) => (e as HTMLElement).click());
      const win = page.getByTestId(id);
      await expect(win).toBeVisible();
      await expect(win.getByTestId("pool-list").first()).toBeVisible();
      for (const size of [125, 150, 175, 200]) {
        await page.evaluate((s) => { document.documentElement.style.fontSize = `${s}%`; }, size);
        const m = await win.evaluate(async (d) => {
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const vw = document.documentElement.clientWidth;
          const name = (e: Element) => e.getAttribute("aria-label") ?? e.textContent?.trim().slice(0, 30);
          const off = [...d.querySelectorAll<HTMLElement>("button, a[href]")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.left < -0.5 || r.right > vw + 0.5); }).map(name);
          const small = [...d.querySelectorAll<HTMLElement>("[data-testid=modal-controls] button")].filter((e) => { const r = e.getBoundingClientRect(); return r.width < 43.5 || r.height < 43.5; }).map(name);
          const cut = [...d.querySelectorAll<HTMLElement>("[data-testid=tier-quiet]")].filter((e) => { const r = e.getBoundingClientRect(); const cell = e.closest("li")!.getBoundingClientRect(); return r.right > cell.right + 0.5; }).map(name);
          // Each pool row: the name has room (it was 0px wide at 150% beside the figures), and the
          // experience label is not drawn over the figures (it was, from 125% on a 320px phone).
          const rows = [...d.querySelectorAll<HTMLElement>("[data-testid=pool-champion]")].filter((li) => li.getClientRects().length);
          const crowded = rows.filter((li) => {
            const nameBox = li.querySelector("[data-testid=pool-champion-name]")?.getBoundingClientRect();
            const label = li.querySelector("[data-testid=tier-quiet] [data-tier]")?.getBoundingClientRect();
            const stats = [...li.querySelectorAll<HTMLElement>("[data-testid=pool-champion-stats]")].find((e) => e.getClientRects().length)?.getBoundingClientRect();
            const overlaps = !!label && !!stats && label.right > stats.left + 0.5 && label.left < stats.right - 0.5 && label.bottom > stats.top + 0.5 && label.top < stats.bottom - 0.5;
            return (nameBox && nameBox.width < 8) || overlaps;
          }).map((li) => li.dataset.champion);
          return { off, small, cut, crowded, sideways: document.documentElement.scrollWidth - vw, inside: d.scrollWidth - d.clientWidth };
        });
        const at = `${path} at ${width} × ${height}, ${size}%`;
        expect(m.off, `${at}: controls off the screen`).toEqual([]);
        expect(m.small, `${at}: the frame's controls under 44px`).toEqual([]);
        expect(m.cut, `${at}: experience labels past their row`).toEqual([]);
        expect(m.crowded, `${at}: pool rows with no room for the name, or the label over the figures`).toEqual([]);
        expect(m.sideways, `${at}: the page scrolls sideways`).toBeLessThanOrEqual(0);
        expect(m.inside, `${at}: the window scrolls sideways`).toBeLessThanOrEqual(0);
      }
      await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    }
  }
});

/*
  The kit's dialogs at 320 × 568 with 200% text (Release 10's sweep): the Task dialog at its two
  sizes (a confirmation, `form`: "Sign out everywhere" began 44px off the left; a picker: Manage
  access ran 70px sideways, its grid as wide as the base-access select's widest option), a sheet (a
  lineup place: the members' names were cut to 0px beside "Now", its radio 3px past the edge) and the
  sign-in form (the brand's name ended in an ellipsis). In each, every control is on the screen and no
  text is cut short. (Popover and the desktop Select do not open on a phone: Select is the browser's
  own there, checked here inside Manage access.)
*/
test("phone 320 × 568 at 200% text: the Task dialog (form, picker), a sheet and the sign-in form keep every control on the screen and every word whole", async ({ page, context, browser, baseURL }) => {
  test.skip(!isPhone(page), "the kit at a phone's width");
  await page.setViewportSize({ width: 320, height: 568 });
  const big = () => page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  const check = async (p: Page, what: string) => {
    const m = await p.locator("dialog[open]").last().evaluate(async (d) => {
      await new Promise((r) => setTimeout(r, 300));
      const vw = document.documentElement.clientWidth;
      const name = (e: Element) => (e.getAttribute("aria-label") ?? e.textContent ?? "").trim().slice(0, 30);
      const off = [...d.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 1 && (r.left < -0.5 || r.right > vw + 0.5); }).map(name);
      // Text cut short: an element with its own text, clipped or ending in an ellipsis, narrower than its text.
      const cut = [...d.querySelectorAll<HTMLElement>("*")].filter((e) => {
        if (e.closest(".sr-only") || ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim())) return false;
        const cs = getComputedStyle(e);
        return (cs.overflowX !== "visible" || cs.textOverflow === "ellipsis") && e.scrollWidth > e.clientWidth + 1;
      }).map(name);
      // What a finger could scroll sideways: the window, or a scroller in it.
      const sideways = [d, ...d.querySelectorAll<HTMLElement>("*")].filter((e) => /auto|scroll/.test(getComputedStyle(e).overflowX) && e.scrollWidth > e.clientWidth + 1).length;
      return { off, cut, sideways };
    });
    expect(m.off, `${what}: controls off the screen`).toEqual([]);
    expect(m.cut, `${what}: text cut short`).toEqual([]);
    expect(m.sideways, `${what}: scrolls sideways`).toBe(0);
  };

  // Admin: a confirmation (form) and Manage access (picker), from the person window.
  await context.addCookies([{ name: "uniiverse_view", value: "admin", url: baseURL! }]);
  await page.goto("/admin/people");
  await page.waitForLoadState("networkidle");
  await big();
  await page.locator("[data-person]").nth(1).evaluate((e) => (e as HTMLElement).click());
  const person = page.getByTestId("person-view");
  await expect(person).toBeVisible();
  for (const [opener, what] of [["sign-out-everywhere", "a confirmation (form)"], ["", "Manage access (picker)"]] as const) {
    const button = opener ? person.getByTestId(opener) : person.getByRole("button", { name: "Manage access" });
    await button.evaluate((e) => (e as HTMLElement).click());
    await expect(page.locator("dialog[open]")).toHaveCount(2);
    await check(page, what);
    // A long username in its title ("Sign … out everywhere?") breaks inside the window, not past it (an
    // account an earlier spec made, "lineupmanag…", put the confirmation 22px past the phone).
    if (opener) {
      await page.locator("dialog[open]").last().getByTestId("modal-title").evaluate((h) => { h.textContent = "Sign averyveryverylongusername2026 out everywhere?"; });
      await check(page, `${what}, a long username`);
    }
    await page.locator("dialog[open]").last().getByTestId("dialog-close").click();
    await expect(page.locator("dialog[open]")).toHaveCount(1);
  }

  // A sheet: who starts in a lineup place.
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  await page.goto("/team");
  await page.waitForLoadState("networkidle");
  await big();
  await page.getByTestId("edit-lineup").evaluate((e) => (e as HTMLElement).click());
  await page.getByTestId("lineup-change-TOP").evaluate((e) => (e as HTMLElement).click());
  await expect(page.getByTestId("lineup-sheet-TOP")).toBeVisible();
  await check(page, "a lineup sheet");

  // The sign-in form, for a guest.
  const guest = await browser.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
  await guest.addCookies([{ name: "uniiverse_guest", value: "1", url: baseURL! }]);
  const g = await guest.newPage();
  await g.goto("/public");
  await g.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await g.getByTestId("public-sign-in").evaluate((e) => (e as HTMLElement).click());
  await expect(g.getByTestId("sign-in-window")).toBeVisible();
  await check(g, "the sign-in form");
  await guest.close();
});
