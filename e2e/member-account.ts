import { expect, type Browser, type BrowserContext, type BrowserContextOptions, type Locator, type Page } from "@playwright/test";
import { pick } from "./select";

/*
  A real team member account for e2e checks that need a player profile (the in-memory demo's local
  owner has none): created by an administrator in Admin Mode → Users & Permissions, signed in on its own browser context, its
  first-time setup done (Mid, the first champion offered as its pool).
*/

export const view = (context: BrowserContext, baseURL: string, as: "admin" | "player") => context.addCookies([{ name: "uniiverse_view", value: as, url: baseURL }]);
export const unique = (base: string) => `${base}${Date.now().toString(36).slice(-5)}`;

/** Creates a team member account in Users & Permissions (as the admin page); returns its username and temporary password. */
export async function createMember(admin: Page, base = "Viewer"): Promise<{ username: string; temporary: string }> {
  const username = unique(base);
  if (!admin.url().startsWith("http")) await admin.goto("/");
  await view(admin.context(), admin.url().split("/").slice(0, 3).join("/"), "admin");
  await admin.goto("/admin/people");
  // Add account is a header button that opens its sheet (pressed until the page has hydrated).
  await expect(async () => {
    await admin.getByTestId("add-account-open").click();
    await expect(admin.getByTestId("add-player-form")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  const form = admin.getByTestId("add-player-form");
  const name = form.getByLabel("Username");
  const verify = form.getByRole("button", { name: "Verify" });
  const create = admin.getByTestId("create-account");
  // The form is drawn on the server: what is typed before the page has hydrated never reaches its
  // state (WebKit hydrates later than Chromium). Type until the form holds the Riot ID (Verify is
  // enabled), and the username again until Create is enabled.
  await expect(async () => {
    await name.fill(username);
    await form.getByLabel("Riot ID").fill(`${username}#OCE`);
    await expect(verify).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await verify.click();
  await expect(admin.getByTestId("riot-verified")).toBeVisible();
  await admin.getByTestId("new-access-team").check();
  await expect(async () => {
    if (await create.isDisabled()) await name.fill(username);
    await expect(create).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await create.click();
  await expect(admin.getByTestId("created-account")).toContainText(username);
  const temporary = (await admin.getByTestId("temporary-password-value").innerText()).trim();
  return { username, temporary };
}

/**
 * Sets an account's base access level (a built-in one, "Restricted Player", or one of the owner's)
 * in Users & Permissions → Accounts → Manage access, as the admin page. The account's next request
 * has it: a member signed in elsewhere needs no new sign-in.
 */
export async function setBaseAccess(admin: Page, username: string, level: string) {
  if (!admin.url().startsWith("http")) await admin.goto("/");
  await view(admin.context(), admin.url().split("/").slice(0, 3).join("/"), "admin");
  await admin.goto("/admin/people");
  const person = await openPerson(admin, username);
  await person.getByTestId("open-access").click();
  await pick(admin.getByTestId("access-dialog").getByTestId("base-access"), { label: level });
  await admin.getByTestId("save-access").click();
  await expect(person.getByTestId("access-summary")).toContainText(level);
}

/**
 * Opens a person's view from Users & Permissions → Accounts (the page already open): finds them
 * and presses their row, until the window shows (the row works once the page has hydrated).
 * Returns the window.
 */
export async function openPerson(admin: Page, text: string, rowTestId = "admin-player-row") {
  // The search finds names and usernames: "@name" searches for the name, "(you)" searches for nothing.
  await admin.getByTestId("people-search").fill(text.startsWith("(") ? "" : text.replace(/^@/, ""));
  const row = admin.getByTestId(rowTestId).filter({ hasText: text }).first();
  const view = admin.getByTestId("person-view");
  await expect(async () => {
    await row.click({ timeout: 2_000 });
    await expect(view).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  return view;
}

/** Signs in with the temporary password and chooses the permanent one; the setup form opens next. */
export async function choosePassword(page: Page, username: string, temporary: string, password = "Mine#2026-team") {
  await signIn(page, username, temporary);
  const pw = page.getByTestId("set-password-form");
  await expect(pw).toBeVisible();
  const save = pw.getByRole("button", { name: "Save my password" });
  // The form is drawn on the server: what is typed before the page has hydrated never reaches its
  // state, and Save stays disabled. Type again until the form has taken both fields.
  await expect(async () => {
    await pw.getByLabel("New password").fill(password);
    await pw.getByLabel("Confirm password").fill(password);
    await expect(save).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await save.click();
}

/** A team member account, signed in on its own browser context (first-time setup included, with `role` as their Primary Role, `display` as their display name where given, and `device` for a phone's touch screen). */
export async function memberContext(browser: Browser, admin: Page, viewport = { width: 1440, height: 900 }, { base = "Viewer", role = "Mid", display, device }: { base?: string; role?: "Top" | "Jungle" | "Mid" | "Bottom" | "Support"; display?: string; device?: Pick<BrowserContextOptions, "isMobile" | "hasTouch" | "deviceScaleFactor"> } = {}): Promise<{ context: BrowserContext; page: Page; username: string }> {
  const { username, temporary } = await createMember(admin, base);
  const context = await browser.newContext({ viewport, ...device });
  const page = await context.newPage();
  await choosePassword(page, username, temporary);
  const setup = page.getByTestId("setup-form");
  // A refused password (or a session lost on the way) says so instead of timing out.
  const refused = page.getByTestId("set-password-form").getByRole("alert");
  await expect(setup.or(refused)).toBeVisible();
  if (await refused.isVisible()) throw new Error(`Save my password was refused: ${await refused.innerText()}`);
  if (display) await setup.getByTestId("setup-display-name").fill(display);
  await setup.getByTestId("setup-continue").click();
  await setup.getByRole("radiogroup", { name: "Primary role" }).getByRole("button", { name: role }).click();
  await setup.getByTestId("primary-pool-toggle").click();
  await setup.getByTestId("primary-pool-results").getByRole("option").first().click();
  await page.keyboard.press("Escape");
  await setup.getByRole("button", { name: "Finish setup" }).click();
  // The optional Personalise step comes next; skip it.
  await page.getByTestId("personalise-done").click();
  await expect(page.locator("aside").getByTestId("account-current-name")).toHaveText(display ?? username);
  return { context, page, username };
}

/**
 * Signs in on /login. Locally a browser without a session is the automatic local owner, who is
 * sent past /login: the guest cookie makes it a visitor first (one account per browser).
 */
export async function signIn(page: Page, username: string, password: string) {
  if (!page.url().startsWith("http")) await page.goto("/public");
  await page.context().addCookies([{ name: "uniiverse_guest", value: "1", url: page.url().split("/").slice(0, 3).join("/") }]);
  await page.goto("/login");
  const form = page.getByTestId("login-form");
  await form.getByLabel("Username").fill(username);
  await form.getByLabel("Password").fill(password);
  await form.getByRole("button", { name: "Sign in" }).click();
}

/** Opens the person view's Danger zone (a closed Disclosure). */
export async function openDanger(view: Locator) {
  const zone = view.getByTestId("person-danger");
  if (!(await zone.evaluate((d) => (d as HTMLDetailsElement).open))) await zone.locator("summary").click();
}

/**
 * Grants administrator access in a person's view, as the Owner (Users & Permissions open): the
 * switch, Save access and the second confirmation the grant asks for.
 */
export async function grantAdministrator(owner: Page, username: string) {
  const person = await openPerson(owner, username);
  await person.getByTestId("open-access").click();
  const dialog = owner.getByTestId("access-dialog");
  await dialog.getByTestId("administrator-access").getByText("Administrator access").click();
  await owner.getByTestId("save-access").click();
  await owner.getByRole("button", { name: "Grant administrator access" }).click();
  await expect(person.getByTestId("person-account")).toContainText("Administrator");
  await person.getByTestId("person-view-close").click();
  await expect(person).toBeHidden();
}
