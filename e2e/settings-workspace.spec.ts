import { expect, test, type Page } from "./test";
import { memberContext } from "./member-account";
import { FLOOR, cfg, fits, openAt, resizeTo, withWideText, type Size } from "./workspace";

/*
  Settings as a sectioned workspace on a desktop window (docs/RESPONSIVE.md, "One-screen desktop
  pages": Settings; ui/sectioned-workspace.tsx). The account card is the rail: its sections' links
  (Name, Links, Password, This device) switch the one section shown beside it, in the address
  (?section=), so Back walks them; every section stays mounted, so a draft survives a switch, and the
  rail marks a section holding one, or an error. Riot's notice is under every section (#compliance);
  an old deep link to a panel (#password) opens its section. A soft navigation to /settings (the
  account menu's link) shows the first section, and Back that leaves the page pushes nothing onto the
  page it goes to. Outside the gate the page is the stack it always was. The platform spec holds its
  fit (e2e/one-screen.spec.ts); a member's own (Links, My Profile, Riot Accounts) is held here.
*/

test.beforeEach(({ browserName }, info) => {
  void browserName;
  test.skip(info.project.name !== "desktop", "the desktop workspace (the flow's own specs cover phones and tablets)");
});

const rail = (page: Page) => page.getByTestId("settings-workspace-rail");
const link = (page: Page, id: string) => rail(page).locator(`[data-target="${id}"]`);
const section = (page: Page, id: string) => page.locator(`[data-ws-section="${id}"]`);
const shown = (page: Page) => page.getByTestId("settings-workspace").getAttribute("data-section");

async function expectSection(page: Page, id: string, all: string[]) {
  await expect.poll(() => shown(page)).toBe(id);
  await expect(link(page, id)).toHaveAttribute("aria-current", "page");
  for (const other of all) {
    if (other === id) await expect(section(page, other)).toBeVisible();
    else await expect(section(page, other)).toBeHidden();
  }
  // Riot's notice under every section, on the screen.
  await expect(page.locator("#compliance")).toBeInViewport();
}

const OWNER = ["name", "password", "device"];

test("each section is one rail link away, in the address, and Back and Forward walk them", async ({ page }) => {
  await openAt(page, "/settings", [1366, 768], "expanded");
  await expect(rail(page)).toBeVisible();
  await expect(page.getByTestId("settings-index")).toBeHidden();
  await expectSection(page, "name", OWNER);
  await link(page, "password").click();
  await expect(page).toHaveURL(/\/settings\?section=password$/);
  await expectSection(page, "password", OWNER);
  await link(page, "device").click();
  await expect(page).toHaveURL(/\/settings\?section=device$/);
  await expectSection(page, "device", OWNER);
  await fits(page, "1366x768 expanded: Settings, This device", { workspace: true });
  await page.goBack();
  await expectSection(page, "password", OWNER);
  await page.goBack();
  await expect(page).toHaveURL(/\/settings$/);
  await expectSection(page, "name", OWNER);
  await page.goForward();
  await expectSection(page, "password", OWNER);
  // A link opened with its address shows its section on the first paint (the server reads ?section=).
  await page.goto("/settings?section=device");
  await expectSection(page, "device", OWNER);
  // An unknown section is the first.
  await page.goto("/settings?section=billing");
  await expectSection(page, "name", OWNER);
});

test("the keys: a rail link is a link (Tab, Enter), and the section it opens takes the focus", async ({ page }) => {
  await openAt(page, "/settings", [1440, 900], "collapsed");
  await link(page, "password").focus();
  await page.keyboard.press("Enter");
  await expectSection(page, "password", OWNER);
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest("[data-ws-section]")?.getAttribute("data-ws-section") ?? null)).toBe("password");
  // Tab from the section goes into its fields.
  await page.keyboard.press("Tab");
  await expect(page.locator("#current")).toBeFocused();
  // The browser's own new-tab click is left alone: the link carries the section's address.
  await expect(link(page, "device")).toHaveAttribute("href", "/settings?section=device");
  await expect(link(page, "name")).toHaveAttribute("href", "/settings");
});

test("a draft survives a section switch, and the rail marks it unsaved, or in error, until it is undone", async ({ page }) => {
  await openAt(page, "/settings", [1366, 768], "expanded");
  const name = page.locator("#display-name");
  const original = await name.inputValue();
  await expect(link(page, "name").getByTestId("settings-workspace-unsaved")).toHaveCount(0);
  await name.fill(`${original} draft`);
  await expect(link(page, "name").getByTestId("settings-workspace-unsaved")).toBeVisible();
  await expect(link(page, "name")).toContainText("unsaved changes");
  await link(page, "password").click();
  await expectSection(page, "password", OWNER);
  // Unsaved, and still marked while another section is shown.
  await expect(link(page, "name").getByTestId("settings-workspace-unsaved")).toBeVisible();
  await page.locator("#change-password").fill("a new password draft");
  await expect(link(page, "password").getByTestId("settings-workspace-unsaved")).toBeVisible();
  await link(page, "name").click();
  await expectSection(page, "name", OWNER);
  await expect(name).toHaveValue(`${original} draft`);
  // An error line (a username too short) marks the section in error.
  await page.locator("#username").fill("a");
  await expect(page.locator("#username-help")).toHaveClass(/text-bad/);
  await expect(link(page, "name").getByTestId("settings-workspace-error")).toBeVisible();
  // Back to the saved values: no marker.
  await page.locator("#username").fill((await page.getByTestId("settings-username").innerText()).replace(/^@/, ""));
  await name.fill(original);
  await expect(link(page, "name").getByTestId("settings-workspace-unsaved")).toHaveCount(0);
  await expect(link(page, "name").getByTestId("settings-workspace-error")).toHaveCount(0);
  // The password draft survived both switches.
  await link(page, "password").click();
  await expect(page.locator("#change-password")).toHaveValue("a new password draft");
});

