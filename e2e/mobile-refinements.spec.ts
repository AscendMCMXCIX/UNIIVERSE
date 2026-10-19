import { expect, test } from "@playwright/test";

/*
  Phone refinements (in-memory demo): explanatory notes read as one paragraph (their icon on the
  first line, not alone above it), small text links get a finger-sized hit area on touch screens,
  and the main pages never scroll sideways at the narrowest common width (360).
*/

test.beforeEach(async ({ context, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "phones only");
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

test("notes read as one paragraph, with the icon on the first line", async ({ page }) => {
  for (const [path, id] of [
    ["/matches", "together-note"],
    ["/matches?view=encounters", "encounters-note"],
  ] as const) {
    await page.goto(path);
    const note = page.getByTestId(id);
    await expect(note).toBeVisible();
    const [p, icon] = await Promise.all([note.boundingBox(), note.locator("svg").first().boundingBox()]);
    expect(icon!.y - p!.y, `${id}: the icon starts the first line`).toBeLessThanOrEqual(6);
    expect(icon!.x - p!.x).toBeLessThanOrEqual(2);
  }
});

test("small text links have a 44px hit area on touch screens", async ({ page }) => {
  await page.goto("/leaderboards");
  const link = page.getByTestId("highlights-all");
  await expect(link).toBeVisible();
  expect(await link.evaluate((e) => getComputedStyle(e, "::after").height)).toBe("44px");
  // Tapping just above the text still follows the link.
  const box = (await link.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y - 8);
  await expect(page).toHaveURL(/highlights=0|metric=/);
});

test("the main pages fit 360 px without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/team");
  const mid = (await page.getByTestId("lineup-row-MID").getAttribute("data-player-id"))!;
  for (const path of ["/team", "/players", "/leaderboards", "/matches", "/matches?view=encounters", `/players/${mid}`, `/players/${mid}/champions`, `/players/${mid}/matches`, "/trends/solo", "/trends/pro", "/settings"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(1);
  }
});
