import { expect, test } from "./test";

/*
  Phone refinements (in-memory demo): Matches keeps its caveats behind the header's (i), small text
  links get a finger-sized hit area on touch screens,
  and the main pages never scroll sideways at the narrowest common width (360).
*/

test.beforeEach(async ({ context, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "phones only");
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

test("Matches keeps its caveats in the header's (i), one tap away, without a paragraph above the games", async ({ page }) => {
  for (const [path, label] of [
    ["/matches", "How games played together are found"],
    ["/matches?view=encounters", "How encounters are counted"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByTestId("together-note")).toHaveCount(0);
    await expect(page.getByTestId("encounters-note")).toHaveCount(0);
    const tip = page.getByTestId("matches-summary").getByRole("button", { name: label });
    await expect(tip).toBeVisible();
    await expect(tip).toHaveAccessibleDescription(/Season 2026/);
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
  for (const path of ["/team", "/players", "/leaderboards", "/matches", "/matches?view=encounters", `/players/${mid}`, `/players/${mid}/champions`, `/players/${mid}/matches`, "/settings"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(1);
  }
});
