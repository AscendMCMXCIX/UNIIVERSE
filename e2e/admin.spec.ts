import { devices, expect, test, type Page } from "@playwright/test";
import { NEUTRAL_NAME } from "../src/domain/branding";
import { memberContext } from "./member-account";

/*
  Player Mode and Admin Mode. The browser tests run in local open mode, where the automatic local
  owner stands in for the Owner: an administrator without a player profile, so with no saved
  choice "/" opens Admin Mode for it. A member account (a real sign-in on its own browser) checks
  what a player sees, and what granting and removing administrator access changes. Account
  creation uses the in-memory demo's stand-in for Riot's account check (UNIIVERSE_FAKE_RIOT_IDS in
  playwright.config.ts), never Riot itself.
*/

test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "runs once, on the desktop project"));

/** A username unique to this run (the demo database lives as long as the test server). */
const unique = (base: string) => `${base}${Date.now().toString(36).slice(-5)}`;

/** Admin Mode's sections, in sidebar order. */
const ADMIN_SECTIONS = ["Dashboard", "Users & Permissions", "Platform Settings", "Data & Integrations", "System Health", "Audit Logs"];
/** Player Mode's sidebar for a team member (and for the Owner). */
const PLAYER_ENTRIES = ["My Profile", "Team", "Clash Scout"];

async function createAccount(page: Page, username: string, access: "team" | "personal", riotId = `${username}#OCE`) {
  const form = page.getByTestId("add-player-form");
  await form.getByLabel("Username").fill(username);
  await form.getByLabel("Riot ID").fill(riotId);
  await form.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByTestId("riot-verified")).toBeVisible();
  await page.getByTestId(`new-access-${access}`).check();
  await page.getByTestId("create-account").click();
}

/** Opens Manage access for an account in Users & Permissions → Accounts. */
async function openAccess(page: Page, username: string) {
  await page.goto("/admin/people");
  await page.getByTestId("people-search").fill(username);
  await page.getByTestId("admin-player-row").filter({ hasText: username }).getByTestId("open-access").click();
  return page.getByTestId("access-dialog");
}

test("an administrator moves between Player Mode and Admin Mode; each keeps its own navigation through reloads", async ({ page }) => {
  const aside = page.locator("aside");
  const nav = aside.getByRole("navigation", { name: "Main" });
  const modeSwitch = aside.getByTestId("mode-switch");

  // Admin Mode: its dashboard, its six sections and none of the player pages.
  await page.goto("/");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByTestId("admin-dashboard")).toBeVisible();
  await expect(nav.getByRole("link")).toHaveText(ADMIN_SECTIONS);
  await expect(nav.getByTestId("nav-admin")).toHaveAttribute("aria-current", "page");
  for (const href of ["/team", "/overview", "/clash", "/players", "/matches"]) await expect(aside.locator(`a[href='${href}']`)).toHaveCount(0);
  await expect(modeSwitch).toHaveText("Return to Player Mode");

  // Each section opens and stays marked; a reload keeps the page and the mode.
  await nav.getByTestId("nav-admin-users").click();
  await expect(page).toHaveURL(/\/admin\/people$/);
  await expect(nav.getByTestId("nav-admin-users")).toHaveAttribute("aria-current", "page");
  await page.reload();
  await expect(nav.getByTestId("nav-admin-users")).toHaveAttribute("aria-current", "page");
  await expect(modeSwitch).toHaveText("Return to Player Mode");
  await nav.getByTestId("nav-admin-audit").click();
  await expect(page).toHaveURL(/\/admin\/audit$/);
  await expect(page.getByRole("heading", { name: "Audit Logs" })).toBeVisible();
  // Account settings without leaving Admin Mode.
  await aside.getByTestId("account-menu-button").click();
  await page.getByTestId("account-menu").getByRole("menuitem", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/admin\/settings$/);
  await expect(nav.getByRole("link")).toHaveText(ADMIN_SECTIONS);
  // Old admin addresses still lead to their pages.
  for (const old of ["/admin/users", "/admin/players"]) {
    await page.goto(old);
    await expect(page).toHaveURL(/\/admin\/people$/);
  }

  // Player Mode: the player navigation and the way back; "/" (the installed app's start) remembers the mode.
  await modeSwitch.click();
  await expect(page).toHaveURL(/\/team$/);
  await expect(nav.getByRole("link")).toHaveText(PLAYER_ENTRIES);
  await expect(nav.locator("a[href^='/admin']")).toHaveCount(0);
  await expect(modeSwitch).toHaveText("Switch to Admin Mode");
  await page.reload();
  await expect(modeSwitch).toHaveText("Switch to Admin Mode");
  await page.goto("/");
  await expect(page).toHaveURL(/\/team$/);
  await page.goto("/settings");
  await expect(page.getByTestId("settings-mode-switch")).toHaveText(/Switch to Admin Mode/);
  await modeSwitch.click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/admin$/);
});

