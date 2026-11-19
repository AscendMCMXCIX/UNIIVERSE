import { expect, test, type Locator, type Page } from "./test";

/*
  All Champions' preview on the demo roster (synthetic demo games with lane opponents and timeline
  frames, in-memory only). On a wide list it unfolds inside the list's card over the columns after
  Win rate: Champion, Games and Win rate never move, the page never scrolls, rows keep their height.
  Phones and tablets get a sheet. The address holds it: the first open pushes one entry, switching
  replaces it, so Back always closes. Its content: identity, games and win rate, then the record
  against each lane opponent (a win rate only from 3 games, the games beside it), an opponent
  unfolding into its games and the one link to Matchup Intel, and the foot line. Old champion-window
  addresses (Matchups, the Overview's pools) land here.
*/

async function demoTop(page: Page) {
  await page.goto("/players");
  const href = await page.locator("main a[data-testid='player-card']", { hasText: "Demo Top" }).first().getAttribute("href");
  return new URL(href!, "http://x").pathname;
}

/** Opens a row's preview, clicking again until the page is interactive (a click before hydration does nothing). */
async function openRow(page: Page, row: Locator) {
  const content = page.getByTestId("champion-preview-content");
  const champion = await row.getAttribute("data-champion");
  await expect(async () => {
    const shown = (await content.count()) ? await content.getAttribute("data-champion") : null;
    if (shown !== champion) await row.getByTestId("open-champion").click({ timeout: 2_000 });
    await expect(content).toHaveAttribute("data-champion", champion!, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

const columns = (page: Page) => page.getByTestId("all-champions-header").evaluate((el) => ["champion", "games", "win"].map((k) => Math.round(el.querySelector(`[data-testid=sort-${k}]`)!.getBoundingClientRect().x)));

test("desktop: the preview unfolds in the list's card; nothing moves; click, ↑/↓ and Back", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the in-card preview is for a wide list with a mouse");
  const profile = await demoTop(page);
  await page.goto(`${profile}/champions`);
  const rows = page.getByTestId("top-champion");
  await expect(rows.nth(2)).toBeVisible();
  const before = await columns(page);
  const heights = await rows.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  const entries = await page.evaluate(() => history.length);
  // Actions answer light: every reply of the preview's server actions is small.
  const replies: number[] = [];
  page.on("response", async (r) => {
    if (r.request().method() === "POST" && r.request().headers()["next-action"]) replies.push((await r.body().catch(() => Buffer.alloc(0))).length);
  });
  await openRow(page, rows.nth(0));
  const preview = page.getByTestId("champion-preview");
  // Beside the list, not a window over it.
  await expect(preview).toHaveJSProperty("tagName", "ASIDE");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  expect(await columns(page)).toEqual(before);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  expect(await rows.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))).toEqual(heights);
  // The columns after Win rate fold away under it (hidden, their widths kept).
  await expect(page.getByTestId("sort-kda")).toBeHidden();
  await expect(rows.nth(0)).toHaveAttribute("data-selected", "true");
  await expect(page.getByTestId("champion-preview-foot")).toContainText("Lane opponent: the enemy Riot placed in");
  expect(await page.evaluate(() => history.length)).toBe(entries + 1);
  // Another row switches it; ↑/↓ move it; the address is replaced, never pushed.
  await rows.nth(1).getByTestId("open-champion").click();
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", (await rows.nth(1).getAttribute("data-champion"))!);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", (await rows.nth(2).getAttribute("data-champion"))!);
  await expect(rows.nth(2).getByTestId("open-champion")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", (await rows.nth(1).getAttribute("data-champion"))!);
  expect(await page.evaluate(() => history.length)).toBe(entries + 1);
  expect(await columns(page)).toEqual(before);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  expect(Math.max(...replies)).toBeLessThanOrEqual(5_000);
  // At most 650px tall folded, with no inner scroll.
  const box = await preview.evaluate((el) => ({ h: el.getBoundingClientRect().height, inner: el.scrollHeight > el.clientHeight + 1 }));
  expect(box.h).toBeLessThanOrEqual(650);
  expect(box.inner).toBe(false);
  // Back closes it after the switches.
  await page.goBack();
  await expect(preview).toHaveCount(0);
  await expect(page).not.toHaveURL(/champion=/);
  await expect(page.getByTestId("sort-kda")).toBeVisible();
  // Escape closes it too, and focus returns to its row.
  await openRow(page, rows.nth(0));
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
  await expect(rows.nth(0).getByTestId("open-champion")).toBeFocused();
  await expect(page).not.toHaveURL(/champion=/);
});

test("the content: opponents from 3 games with their games, one unfolding into its games and Matchup Intel", async ({ page }) => {
  const profile = await demoTop(page);
  await page.goto(`${profile}/champions`);
  const row = page.getByTestId("top-champion").first();
  await openRow(page, row);
  const content = page.getByTestId("champion-preview-content");
  await expect(content.getByTestId("champion-preview-figures")).toContainText(/\d+ games? · \d+W \d+L/);
  const opponents = content.getByTestId("champion-preview-opponent");
  await expect(opponents.first()).toBeVisible();
  // A win rate only from 3 games, each with its games beside it.
  for (const o of await opponents.evaluateAll((els) => els.map((e) => ({ games: Number((e as HTMLElement).dataset.games), text: e.textContent ?? "" })))) {
    expect(o.text).toMatch(/\d+ games?/);
    if (o.games < 3) expect(o.text).not.toMatch(/%/);
  }
  const first = opponents.first();
  const vs = (await first.getAttribute("data-champion"))!;
  await first.getByRole("button").first().click();
  await expect(page).toHaveURL(new RegExp(`vs=${vs}`));
  await expect(content.getByTestId("champion-preview-game").first()).toBeVisible();
  await expect(content.getByTestId("champion-preview-intel")).toHaveAttribute("href", new RegExp(`/resources/matchups\\?champion=${await row.getAttribute("data-champion")}&vs=${vs}`));
});

test("old addresses land on the preview: Matchups, a deep link with an opponent, the Overview's pools", async ({ page, context, baseURL }) => {
  const profile = await demoTop(page);
  await page.goto(`${profile}/matchups?mode=solo`);
  await expect(page).toHaveURL(/\/champions\?.*champion=/);
  await expect(page).toHaveURL(/mode=solo/);
  await expect(page.getByTestId("champion-preview-content")).toBeVisible();
  // A deep link with an opponent renders it unfolded.
  const url = new URL(page.url());
  const champion = url.searchParams.get("champion")!;
  const vs = await page.getByTestId("champion-preview-opponent").first().getAttribute("data-champion");
  await page.goto(`${profile}/champions?champion=${champion}&tab=matchups&vs=${vs}`);
  await expect(page.getByTestId("champion-preview-pairing")).toBeVisible();
  // The Overview's old window key opens All Champions' preview.
  await page.goto(`${profile}?champ=${champion}&crole=TOP`);
  await expect(page).toHaveURL(new RegExp(`/champions\\?.*champion=${champion}`));
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", champion);
  // A pool card is a link to All Champions with that champion's preview open, in the pool's role.
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  await page.goto(profile);
  const card = page.getByTestId("primary-pool").getByTestId("pool-item").first();
  const id = (await card.getAttribute("data-champion"))!;
  await expect(async () => {
    if (!/\/champions\?/.test(page.url())) await card.getByTestId("pool-inspect").click({ timeout: 2_000 });
    await expect(page).toHaveURL(new RegExp(`/champions\\?.*champion=${id}.*crole=TOP`), { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", id);
});

test("phones and tablets: a sheet with ‹ ›; Back closes it and the list keeps its place", async ({ page }, info) => {
  test.skip(info.project.name === "desktop", "the sheet is for phones and tablets");
  const profile = await demoTop(page);
  await page.goto(`${profile}/champions`);
  const rows = page.getByTestId("top-champion");
  await expect(rows.nth(1)).toBeVisible();
  if (info.project.name === "phone") {
    // 64px rows at most: the name over the role, the win rate over the games.
    for (const h of await rows.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(h).toBeLessThanOrEqual(64);
  }
  const y = await page.evaluate(() => scrollY);
  await openRow(page, rows.nth(0));
  const sheet = page.locator("dialog[open][data-testid=champion-preview]");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("champion-preview-opponents")).toBeInViewport();
  await sheet.getByTestId("champion-preview-next").click();
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", (await rows.nth(1).getAttribute("data-champion"))!);
  await page.goBack();
  await expect(sheet).toHaveCount(0);
  await expect(page).not.toHaveURL(/champion=/);
  expect(await page.evaluate(() => scrollY)).toBe(y);
  // ✕ closes it too.
  await openRow(page, rows.nth(0));
  await sheet.getByTestId("champion-preview-close").click();
  await expect(sheet).toHaveCount(0);
});