test("#compliance lands on Riot's notice, an old deep link to a panel opens its section, and the account menu's Settings link shows the first", async ({ page }) => {
  await openAt(page, "/settings?section=device", [1366, 768], "expanded");
  // The shell's footer link (Details): /settings#compliance, a soft navigation to the page's own path.
  await page.getByRole("link", { name: "Details" }).first().click();
  await expect(page).toHaveURL(/\/settings#compliance$/);
  await expectSection(page, "name", OWNER);
  await expect(page.locator("#compliance")).toBeInViewport();
  // The shell's nudge to set a password links to #password: its section opens.
  await page.goto("/settings#password");
  await expectSection(page, "password", OWNER);
  // A rail switch drops the panel's hash (the section is in the query).
  await link(page, "device").click();
  await expect(page).toHaveURL(/\/settings\?section=device$/);
  // The account menu's Settings link (a Next <Link> to /settings): Next keeps the page mounted; the address decides.
  await page.getByTestId("account-menu-button").first().click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expectSection(page, "name", OWNER);
  // Back goes to the section before (device), not nowhere.
  await page.goBack();
  await expect(page).toHaveURL(/\/settings\?section=device$/);
  await expectSection(page, "device", OWNER);
});

test("a section an old deep link's hash opened survives an in-page fragment link (the skip link): the query holds it from then on", async ({ page }) => {
  await openAt(page, "/settings#password", [1440, 900], "expanded");
  await expectSection(page, "password", OWNER);
  // The hash's section is written into the address in place.
  await expect(page).toHaveURL(/\/settings\?section=password#password$/);
  // Skip to content: a fragment navigation to #content, outside every section (until 28 Nov 2026 it showed Name).
  await page.getByTestId("skip-link").focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/settings\?section=password#content$/);
  await page.waitForTimeout(300);
  await expectSection(page, "password", OWNER);
  // Back returns to the address the hash opened; Back to /settings (no section, no hash) is still the first section.
  await page.goBack();
  await expectSection(page, "password", OWNER);
  await link(page, "name").click();
  await link(page, "device").click();
  await page.goBack();
  await expect(page).toHaveURL(/\/settings$/);
  await expectSection(page, "name", OWNER);
});

test("Back that leaves the page pushes nothing onto the page it goes to", async ({ page }) => {
  await openAt(page, "/team", [1366, 768], "expanded");
  await page.getByTestId("account-menu-button").first().click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await link(page, "password").click();
  await expect(page).toHaveURL(/\/settings\?section=password$/);
  await page.goBack();
  await expectSection(page, "name", OWNER);
  await page.goBack();
  await expect(page).toHaveURL(/\/team$/);
  await expect(page.getByTestId("settings-workspace")).toHaveCount(0);
  // Still /team, with no ?section= written onto it, a moment later.
  await page.waitForTimeout(500);
  expect(new URL(page.url()).search).toBe("");
});

test("Admin Mode's Settings is the same workspace", async ({ page }) => {
  await openAt(page, "/admin/settings", [1366, 768], "collapsed", { admin: true });
  await expectSection(page, "name", OWNER);
  await link(page, "password").click();
  await expect(page).toHaveURL(/\/admin\/settings\?section=password$/);
  await expectSection(page, "password", OWNER);
  await fits(page, "1366x768 collapsed: Admin Settings, Password", { workspace: true });
});

test("outside the gate the page is the stack it always was: every section drawn, the index, no rail", async ({ page }) => {
  for (const size of [
    [1366, 640],
    [1200, 900],
  ] as Size[]) {
    await openAt(page, "/settings?section=password", size, "expanded");
    await expect(page.locator("[data-workspace]")).toHaveCount(0);
    await expect(rail(page)).toBeHidden();
    await expect(page.getByTestId("settings-index")).toBeVisible();
    for (const id of OWNER) await expect(section(page, id).locator(".panel-depth, section, [id]").first()).toBeAttached();
    for (const id of ["name", "password", "device"]) await expect(page.locator(`#${id}`)).toBeVisible();
    await expect(page.locator("#compliance")).toBeAttached();
  }
});

test("a member's own Settings (Links, My Profile, Riot Accounts) fits at the eight sizes' extremes and the floor, every section", async ({ browser, page: admin }) => {
  test.setTimeout(180_000);
  const { context, page } = await memberContext(browser, admin);
  await withWideText(page);
  const sections = ["name", "links", "password", "device"];
  for (const side of ["expanded", "collapsed"] as const) {
    await context.clearCookies({ name: "uniiverse_sidebar" });
    await context.addCookies([{ name: "uniiverse_sidebar", value: side, url: new URL(admin.url()).origin }]);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/settings");
    for (const id of sections) {
      await link(page, id).click();
      await expectSection(page, id, sections);
      for (const size of [[1366, 768], [1920, 1080], FLOOR] as Size[]) {
        await resizeTo(page, size);
        await fits(page, `${cfg(size, side)}: a member's Settings, ${id}`, { workspace: true });
      }
    }
  }
  await context.close();
});
