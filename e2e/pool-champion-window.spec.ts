import { expect, test } from "@playwright/test";

/*
  Roles & champion pools open the same champion window as All Champions: a click on a pool card
  opens it (in the role of that pool), it lives in the address (a deep link opens it), Escape or
  Back closes it, and a drag reorders without opening anything. Keyboard: Tab reaches the card,
  Enter opens it; the grip keeps its own reordering keys. Touch: a tap opens it, only the grip
  drags. Demo data, in-memory only.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

async function topPlayer(page: import("@playwright/test").Page) {
  await page.goto("/team");
  return (await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!;
}

test("a pool champion opens the shared champion window, with Matchups, in that role", async ({ page }) => {
  const id = await topPlayer(page);
  await page.goto(`/players/${id}`);
  const first = page.getByTestId("primary-pool").getByTestId("pool-item").first();
  const championId = (await first.getAttribute("data-champion"))!;
  await expect(first.getByTestId("pool-splash")).toHaveCount(1);
  await first.getByTestId("pool-inspect").click();
  const win = page.getByTestId("champion-detail");
  await expect(win).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`champ=${championId}.*crole=TOP|crole=TOP.*champ=${championId}`));
  await expect(page.getByTestId("champion-detail-scope")).toBeVisible();
  // The same window as All Champions: Overview and Matchups.
  await win.getByRole("tab", { name: /Matchups/ }).click();
  await expect(page).toHaveURL(/tab=matchups/);
  await page.keyboard.press("Escape");
  await expect(win).toHaveCount(0);
  await expect(page).not.toHaveURL(/champ=/);
});

test("a deep link opens the window; a drag reorders without opening it", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "a mouse drag");
  const id = await topPlayer(page);
  await page.goto(`/players/${id}`);
  const items = page.getByTestId("primary-pool").getByTestId("pool-item");
  const championId = (await items.first().getAttribute("data-champion"))!;
  await page.goto(`/players/${id}?champ=${championId}&crole=TOP`);
  await expect(page.getByTestId("champion-detail")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("champion-detail")).toHaveCount(0);
  // A drag that ends where it started: no reorder, and the click that ends it opens nothing.
  const box = (await items.first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 10, { steps: 5 });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(page.getByTestId("champion-detail")).toHaveCount(0);
  await expect(items.first()).toHaveAttribute("data-champion", championId);
});

test("keyboard: Enter on a pool card opens the window, Escape closes it; the grip reorders instead", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "keyboard path, once");
  const id = await topPlayer(page);
  await page.goto(`/players/${id}`);
  const first = page.getByTestId("primary-pool").getByTestId("pool-item").first();
  const inspect = first.getByTestId("pool-inspect");
  await expect(inspect).toHaveAttribute("aria-haspopup", "dialog");
  await inspect.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("champion-detail")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("champion-detail")).toHaveCount(0);
  // The grip is a separate stop: Space picks the card up, Escape puts it back, and no window opens.
  const grip = first.getByTestId("pool-grip");
  await grip.focus();
  await page.keyboard.press("Space");
  await expect(grip).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(grip).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("champion-detail")).toHaveCount(0);
});

test("touch: a tap on a pool card opens the window", async ({ page }, info) => {
  test.skip(info.project.name === "desktop", "touch screens");
  const id = await topPlayer(page);
  await page.goto(`/players/${id}`);
  const first = page.getByTestId("primary-pool").getByTestId("pool-item").first();
  const championId = (await first.getAttribute("data-champion"))!;
  await first.getByTestId("pool-inspect").tap();
  await expect(page.getByTestId("champion-detail")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`champ=${championId}`));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.goBack();
  await expect(page.getByTestId("champion-detail")).toHaveCount(0);
});
