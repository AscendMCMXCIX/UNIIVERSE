import { test, expect, type Page } from "./test";

/*
  The desktop frame holds still (S2c; docs/DESIGN_SYSTEM.md §7, "One frame, one place for
  everything"): the profile's tabs keep one place on every section, every page starts at one x, the
  client navigation into Players and All Champions shifts nothing, and no running text or name is
  under 12px on a desktop. The desktop project only: it sets each window itself. (Team's tabs and
  first card on one edge from 1920px: e2e/navigation-reach.spec.ts.)
*/
test.skip(({ viewport }) => viewport?.width !== 1440, "desktop windows, set by the test itself");

async function teammate(page: Page) {
  await page.goto("/players");
  return (await page.locator("main a[href^='/players/']").first().getAttribute("href"))!;
}

async function sidebar(page: Page, baseURL: string, state: "expanded" | "collapsed") {
  await page.context().addCookies([{ name: "uniiverse_sidebar", value: state, url: baseURL }]);
}

const settled = async (page: Page) => {
  await expect(page.locator("main h1, main h2").first()).toBeVisible();
  await expect(page.locator("main#content > [data-testid=page-frame] > [role=status]")).toHaveCount(0);
};

test("the profile's tabs keep one place on all four sections, the sidebar open or folded (UD.PO1)", async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const profile = await teammate(page);
  for (const [width, height, state] of [[1280, 800, "collapsed"], [2560, 1440, "expanded"]] as const) {
    await sidebar(page, baseURL!, state);
    await page.setViewportSize({ width, height });
    const ys: number[] = [];
    for (const path of [profile, `${profile}/champions`, `${profile}/matches`, `${profile}/accounts`]) {
      await page.goto(path);
      await settled(page);
      ys.push((await page.getByTestId("profile-tabs").boundingBox())!.y);
    }
    expect(Math.max(...ys) - Math.min(...ys), `${width} (sidebar ${state}): the tabs at ${ys.join(", ")}`).toBeLessThanOrEqual(1);
  }
});

test("every destination starts at one x: the shared frame (UD.X3, S2)", async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const profile = await teammate(page);
  for (const [width, height, state] of [[1920, 1080, "collapsed"], [2560, 1440, "expanded"]] as const) {
    await sidebar(page, baseURL!, state);
    await page.setViewportSize({ width, height });
    const starts: Record<string, number> = {};
    for (const path of ["/players", profile, "/resources", "/settings", "/admin"]) {
      await page.goto(path);
      await settled(page);
      // The page's title, or for a profile its card (the name follows the picture).
      const title = path === profile ? page.getByTestId("profile-header") : page.locator("main h1").first();
      starts[path === profile ? "profile" : path] = Math.round((await title.boundingBox())!.x * 10) / 10;
    }
    const xs = Object.values(starts);
    expect(Math.max(...xs) - Math.min(...xs), `${width}: ${JSON.stringify(starts)}`).toBeLessThanOrEqual(1);
  }
});

test("opening Players and All Champions from the app shifts the layout by less than 0.02 (UD.P3, X4)", async ({ page }) => {
  const profile = await teammate(page);
  for (const [from, link, to] of [["/team", "a[href='/players']", /\/players$/], [profile, `a[href='${profile}/champions']`, /\/champions$/]] as const) {
    await page.goto(from);
    await settled(page);
    await page.evaluate(() => {
      (window as unknown as { shift: number }).shift = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) (window as unknown as { shift: number }).shift += (e as unknown as { value: number }).value;
      }).observe({ type: "layout-shift", buffered: false });
    });
    await page.locator(`${link}:visible`).first().click();
    await expect(page).toHaveURL(to);
    await settled(page);
    await page.waitForTimeout(500);
    const shift = await page.evaluate(() => (window as unknown as { shift: number }).shift);
    expect(shift, `into ${to}`).toBeLessThan(0.02);
  }
});

test("no running text or name under 12px on a desktop, outside the game cards S6b rebuilds (UD.X5)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const profile = await teammate(page);
  for (const path of ["/team", `${profile}/champions`, `${profile}/matches`, "/matches", profile]) {
    await page.goto(path);
    await settled(page);
    const small = await page.evaluate(() => {
      const found: string[] = [];
      const walk = document.createTreeWalker(document.querySelector("main")!, NodeFilter.SHOW_TEXT);
      while (walk.nextNode()) {
        const el = walk.currentNode.parentElement!;
        if (!walk.currentNode.textContent!.trim() || !el.getBoundingClientRect().width) continue;
        const s = getComputedStyle(el);
        // Uppercase labels may stay small; letters in a decorative tile (the ⓘ glyph, initials) are
        // hidden from screen readers; the game cards keep 11px until S6b (type-floor-later).
        if (parseFloat(s.fontSize) >= 11.95 || s.textTransform === "uppercase" || el.closest("[aria-hidden=true], .sr-only, .type-floor-later")) continue;
        found.push(`${el.closest("[data-testid]")?.getAttribute("data-testid") ?? el.tagName} ${s.fontSize}: ${walk.currentNode.textContent!.trim().slice(0, 20)}`);
      }
      return found;
    });
    expect(small, path.replace(profile, "a profile")).toEqual([]);
  }
});
