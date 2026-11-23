import { test, expect, type Page } from "./test";

/*
  The desktop frame holds still (S2c; docs/DESIGN_SYSTEM.md §7, "One frame, one place for
  everything"): the profile's tabs keep one place on every section, every page is centred beside the sidebar, the
  client navigation into Players and All Champions shifts nothing, and no running text or name is
  under 12px on a desktop. The desktop project only: it sets each window itself. (Team's tabs and
  first card on one edge from 1920px: e2e/navigation-reach.spec.ts.)
*/
test.skip(({ viewport }) => viewport?.width !== 1440, "desktop windows, set by the test itself");

async function teammate(page: Page) {
  // The lineup's Mid: a teammate with games, whatever members other tests have added.
  await page.goto("/team");
  return `/players/${(await page.getByTestId("lineup-row-MID").getAttribute("data-player-id"))!}`;
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

/*
  Until 23 Nov 2026 every destination started at one x (UD.X3): a page narrower than the frame was
  pinned to its left edge, so with the sidebar folded on a wide window an 80rem profile sat against
  the sidebar with all the spare room on its right (351px of it at 1920 × 1080). The owner's review
  asked for each page centred in the room the window leaves beside the sidebar, open or folded:
  the rule this test now holds. Pages of one width still share one x.
*/
test("every page is centred in the room beside the sidebar, open or folded, and pages of one width share one x (the shared frame, 23 Nov 2026)", async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  const profile = await teammate(page);
  for (const [width, height, state] of [[1440, 900, "collapsed"], [1920, 1080, "collapsed"], [1920, 1080, "expanded"], [2560, 1440, "collapsed"], [2560, 1440, "expanded"]] as const) {
    await sidebar(page, baseURL!, state);
    await page.setViewportSize({ width, height });
    const starts: Record<string, number> = {};
    for (const path of ["/players", profile, `${profile}/champions`, `${profile}/matches`, "/resources", "/settings", "/team", "/leaderboards", "/admin"]) {
      await page.goto(path);
      await settled(page);
      const at = await page.evaluate(() => {
        const main = document.querySelector<HTMLElement>("main#content")!;
        const style = getComputedStyle(main);
        const box = main.getBoundingClientRect();
        // The page's column: the frame's first element that is drawn.
        let column = document.querySelector("main#content > [data-testid=page-frame]")!.firstElementChild;
        while (column && column.getBoundingClientRect().width === 0) column = column.nextElementSibling;
        const r = column!.getBoundingClientRect();
        return { left: r.left - (box.left + parseFloat(style.paddingLeft)), right: box.right - parseFloat(style.paddingRight) - r.right, x: r.left };
      });
      const name = path.replace(profile, "a profile");
      expect(Math.abs(at.left - at.right), `${name} at ${width} × ${height} (sidebar ${state}): ${Math.round(at.left)}px of room on its left, ${Math.round(at.right)}px on its right`).toBeLessThanOrEqual(1);
      expect(at.left, `${name}: inside the room`).toBeGreaterThanOrEqual(-1);
      starts[name] = Math.round(at.x * 10) / 10;
    }
    // The 80rem pages (a profile's sections, Resources, Admin) start at one x, as Team's 100rem sections do.
    for (const set of [["a profile", "a profile/champions", "a profile/matches", "/resources", "/admin"], ["/players", "/team", "/leaderboards"]]) {
      const xs = set.map((p) => starts[p]!);
      expect(Math.max(...xs) - Math.min(...xs), `${width} (sidebar ${state}): ${JSON.stringify(starts)}`).toBeLessThanOrEqual(1);
    }
  }
});

test("opening Players, All Champions and Riot Accounts from the app shifts the layout by less than 0.02 (UD.P3, X4)", async ({ page }) => {
  const profile = await teammate(page);
  // Riot Accounts from Match History: its skeleton is in its own shape (AccountsSkeleton) since 20 Nov 2026.
  for (const [from, link, to] of [["/team", "a[href='/players']", /\/players$/], [profile, `a[href='${profile}/champions']`, /\/champions$/], [`${profile}/matches`, `a[href='${profile}/accounts']`, /\/accounts$/]] as const) {
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

test("no running text or name under 12px on a desktop, the game cards included (UD.X5)", async ({ page }) => {
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
        // hidden from screen readers. The game cards took the floor in Release 11.
        if (parseFloat(s.fontSize) >= 11.95 || s.textTransform === "uppercase" || el.closest("[aria-hidden=true], .sr-only")) continue;
        found.push(`${el.closest("[data-testid]")?.getAttribute("data-testid") ?? el.tagName} ${s.fontSize}: ${walk.currentNode.textContent!.trim().slice(0, 20)}`);
      }
      return found;
    });
    expect(small, path.replace(profile, "a profile")).toEqual([]);
  }
});
