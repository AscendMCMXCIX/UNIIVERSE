import { expect, test, type Browser, type Page } from "./test";

/*
  The in-memory demo's viewers (server/auth/demo-viewer.ts; refused on every other configuration,
  unit-tested there): a member with a player profile of their own, and the demo's two members in
  their first sign-in. They serve the "your" tests (PLAN §1.12: one's own page says "you" and
  "your", a teammate's "they", "their" or the champion's name) and the first sign-in at /welcome.
  Viewport-independent: desktop only.
*/

test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "viewport-independent: desktop only"));

async function asViewer(browser: Browser, baseURL: string, viewer: "member" | "newcomer" | "halfway"): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([{ name: "uniiverse_demo_viewer", value: viewer, url: baseURL }]);
  return ctx.newPage();
}

async function firstPreviewFoot(page: Page) {
  const row = page.getByTestId("top-champion").first();
  await row.getByTestId("open-champion").click();
  const foot = page.getByTestId("champion-preview-foot");
  await expect(foot).toBeVisible();
  return foot;
}

test("a member's own Champions say \"your\"; the same profile seen by a teammate says \"their\"", async ({ browser, baseURL, page }) => {
  const own = await asViewer(browser, baseURL!, "member");
  await own.goto("/overview/champions");
  await expect(await firstPreviewFoot(own)).toContainText("Lane opponent: the enemy Riot placed in your position.");
  await own.context().close();

  // The demo's usual viewer (the Owner, without a player profile) on the same player's profile.
  await page.goto("/players");
  const href = await page.locator("main a[data-testid='player-card']", { hasText: "Demo ADC" }).first().getAttribute("href");
  await page.goto(`${new URL(href!, "http://x").pathname}/champions`);
  await expect(await firstPreviewFoot(page)).toContainText("Lane opponent: the enemy Riot placed in their position.");
});

test("the member viewer is a Standard Player: My Profile is theirs, Admin is closed to them", async ({ browser, baseURL }) => {
  const page = await asViewer(browser, baseURL!, "member");
  await page.goto("/overview");
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByTestId("profile-header")).toContainText("Demo ADC");
  // Admin Mode is not theirs: /admin sends them back to Player Mode.
  await page.goto("/admin");
  await expect(page).not.toHaveURL(/\/admin/);
  await expect(page.getByTestId("mode-switch")).toHaveCount(0);
  // Finished setting up: /welcome sends them on.
  await page.goto("/welcome");
  await expect(page).not.toHaveURL(/\/welcome/);
  await page.context().close();
});

test("the first sign-in through the demo's members: a temporary password first, then the profile", async ({ browser, baseURL }) => {
  const newcomer = await asViewer(browser, baseURL!, "newcomer");
  await newcomer.goto("/team");
  await expect(newcomer).toHaveURL(/\/welcome/);
  await expect(newcomer.getByRole("heading", { level: 1 })).toHaveText("Choose your password");
  await newcomer.context().close();

  const halfway = await asViewer(browser, baseURL!, "halfway");
  await halfway.goto("/welcome");
  await expect(halfway.getByRole("heading", { level: 1 })).toHaveText("Set up your player profile");
  await halfway.context().close();
});
