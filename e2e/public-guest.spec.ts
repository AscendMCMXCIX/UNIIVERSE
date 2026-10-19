import { expect, test, type Browser, type Page } from "@playwright/test";
import { memberContext } from "./member-account";

/*
  PUBLIC / GUEST VIEW, Release A. A visitor is a browser without an account (locally: the guest
  cookie, which turns the automatic local owner off). The public team page is off until the Owner
  turns it on; it shows the lineup by role, members only by their own choice, and nothing that
  manages the team. Every members' page, API and picture stays closed to visitors whatever the
  switch says.
*/

const GUEST_COOKIE = "uniiverse_guest";
const PRIVATE_PAGES = ["/team", "/players", "/matches", "/overview", "/overview/blocks", "/overview/matches", "/overview/matchups", "/overview/accounts", "/leaderboards", "/trends", "/settings", "/admin/people", "/admin/public-access"];

async function guestPage(browser: Browser, baseURL: string, viewport?: { width: number; height: number }): Promise<Page> {
  const context = await browser.newContext(viewport ? { viewport } : {});
  await context.addCookies([{ name: GUEST_COOKIE, value: "1", url: baseURL }]);
  return context.newPage();
}

/** The Owner turns the public page on or off in Admin → Public Access. */
async function setPublic(owner: Page, on: boolean) {
  await owner.goto("/admin/public-access");
  const input = owner.locator("#public-access");
  if ((await input.isChecked()) !== on) {
    await owner.locator('label[for="public-access"]').click();
    await expect(input).toBeChecked({ checked: on });
  }
  await expect(owner.getByText(on ? "On: anyone with the link can open it." : "Off: only signed-in members can open it, as a preview.")).toBeVisible();
}

test.afterEach(async ({ page }) => {
  await setPublic(page, false);
});

test("off by default: visitors get nothing, members can preview", async ({ page, browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "one pass is enough for access rules");
  const guest = await guestPage(browser, baseURL!);
  expect((await guest.goto("/public"))?.status()).toBe(404);
  await guest.goto("/");
  await expect(guest).toHaveURL(/\/login/);
  await expect(guest.getByTestId("login-public-link")).toHaveCount(0);
  // A signed-in member sees the preview, labelled as such.
  await page.goto("/public");
  await expect(page.getByTestId("public-preview-banner")).toContainText("the public page is off");
  await expect(page.getByTestId("team-name")).toBeVisible();
  await guest.context().close();
});

test("on: the team page by role, no management controls, members' pages still closed", async ({ page, browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "the phone layout is checked below");
  await setPublic(page, true);
  const guest = await guestPage(browser, baseURL!);
  const response = await guest.goto("/");
  await expect(guest).toHaveURL(/\/public$/);
  // A private page for each visitor: never stored by a shared cache.
  expect(response?.headers()["cache-control"] ?? "").toMatch(/private|no-store/);
  await expect(guest.getByTestId("team-name")).toBeVisible();
  await expect(guest.getByTestId("lineup-cell")).toHaveCount(5);
  await expect(guest.getByTestId("team-subtitle")).toHaveText("Main lineup");
  // The demo roster has no member who chose to appear: every role is a placeholder.
  await expect(guest.locator('[data-testid^="private-member-"]')).toHaveCount(5);
  for (const id of ["edit-lineup", "open-player-detail", "lineup-suggestions"]) await expect(guest.getByTestId(id)).toHaveCount(0);
  await expect(guest.getByTestId("public-sign-in")).toBeVisible();
  await expect(guest.getByTestId("public-legal")).toContainText("isn't endorsed by Riot Games");
  // Nothing in the page links to or names members' pages, pictures or accounts.
  const html = await guest.content();
  expect(html).not.toMatch(/\/players\/[0-9a-f-]{36}|\/api\/avatars\/|\/api\/card-banners\/|#OCE|"rank":\{/);

  // Every members' page sends a visitor to sign in; members' APIs and pictures refuse them.
  for (const path of PRIVATE_PAGES) {
    await guest.goto(path);
    await expect(guest, path).toHaveURL(/\/login/);
  }
  const api = guest.context().request;
  for (const path of ["/api/avatars/00000000-0000-4000-8000-000000000000?v=1", "/api/card-banners/00000000-0000-4000-8000-000000000000?v=1"]) {
    expect((await api.get(path)).status(), path).toBe(401);
  }
  expect((await api.get("/api/public/avatars/00000000-0000-4000-8000-000000000000")).status()).toBe(404);

  // Sign in is one quiet step away, and the sign-in page leads back.
  await guest.goto("/public");
  await guest.getByTestId("public-sign-in").click();
  await expect(guest).toHaveURL(/\/login/);
  await guest.getByTestId("login-public-link").click();
  await expect(guest).toHaveURL(/\/public$/);
  await guest.context().close();
});

test("a member chooses to appear, under a public name; only they can change it", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop", "one pass is enough");
  test.setTimeout(120_000);
  await page.goto("/admin/public-access");
  const member = await memberContext(browser, page);
  await member.page.goto("/settings");
  const panel = member.page.getByTestId("public-profile-panel");
  await expect(panel).toContainText("public page is off");
  // Turning it on needs a public name; the sign-in username is flagged.
  await member.page.locator('label[for="public-profile"]').click();
  await expect(member.page.getByText("Choose a public name of at least 2 characters.")).toBeVisible();
  await expect(member.page.locator("#public-profile")).not.toBeChecked();
  await member.page.getByTestId("public-name").fill(member.username);
  await expect(panel).toContainText("This is your sign-in username");
  await member.page.getByTestId("public-name").fill("Mid Showcase");
  await member.page.locator('label[for="public-profile"]').click();
  await expect(member.page.locator("#public-profile")).toBeChecked();
  // The Owner sees the choice, by public name only, and has no control over it.
  await page.goto("/admin/public-access");
  await expect(page.getByTestId("public-members")).toContainText("Mid Showcase");
  await expect(page.getByTestId("public-members")).not.toContainText(member.username);
  await expect(page.locator("#public-profile")).toHaveCount(0);
  // Off again: gone from the list.
  await member.page.locator('label[for="public-profile"]').click();
  await expect(member.page.locator("#public-profile")).not.toBeChecked();
  await page.reload();
  await expect(page.getByTestId("public-members")).toHaveCount(0);
  await member.context.close();
});

test("the public page fits a phone and a tablet", async ({ page, browser, baseURL }, info) => {
  test.skip(info.project.name === "desktop", "desktop is covered above");
  await setPublic(page, true);
  const guest = await guestPage(browser, baseURL!, page.viewportSize() ?? undefined);
  await guest.goto("/public");
  await expect(guest.getByTestId("team-name")).toBeVisible();
  await expect(guest.getByTestId("public-sign-in")).toBeVisible();
  const overflow = await guest.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await guest.context().close();
});