test("on a phone the switch is in the menu, and each mode has its own tab bar and menu", async ({ browser }) => {
  const { defaultBrowserType: _, ...iphone } = devices["iPhone 15"];
  const context = await browser.newContext(iphone);
  const page = await context.newPage();
  const tabs = page.getByRole("navigation", { name: "Primary" }).getByRole("link");
  const drawer = page.getByRole("dialog", { name: "Menu" });
  await page.goto("/admin");
  await expect(page.getByTestId("mobile-topbar")).toContainText("Admin mode");
  await expect(tabs).toHaveText(["Dashboard", "Users", "Settings", "Health"]);
  await expect(tabs.first()).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(drawer.getByRole("navigation", { name: "Main" }).getByRole("link")).toHaveText(ADMIN_SECTIONS);
  await expect(drawer.getByTestId("mode-switch")).toHaveText("Return to Player Mode");
  await drawer.getByTestId("mode-switch").click();
  await expect(page).toHaveURL(/\/team$/);
  await expect(tabs).toHaveText(["Profile", "Team", "Matches", "Clash"]);
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(drawer.getByRole("navigation", { name: "Main" }).getByRole("link")).toHaveText(PLAYER_ENTRIES);
  await drawer.getByTestId("mode-switch").click();
  await expect(page).toHaveURL(/\/admin$/);
  // The installed app opens at "/": the mode used last.
  await page.goto("/");
  await expect(page).toHaveURL(/\/admin$/);
  await page.waitForLoadState("networkidle").catch(() => {});
  await context.close();
});

test("a player never sees Admin Mode; granted administrator access, the same account switches modes; removed, Admin Mode closes at once", async ({ browser, page: admin }) => {
  const member = await memberContext(browser, admin, undefined, { base: "Deputy" });
  const { page, username } = member;
  const aside = page.locator("aside");
  const nav = aside.getByRole("navigation", { name: "Main" });

  // A player: no switch, no Admin Mode anywhere, and an /admin address opens Player Mode instead.
  await page.goto("/team");
  await expect(nav.getByRole("link")).toHaveText(PLAYER_ENTRIES);
  await expect(aside.getByTestId("mode-switch")).toHaveCount(0);
  await expect(page.getByText(/Admin Mode/i)).toHaveCount(0);
  for (const path of ["/admin", "/admin/people", "/admin/audit", "/admin/settings"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/team$/);
  }
  await page.goto("/settings");
  await expect(page.getByTestId("settings-mode-switch")).toHaveCount(0);
  // The switch route itself refuses: Player Mode, whatever is asked for.
  await page.goto("/api/mode?to=admin");
  await expect(page).toHaveURL(/\/team$/);

  // An administrator grants administrator access in Users & Permissions.
  const dialog = await openAccess(admin, username);
  const access = dialog.getByTestId("administrator-access");
  await expect(dialog.getByTestId("admin-mode-ability")).toHaveAttribute("data-on", "false");
  await access.getByText("Administrator access").click();
  await expect(access.getByLabel("Administrator access")).toBeChecked();
  await expect(dialog.getByTestId("admin-mode-ability")).toHaveAttribute("data-on", "true");
  await admin.getByTestId("save-access").click();
  await expect(admin.getByTestId("admin-player-row").filter({ hasText: username })).toContainText("Administrator");

  // The same account, still signed in: its next page offers the switch; its player data is untouched.
  await page.goto("/overview");
  await expect(page.getByTestId("profile-tabs")).toBeVisible();
  const modeSwitch = aside.getByTestId("mode-switch");
  await expect(modeSwitch).toHaveText("Switch to Admin Mode");
  await modeSwitch.click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(nav.getByRole("link")).toHaveText(ADMIN_SECTIONS);
  await page.reload();
  await expect(page.getByTestId("admin-dashboard")).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL(/\/admin$/);
  // The grant is in the audit log.
  await admin.goto("/admin/audit?category=access");
  await expect(admin.getByTestId("admin-activity-row").first()).toContainText("Granted administrator access");

  // Removed: the next request is Player Mode, an /admin address included, and the saved choice is gone.
  const again = await openAccess(admin, username);
  await again.getByTestId("administrator-access").getByText("Administrator access").click();
  await expect(again.getByTestId("administrator-access").getByLabel("Administrator access")).not.toBeChecked();
  await admin.getByTestId("save-access").click();
  await expect(admin.getByTestId("admin-player-row").filter({ hasText: username })).not.toContainText("Administrator");
  await page.reload();
  await expect(page).toHaveURL(/\/team$/);
  await expect(aside.getByTestId("mode-switch")).toHaveCount(0);
  await expect(nav.getByRole("link")).toHaveText(PLAYER_ENTRIES);
  await page.goto("/");
  await expect(page).toHaveURL(/\/team$/);
  expect((await member.context.cookies()).find((c) => c.name === "uniiverse_view")).toBeUndefined();
  await member.context.close();
});

