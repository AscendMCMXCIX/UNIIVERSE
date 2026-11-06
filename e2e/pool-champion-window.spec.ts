import { expect, test } from "./test";

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
  // The art behind a row: on phones the champion's small tile, from tablets up the splash (a 48 px
  // strip at a quarter opacity needs no 1215 px image on a phone).
  await first.scrollIntoViewIfNeeded();
  await expect.poll(() => first.getByTestId("pool-splash").locator("img").evaluate((img) => (img as HTMLImageElement).currentSrc), { message: "the backdrop's chosen source" }).toContain(test.info().project.name === "phone" ? "/img/champion/tiles/" : "/img/champion/splash/");
  const win = page.getByTestId("champion-detail");
  // A click before the page is interactive does nothing: click again until the window opens.
  await expect(async () => {
    if (!(await win.isVisible())) await first.getByTestId("pool-inspect").click({ timeout: 2_000 });
    await expect(win).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(page).toHaveURL(new RegExp(`champ=${championId}.*crole=TOP|crole=TOP.*champ=${championId}`));
  await expect(page.getByTestId("champion-detail-scope")).toBeVisible();
  // The window speaks in the player's colours: its header carries the card's accent variable.
  expect(await page.getByTestId("champion-detail-header").evaluate((el) => getComputedStyle(el).getPropertyValue("--card-accent").trim())).not.toBe("");
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
  // In Edit, a drag that ends where it started: no reorder, and the click that ends it opens nothing.
  await page.getByTestId("pools-edit").click();
  // Centred first: near the window's edge a drag scrolls the page (on purpose), moving the cards.
  await items.first().evaluate((e) => e.scrollIntoView({ block: "center" }));
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
  // A keyboard user arrives once the page has settled; the first visit can still re-render the
  // page just after load, which would move focus away from a card focused that early.
  await page.waitForLoadState("networkidle");
  await inspect.focus();
  await expect(inspect).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("champion-detail")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("champion-detail")).toHaveCount(0);
  // Focus goes back to the card that opened the window (a frame after it closes); only then does
  // the keyboard user move on, so that return cannot take focus from the grip.
  await expect(inspect).toBeFocused();
  // In Edit the grip is a separate stop: Space picks the card up, Escape puts it back, and no window opens.
  await page.getByTestId("pools-edit").click();
  const grip = first.getByTestId("pool-grip");
  await grip.focus();
  await page.keyboard.press("Space");
  await expect(grip).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(grip).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("champion-detail")).toHaveCount(0);
});

test("Escape before the window's address lands closes it and keeps the page", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "once");
  const id = await topPlayer(page);
  // Hold the window's page data back (a slow connection), so Escape comes before its address is
  // in the history: closing must not step back past the player's page.
  await page.route((url) => url.searchParams.has("champ"), async (route) => {
    if (route.request().headers()["rsc"]) await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.continue().catch(() => {});
  });
  await page.goto(`/players/${id}`);
  await page.waitForLoadState("networkidle");
  const inspect = page.getByTestId("primary-pool").getByTestId("pool-item").first().getByTestId("pool-inspect");
  await inspect.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("champion-detail")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("champion-detail")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/players/${id}$`));
  // The held data arriving later reopens nothing.
  await page.waitForTimeout(3000);
  await expect(page.getByTestId("champion-detail")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/players/${id}$`));
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

test("a click that lands before the page is interactive still opens the champion", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "once");
  const id = await topPlayer(page);
  // Hold the page's scripts back, so the click reaches the server-rendered card before React does.
  await page.route(/\/_next\/static\/chunks\/.*\.js/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.continue();
  });
  await page.goto(`/players/${id}`, { waitUntil: "commit" });
  const first = page.getByTestId("primary-pool").getByTestId("pool-item").first();
  const championId = (await first.getAttribute("data-champion"))!;
  await first.getByTestId("pool-inspect").click();
  await expect(page).toHaveURL(new RegExp(`champ=${championId}`));
  await expect(page.getByTestId("champion-detail")).toBeVisible();
});
