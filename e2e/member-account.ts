import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

/*
  A real team member account for e2e checks that need a player profile (the in-memory demo's local
  owner has none): created by an admin in Admin → People, signed in on its own browser context, its
  first-time setup done (Mid, the first champion offered as its pool).
*/

export const view = (context: BrowserContext, baseURL: string, as: "admin" | "player") => context.addCookies([{ name: "uniiverse_view", value: as, url: baseURL }]);
export const unique = (base: string) => `${base}${Date.now().toString(36).slice(-5)}`;

/** Creates a team member account in Admin → People (as the admin page); returns its username and temporary password. */
export async function createMember(admin: Page, base = "Viewer"): Promise<{ username: string; temporary: string }> {
  const username = unique(base);
  if (!admin.url().startsWith("http")) await admin.goto("/");
  await view(admin.context(), admin.url().split("/").slice(0, 3).join("/"), "admin");
  await admin.goto("/admin/people");
  const form = admin.getByTestId("add-player-form");
  await form.getByLabel("Username").fill(username);
  await form.getByLabel("Riot ID").fill(`${username}#OCE`);
  await form.getByRole("button", { name: "Verify" }).click();
  await expect(admin.getByTestId("riot-verified")).toBeVisible();
  await admin.getByTestId("new-access-team").check();
  await admin.getByTestId("create-account").click();
  await expect(admin.getByTestId("created-account")).toContainText(username);
  const temporary = (await admin.getByTestId("temporary-password-value").innerText()).trim();
  return { username, temporary };
}

/** Signs in with the temporary password and chooses the permanent one; the setup form opens next. */
export async function choosePassword(page: Page, username: string, temporary: string, password = "Mine#2026-team") {
  await signIn(page, username, temporary);
  const pw = page.getByTestId("set-password-form");
  await expect(pw).toBeVisible();
  await pw.getByLabel("New password").fill(password);
  await pw.getByLabel("Confirm password").fill(password);
  await pw.getByRole("button", { name: "Save my password" }).click();
}

/** A team member account, signed in on its own browser context (first-time setup included). */
export async function memberContext(browser: Browser, admin: Page, viewport = { width: 1440, height: 900 }): Promise<{ context: BrowserContext; page: Page; username: string }> {
  const { username, temporary } = await createMember(admin);
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await choosePassword(page, username, temporary);
  const setup = page.getByTestId("setup-form");
  await setup.getByTestId("setup-continue").click();
  await setup.getByRole("radiogroup", { name: "Primary role" }).getByRole("button", { name: "Mid" }).click();
  await setup.getByTestId("primary-pool-toggle").click();
  await setup.getByTestId("primary-pool-results").getByRole("option").first().click();
  await page.keyboard.press("Escape");
  await setup.getByRole("button", { name: "Finish setup" }).click();
  // The optional Personalise step comes next; skip it.
  await page.getByTestId("personalise-done").click();
  await expect(page.locator("aside").getByTestId("account-current-name")).toHaveText(username);
  return { context, page, username };
}

export async function signIn(page: Page, username: string, password: string) {
  await page.goto("/login?add=1");
  const form = page.getByTestId("login-form");
  await form.getByLabel("Username").fill(username);
  await form.getByLabel("Password").fill(password);
  await form.getByRole("button", { name: "Add account" }).click();
}