test("consecutive account creations always copy the details of the account just created", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
  await page.goto("/admin/people");
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText());
  const created = page.getByTestId("created-account");
  const password = page.getByTestId("temporary-password-value");

  const first = unique("Alpha");
  await createAccount(page, first, "personal");
  await expect(created).toContainText(first);
  await expect(created).toContainText("personal use");
  const firstPassword = (await password.innerText()).trim();
  await page.getByTestId("copy-details").click();
  expect(await clipboard()).toContain(`Username: ${first}\nTemporary password: ${firstPassword}`);

  const second = unique("Bravo");
  await createAccount(page, second, "team");
  await expect(created).toContainText(second);
  const secondPassword = (await password.innerText()).trim();
  expect(secondPassword).not.toBe(firstPassword);
  await page.getByTestId("copy-details").click();
  const copied = await clipboard();
  expect(copied).toContain(`Username: ${second}\nTemporary password: ${secondPassword}`);
  expect(copied).not.toContain(first);

  // A failed creation (username taken) clears the previous result; the next success shows its own.
  await createAccount(page, second, "team", `${unique("Delta")}#OCE`);
  await expect(page.getByText(/That username is already taken/)).toBeVisible();
  await expect(created).toHaveCount(0);
  const third = unique("Charlie");
  await createAccount(page, third, "team");
  await expect(created).toContainText(third);
  await page.getByTestId("copy-details").click();
  expect(await clipboard()).toContain(`Username: ${third}`);

  // Every new account is listed at once, with its state and team membership.
  await page.getByTestId("people-search").fill(first);
  const personal = page.getByTestId("people-group-personal").getByTestId("admin-player-row").filter({ hasText: first });
  await expect(personal).toContainText("Awaiting first login");
  await expect(personal).toContainText("Personal use");
  await page.getByTestId("people-search").fill(second);
  await expect(page.getByTestId("people-group-team").getByTestId("admin-player-row").filter({ hasText: second })).toContainText("Team member");

  // Promote the personal account to the team through Manage access.
  await page.getByTestId("people-search").fill(first);
  await personal.getByTestId("open-access").click();
  const dialog = page.getByTestId("access-dialog");
  await expect(dialog.getByTestId("team-membership")).toBeVisible();
  await dialog.getByTestId("team-membership").getByText(`Member of the ${NEUTRAL_NAME} team`).click();
  await expect(dialog.getByLabel(`Member of the ${NEUTRAL_NAME} team`)).toBeChecked();
  await page.getByTestId("save-access").click();
  await expect(page.getByTestId("people-group-team").getByTestId("admin-player-row").filter({ hasText: first })).toContainText("Team member");
});

test("Audit Logs list admin activity newest first, by category, with no password in it", async ({ page }) => {
  const username = unique("Logged");
  await page.goto("/admin/people");
  await createAccount(page, username, "personal");
  const password = (await page.getByTestId("temporary-password-value").textContent())?.trim() ?? "";
  expect(password.length).toBeGreaterThan(5);
  // The dashboard's recent activity, then the full log.
  await page.goto("/admin");
  await expect(page.getByTestId("dashboard-activity").getByTestId("admin-activity-row").first()).toContainText(username);
  await page.goto("/admin/audit");
  const activity = page.getByTestId("admin-activity");
  const first = activity.getByTestId("admin-activity-row").first();
  await expect(first).toContainText("Created an account");
  await expect(first).toContainText(username);
  await expect(activity).not.toContainText(password);
  // Categories: the account is under Accounts, not under Settings.
  await page.getByTestId("audit-category-accounts").click();
  await expect(page).toHaveURL(/category=accounts/);
  await expect(activity.getByTestId("admin-activity-row").first()).toContainText(username);
  await page.getByTestId("audit-category-settings").click();
  await expect(page).toHaveURL(/category=settings/);
  await expect(activity).not.toContainText(username);
});
