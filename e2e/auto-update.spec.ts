import { expect, test, type Browser, type Page } from "./test";
import { createMember } from "./member-account";

/*
  PAGES UPDATE THEMSELVES (components/ui/freshness-watcher.tsx). An open page asks the server for
  the version of the data it shows, and only a changed version reads the page again, as a server
  refresh: no reload, so the scroll position and an open window stay as they are. A hidden tab asks
  nothing; coming back to it (shown or focused again) asks at once, unless it asked in the last
  five seconds. Here a second browser adds a team member while the page is open.
*/

test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "runs once, on the desktop project: the same on every width"));

/** Requests the page's watcher made (the version checks). */
function versionChecks(page: Page): string[] {
  const asked: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/freshness") asked.push(r.url());
  });
  return asked;
}

/** A member added by an administrator in another browser, as a teammate would see it happen. */
async function memberAddedElsewhere(browser: Browser): Promise<string> {
  const other = await browser.newContext();
  const { username } = await createMember(await other.newPage(), "Fresh");
  await other.close();
  return username;
}

/** Coming back to a tab asks only when it last asked over five seconds ago (domain/freshness RETURN_CHECK_AFTER_MS). */
async function pastReturnPause(page: Page, since: number) {
  const left = since + 5_500 - Date.now();
  if (left > 0) await page.waitForTimeout(left);
}

test("the Players directory shows a member added elsewhere when its tab is shown again, without a reload", async ({ page, browser }) => {
  const asked = versionChecks(page);
  // A short window: the roster fits one desktop screen, and the page has to scroll for its place to be kept.
  await page.setViewportSize({ width: 1440, height: 400 });
  await page.goto("/players");
  await expect(page.getByTestId("player-card").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  const loaded = Date.now();
  await page.evaluate(() => {
    (window as unknown as { kept: boolean }).kept = true;
    window.scrollTo(0, 300);
  });

  // Hidden, the tab asks nothing, even when the window is focused.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
  const username = await memberAddedElsewhere(browser);
  await pastReturnPause(page, loaded);
  expect(asked).toEqual([]);
  await expect(page.locator(`[data-testid="player-card"][data-player-name="${username}"]`)).toHaveCount(0);

  // Shown again: one check, and the new member appears in the page as it is.
  await page.evaluate(() => {
    delete (document as unknown as { visibilityState?: string }).visibilityState;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator(`[data-testid="player-card"][data-player-name="${username}"]`)).toHaveCount(1);
  expect(asked).toHaveLength(1);
  expect(await page.evaluate(() => (window as unknown as { kept?: boolean }).kept)).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});

test("Team Overview keeps an open player window while it updates", async ({ page, browser }) => {
  const asked = versionChecks(page);
  await page.goto("/team");
  await expect(page.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
  const top = page.getByTestId("lineup-row-TOP");
  await page.waitForLoadState("networkidle");
  const loaded = Date.now();
  await top.getByTestId("open-player-detail").click();
  const win = page.getByTestId("player-detail");
  await expect(win.getByTestId("player-detail-hero")).toBeVisible();
  const name = await win.getByTestId("player-detail-hero").innerText();
  await page.evaluate(() => ((window as unknown as { kept: boolean }).kept = true));

  // Hidden meanwhile, so the page's own timed check cannot come first on a slow machine.
  await page.evaluate(() => Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }));
  await memberAddedElsewhere(browser);
  await pastReturnPause(page, loaded);
  // The window focused again: the changed version reads the page again from the server (a router refresh, not a prefetch).
  const refreshed = page.waitForResponse((r) => r.request().headers()["rsc"] === "1" && !r.request().headers()["next-router-prefetch"] && new URL(r.url()).pathname === "/team");
  await page.evaluate(() => {
    delete (document as unknown as { visibilityState?: string }).visibilityState;
    window.dispatchEvent(new Event("focus"));
  });
  await refreshed;
  await page.waitForLoadState("networkidle");
  expect(asked).toHaveLength(1);
  await expect(win.getByTestId("player-detail-hero")).toBeVisible();
  expect(await win.getByTestId("player-detail-hero").innerText()).toBe(name);
  expect(await page.evaluate(() => (window as unknown as { kept?: boolean }).kept)).toBe(true);
});
