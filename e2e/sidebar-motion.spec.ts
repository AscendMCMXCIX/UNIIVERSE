import { expect, test, type Page } from "./test";

/*
  The desktop sidebar's collapse and expand. The visible edge clips everything in every frame, so
  no highlight or label stands out over the page while it moves (before, the current page's
  highlight showed as a band across the page for 220 ms). The control sits under the logo, in the
  same place open or collapsed, works from the keyboard, rapid toggling settles on the last
  choice, and a click made before the page's code has run is applied once it runs, exactly once.
  The rail is three zones (the brand, the pages, the footer) split by hairlines
  (docs/DESIGN_SYSTEM.md → Navigation). Frames are checked by freezing the running transitions (Web Animations API).
*/

test.beforeEach(async ({ context, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "the desktop sidebar");
  await context.addCookies([
    { name: "uniiverse_view", value: "player", url: baseURL! },
    { name: "uniiverse_sidebar", value: "expanded", url: baseURL! },
  ]);
});

/** Freezes every running transition `ms` into it. */
const freezeAt = (page: Page, ms: number) =>
  page.evaluate((t) => {
    for (const a of document.getAnimations()) {
      a.pause();
      a.currentTime = t;
    }
  }, ms);

const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" && a.playState !== "paused"));

for (const path of ["/team", "/overview", "/leaderboards", "/matches"]) {
  test(`collapsing on ${path}: nothing of the sidebar shows beyond its moving edge`, async ({ page }) => {
    await page.goto(path);
    const aside = page.getByTestId("sidebar");
    // The row of the current page's entry: its highlight is the widest thing that could stand out.
    const current = aside.locator('nav[aria-label="Main"] [aria-current="page"]').first();
    await expect(current).toBeVisible();
    const y = await current.evaluate((e) => {
      const r = e.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    await page.getByTestId("sidebar-toggle").click();
    await page.mouse.move(900, 600);
    for (const ms of [16, 50, 100, 160, 210]) {
      await freezeAt(page, ms);
      const frame = await page.evaluate((y) => {
        const edge = document.querySelector('[data-testid="sidebar-window"]')!.getBoundingClientRect().right;
        const inAside = (x: number) => !!document.elementFromPoint(x, y)?.closest("aside");
        return { edge, inside: inAside(edge - 6), beyond: [6, 30, 90].map((d) => edge + d).filter((x) => x < 250).map(inAside) };
      }, y);
      expect(frame.inside, `${ms} ms: the sidebar is there up to its edge (${frame.edge}px)`).toBe(true);
      expect(frame.beyond, `${ms} ms: nothing of it beyond the edge (${frame.edge}px)`).not.toContain(true);
    }
    await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
    await expect(aside).toHaveAttribute("data-collapsed", "true");
    const edge = (await page.getByTestId("sidebar-window").boundingBox())!;
    expect(Math.round(edge.x + edge.width)).toBe(72);
  });
}

test("the collapse control sits under the logo, in the same place open or collapsed, and works from the keyboard", async ({ page }) => {
  await page.goto("/leaderboards");
  const aside = page.getByTestId("sidebar");
  const toggle = page.getByTestId("sidebar-toggle");
  const icon = toggle.locator("svg").first();
  const logo = (await aside.getByRole("link").first().boundingBox())!;
  const open = (await icon.boundingBox())!;
  expect(open.y, "right under the logo").toBeGreaterThan(logo.y + logo.height - 1);
  expect(open.y, "near the top").toBeLessThan(logo.y + logo.height + 40);
  await expect(toggle).toHaveAccessibleName("Collapse sidebar");
  await expect(toggle).toHaveAttribute("title", /Ctrl\+\\/);
  await toggle.click();
  await page.mouse.move(900, 600);
  await expect(aside).toHaveAttribute("data-collapsed", "true");
  await settled(page);
  const closed = (await icon.boundingBox())!;
  expect(Math.abs(closed.x - open.x) + Math.abs(closed.y - open.y)).toBeLessThan(1);
  await expect(toggle).toBeInViewport();
  // From the keyboard: the control is the next stop after the logo.
  await aside.getByRole("link").first().focus();
  await page.keyboard.press("Tab");
  await expect(toggle).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(aside).toHaveAttribute("data-collapsed", "false");
  await expect(toggle).toHaveAccessibleName("Collapse sidebar");
});

test("rapid toggling settles on the last choice, and it is remembered", async ({ page }) => {
  await page.goto("/matches");
  const aside = page.getByTestId("sidebar");
  const toggle = page.getByTestId("sidebar-toggle");
  // Seven presses while it moves: collapsed at the end. The control does not move, so no press misses.
  for (let i = 0; i < 7; i++) await toggle.click({ position: { x: 24, y: 16 }, delay: 0 });
  await page.mouse.move(900, 600);
  await expect(aside).toHaveAttribute("data-collapsed", "true");
  await settled(page);
  const edge = (await page.getByTestId("sidebar-window").boundingBox())!;
  expect(Math.round(edge.x + edge.width)).toBe(72);
  expect(await page.evaluate(() => document.elementFromPoint(160, 200)?.closest("aside") ?? null)).toBeNull();
  await page.reload();
  await expect(page.getByTestId("sidebar")).toHaveAttribute("data-collapsed", "true");
});

test.describe("before the page's code has run", () => {
  // The page is loaded twice; a service worker would serve the second load's navigation itself.
  test.use({ serviceWorkers: "block" });

  /** Holds the page's JavaScript back until released: the server's page is drawn, and nothing of the app runs. */
  async function holdScripts(page: Page): Promise<{ release: () => void }> {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(/\/_next\/static\/chunks\/.+\.js(\?.*)?$/, async (route) => {
      await held;
      await route.continue().catch(() => undefined);
    });
    return { release };
  }

  test("a click on the collapse control is kept, shown pressed, and applied once the code runs, exactly once; from the keyboard too", async ({ page }) => {
    const aside = page.getByTestId("sidebar");
    const toggle = page.getByTestId("sidebar-toggle");
    let scripts = await holdScripts(page);
    await page.goto("/team", { waitUntil: "domcontentloaded" });
    await expect(aside).toHaveAttribute("data-collapsed", "false");
    // Two clicks before the code runs: one toggle (applied twice it would undo itself).
    await toggle.click();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-busy", "true");
    expect(await page.evaluate(() => window.__earlyTaps)).toEqual(["sidebar"]);
    await page.mouse.move(900, 600);
    scripts.release();
    await expect(aside).toHaveAttribute("data-collapsed", "true");
    await expect(toggle).not.toHaveAttribute("aria-busy");
    await page.waitForTimeout(600);
    await expect(aside).toHaveAttribute("data-collapsed", "true");
    expect(await page.evaluate(() => document.cookie)).toContain("uniiverse_sidebar=collapsed");
    // Enter on the focused control, before the code runs, goes the same way: the folded rail opens.
    await page.unrouteAll({ behavior: "ignoreErrors" });
    scripts = await holdScripts(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(aside).toHaveAttribute("data-collapsed", "true");
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-busy", "true");
    scripts.release();
    await expect(aside).toHaveAttribute("data-collapsed", "false");
    await page.waitForTimeout(600);
    await expect(aside).toHaveAttribute("data-collapsed", "false");
    await expect(toggle).toHaveAccessibleName("Collapse sidebar");
  });
});

test("with reduced motion the sidebar switches at once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/team");
  await page.getByTestId("sidebar-toggle").click();
  await page.mouse.move(900, 600);
  // No frame in between: the edge is at the rail straight away.
  const edge = await page.evaluate(() => document.querySelector('[data-testid="sidebar-window"]')!.getBoundingClientRect().right);
  expect(Math.round(edge)).toBe(72);
});

test("collapsed, the logo and every icon sit on the rail's centre line, the entries evenly spaced in zones apart from the brand, and the current page's highlight is centred on its icon", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_sidebar", value: "collapsed", url: baseURL! }]);
  await page.goto("/team");
  await page.mouse.move(900, 600);
  const aside = page.getByTestId("sidebar");
  await expect(aside).toHaveAttribute("data-collapsed", "true");
  await settled(page);
  const rail = (await page.getByTestId("sidebar-slot").boundingBox())!;
  const centre = rail.x + rail.width / 2;
  const marks = await aside.evaluate((el) => {
    const mid = (e: Element) => {
      const r = e.getBoundingClientRect();
      return { name: e.closest("[data-testid]")?.getAttribute("data-testid") ?? e.tagName, x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
    };
    const logo = el.querySelector("a[title] img, a[title] [data-testid=brand-mark-text]")!;
    const toggle = el.querySelector("[data-testid=sidebar-toggle] svg")!;
    const entries = [...el.querySelectorAll("nav a svg")].map(mid);
    const column = [mid(logo), mid(toggle), ...entries];
    const dividers = [...el.querySelectorAll("[data-testid=rail-divider]")].map((d) => d.getBoundingClientRect()).map((r) => ({ name: "divider", x: (r.left + r.right) / 2, y: r.top, width: r.width }));
    const footer = [...el.querySelectorAll("[data-testid=mode-switch] svg, [data-testid=install-app] svg, [data-testid=account-menu-button] > :first-child")].map(mid);
    const current = el.querySelector("nav a[aria-current=page] [data-testid=nav-highlight]")!.getBoundingClientRect();
    return { column, entries, dividers, footer, highlight: (current.left + current.right) / 2 };
  });
  for (const m of [...marks.column, ...marks.footer, ...marks.dividers]) expect(Math.abs(m.x - centre), `${m.name} at ${m.x}, the rail's centre ${centre}`).toBeLessThanOrEqual(0.5);
  expect(Math.abs(marks.highlight - centre), "the current page's highlight").toBeLessThanOrEqual(0.5);
  // The pages: one step from entry to entry.
  const steps = marks.entries.slice(1).map((m, i) => m.y - marks.entries[i]!.y);
  for (const step of steps) expect(Math.abs(step - steps[0]!), `steps ${steps.join(", ")}`).toBeLessThanOrEqual(1);
  // The brand zone (logo, then the collapse control) and the pages are apart: each gap is more than
  // a step, with a hairline between the zones, as wide collapsed as an entry's highlight (3rem).
  const [logo, toggle, first] = marks.column;
  expect(toggle!.y - logo!.y, "logo to collapse control").toBeGreaterThan(steps[0]!);
  expect(first!.y - toggle!.y, "collapse control to the first page").toBeGreaterThan(steps[0]!);
  expect(marks.dividers.length, "a hairline under the brand and one over the footer").toBe(2);
  expect(marks.dividers[0]!.y).toBeGreaterThan(toggle!.y);
  expect(marks.dividers[0]!.y).toBeLessThan(first!.y);
  for (const d of marks.dividers) expect(Math.round(d.width)).toBe(48);
});
