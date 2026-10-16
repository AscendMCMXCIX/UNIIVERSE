import { expect, test, type Browser, type Page } from "@playwright/test";

/*
  A player's card identity (artwork, accent) must look the same everywhere, for every viewer,
  without waiting. The case that used to fail: a teammate who had already opened a profile came
  back to it after the player changed their card, and the header still showed the old artwork
  (Next.js reuses a visited profile's layout; the header now follows each freshly served tab).
  Each viewer is its own browser context, as two people on two computers are.
*/

test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "runs once, on the desktop project"));

async function viewer(browser: Browser, baseURL: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL }]);
  return context.newPage();
}

const headerArt = (page: Page) => page.getByTestId("profile-header").getAttribute("data-art-champion");

/** Opens the Studio's Artwork step (champion and skin). */
async function openArtworkPicker(page: Page) {
  await page.getByTestId("studio-step-artwork").click();
  await expect(page.getByRole("dialog").locator("button[data-champion]").first()).toBeVisible();
}

test("a changed card shows on Team, Players and the profile for someone who had the profile open before", async ({ browser, baseURL }) => {
  const watcher = await viewer(browser, baseURL!);
  const editor = await viewer(browser, baseURL!);

  // The watcher opens a teammate's profile, then goes back to the directory.
  await watcher.goto("/players");
  const card = watcher.locator("main a[data-testid='player-card']").nth(2);
  const href = (await card.getAttribute("href"))!;
  await card.click();
  await watcher.waitForURL((u) => u.pathname === href);
  await expect(watcher.getByTestId("profile-header")).toBeVisible();
  const before = await headerArt(watcher);
  await watcher.goto("/players");

  // Someone changes that player's card (another browser).
  await editor.goto(href);
  await editor.getByTestId("customise-card").click();
  const dialog = editor.getByRole("dialog");
  await openArtworkPicker(editor);
  const picked = await dialog.locator("button[data-champion]").evaluateAll((els, cur) => els.map((e) => e.getAttribute("data-champion")).find((id) => id && id !== cur)!, before);
  await dialog.locator(`button[data-champion='${picked}']`).first().click();
  await editor.getByTestId("save-card-style").click();
  await expect(dialog).toBeHidden();
  await expect(editor.getByTestId("profile-header")).toHaveAttribute("data-art-champion", picked);

  // The watcher sees it on the directory card and on the profile, without reloading.
  await watcher.locator(`main a[href='${href}']`).first().click();
  await watcher.waitForURL((u) => u.pathname === href);
  await expect(watcher.getByTestId("profile-header")).toHaveAttribute("data-art-champion", picked);

  // And on Team, when that player is in the lineup.
  await watcher.goto("/team");
  const teamCard = watcher.locator(`[data-player-id='${href.split("/").pop()}']`);
  if (await teamCard.count()) await expect(teamCard.locator("[data-art-layer]").first()).toHaveAttribute("data-art", new RegExp(`^${picked}:`));

  // A second change right away: the newest one wins everywhere.
  await editor.getByTestId("customise-card").click();
  await openArtworkPicker(editor);
  const again = await dialog.locator("button[data-champion]").evaluateAll((els, cur) => els.map((e) => e.getAttribute("data-champion")).find((id) => id && id !== cur)!, picked);
  await dialog.locator(`button[data-champion='${again}']`).first().click();
  await editor.getByTestId("save-card-style").click();
  await expect(editor.getByTestId("profile-header")).toHaveAttribute("data-art-champion", again);
  await watcher.goto("/players");
  await watcher.locator(`main a[href='${href}']`).first().click();
  await watcher.waitForURL((u) => u.pathname === href);
  await expect(watcher.getByTestId("profile-header")).toHaveAttribute("data-art-champion", again);

  await watcher.context().close();
  await editor.context().close();
});
