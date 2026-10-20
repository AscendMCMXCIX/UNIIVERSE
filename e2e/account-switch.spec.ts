import { expect, test, type Page } from "@playwright/test";

/*
  Several accounts in one browser. Admin creates two personal-use accounts (in-memory demo; the
  Riot check is the demo stand-in), then one browser signs in to both, each with its own password,
  switches between them from the account menu, sees a second tab follow the switch, removes one
  in Settings and signs out. Sessions stay in HTTP-only cookies; nothing is in browser storage.
*/

test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "runs once, on the desktop project"));

const unique = (base: string) => `${base}${Date.now().toString(36).slice(-5)}`;

async function createPersonalAccount(page: Page, username: string): Promise<string> {
  const form = page.getByTestId("add-player-form");
  await form.getByLabel("Username").fill(username);
  await form.getByLabel("Riot ID").fill(`${username}#OCE`);
  await form.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByTestId("riot-verified")).toBeVisible();
  await page.getByTestId("new-access-personal").check();
  await page.getByTestId("create-account").click();
  await expect(page.getByTestId("created-account")).toContainText(username);
  return (await page.getByTestId("temporary-password-value").innerText()).trim();
}

/** "Add another account", then the first-time setup a new account asks for. */
async function addAccount(page: Page, username: string, temporary: string) {
  await page.goto("/login?add=1");
  await expect(page.getByRole("heading", { name: "Add an account" })).toBeVisible();
  const form = page.getByTestId("login-form");
  await form.getByLabel("Username").fill(username);
  await form.getByLabel("Password").fill(temporary);
  await form.getByRole("button", { name: "Add account" }).click();
  const pw = page.getByTestId("set-password-form");
  await expect(pw).toBeVisible();
  await pw.getByLabel("New password").fill("Mine#2026-team");
  await pw.getByLabel("Confirm password").fill("Mine#2026-team");
  await pw.getByRole("button", { name: "Save my password" }).click();
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
}

test("one browser signs in to two accounts and switches between them safely", async ({ browser, page: admin }) => {
  await admin.goto("/admin/people");
  const first = unique("Ana");
  const second = unique("Ben");
  const firstPassword = await createPersonalAccount(admin, first);
  const secondPassword = await createPersonalAccount(admin, second);

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await addAccount(page, first, firstPassword);
  await addAccount(page, second, secondPassword);

  // The account menu: the account in use, the other one a click away.
  const aside = page.locator("aside");
  await aside.getByTestId("account-menu-button").click();
  const menu = page.getByTestId("account-menu");
  await expect(menu.getByTestId("switch-account")).toHaveText([new RegExp(first)]);
  await expect(menu.getByRole("menuitem", { name: `Sign out of ${second}` })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Sign out of all accounts" })).toBeVisible();
  await page.keyboard.press("Escape");

  // A second tab of the same browser follows a switch made in the first.
  const other = await context.newPage();
  await other.goto("/overview");
  await expect(other.locator("aside").getByTestId("account-current-name")).toHaveText(second);

  await aside.getByTestId("account-menu-button").click();
  await menu.getByTestId("switch-account").click();
  await expect(aside.getByTestId("account-current-name")).toHaveText(first);
  await expect(other.locator("aside").getByTestId("account-current-name")).toHaveText(first);

  // Sessions live in HTTP-only cookies; only the account fingerprint is readable, and browser storage holds no session.
  const cookies = await context.cookies();
  for (const name of ["uniiverse_session", "uniiverse_accounts"]) expect(cookies.find((c) => c.name === name)?.httpOnly).toBe(true);
  expect(cookies.find((c) => c.name === "uniiverse_who")?.httpOnly).toBe(false);
  const secrets = cookies.filter((c) => c.httpOnly).map((c) => c.value);
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }) + document.cookie);
  for (const s of secrets) for (const part of s.split(",")) expect(stored).not.toContain(part);

  // Settings: remove the other account (it is signed out of this browser).
  await page.goto("/settings");
  const panel = page.getByTestId("browser-accounts");
  await expect(panel.getByTestId("browser-account")).toHaveCount(1);
  await panel.getByTestId("browser-account-remove").click();
  await expect(panel.getByTestId("browser-account")).toHaveCount(0);
  await aside.getByTestId("account-menu-button").click();
  await expect(menu.getByTestId("switch-account")).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "Sign out", exact: true })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  // Signed out of the last account (local development then falls back to the automatic local owner).
  await expect(page).not.toHaveURL(/settings/);
  await expect(aside.getByTestId("account-current-name")).not.toHaveText(first);
  await context.close();
});
