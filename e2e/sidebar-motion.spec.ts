import { expect, test, type Page } from "@playwright/test";

/*
  The desktop sidebar's collapse and expand. The visible edge clips everything in every frame, so
  no highlight or label stands out over the page while it moves (before, the current page's
  highlight showed as a band across the page for 220 ms). The control sits under the logo, in the
  same place open or collapsed, works from the keyboard, and rapid toggling settles on the last
  choice. Frames are checked by freezing the running transitions (Web Animations API).
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

test("with reduced motion the sidebar switches at once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/team");
  await page.getByTestId("sidebar-toggle").click();
  await page.mouse.move(900, 600);
  // No frame in between: the edge is at the rail straight away.
  const edge = await page.evaluate(() => document.querySelector('[data-testid="sidebar-window"]')!.getBoundingClientRect().right);
  expect(Math.round(edge)).toBe(72);
});
