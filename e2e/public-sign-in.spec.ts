import { expect, test, type Browser, type Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { createMember, memberContext } from "./member-account";

/*
  SIGNING IN AND INSTALLING FROM THE PUBLIC TEAM PAGE. The site's address sends visitors to the
  public team page (/public), as it always has. Its Sign in opens a small window over the page
  with the same form and action as /login (which stays for direct links, protected pages and
  adding an account), and Install App sits beside it, discreet, hidden in the installed app.
  Demo roster, in-memory only; locally a visitor is a browser holding the guest cookie.
*/

const GUEST_COOKIE = "uniiverse_guest";

async function guestPage(browser: Browser, baseURL: string, options: Parameters<Browser["newContext"]>[0] = {}): Promise<Page> {
  const context = await browser.newContext(options);
  await context.addCookies([{ name: GUEST_COOKIE, value: "1", url: baseURL }]);
  return context.newPage();
}

const desktopOnly = (name: string) => test.skip(name !== "desktop", "runs once, on the desktop project");
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

test("the site's address sends visitors to the team page, as it always has; members go straight to their own start page", async ({ page, browser, baseURL }, info) => {
  desktopOnly(info.project.name);
  const guest = await guestPage(browser, baseURL!);
  await guest.goto("/");
  await expect(guest).toHaveURL(/\/public$/);
  await expect(guest.getByTestId("team-name")).toBeVisible();
  await expect(guest.getByTestId("team-subtitle")).toHaveText("Main lineup");
  await expect(guest.getByTestId("lineup-cell")).toHaveCount(5);
  // The header as before (Team, then Sign in), with Install App between them; Riot's notice at the foot.
  const header = guest.getByTestId("public-header");
  await expect(header.getByRole("link", { name: "Team", exact: true })).toBeVisible();
  await expect(header.getByRole("button", { name: "Install App" })).toBeVisible();
  await expect(header.getByTestId("public-sign-in")).toHaveText("Sign in");
  await expect(guest.getByTestId("public-legal")).toBeVisible();
  await guest.context().close();
  // A signed-in member opening the site's address never sees the public page first.
  await page.goto("/");
  await expect(page).toHaveURL(/\/(team|overview|admin\/people)$/);
});

test("Sign in opens a window over the team page; Escape closes it and focus goes back to Sign in", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name === "tablet", "runs on phone and desktop");
  const options = info.project.name === "phone" ? PHONE : { viewport: { width: 1440, height: 900 } };
  const guest = await guestPage(browser, baseURL!, options);
  await guest.goto("/public");
  const signIn = guest.getByTestId("public-sign-in");
  // A real link to /login underneath, for new tabs and pages without script.
  await expect(signIn).toHaveAttribute("href", "/login");
  if (info.project.name === "phone") await signIn.tap();
  else await signIn.click();
  const dialog = guest.getByRole("dialog", { name: "Sign in" });
  await expect(dialog).toBeVisible();
  await expect(guest).toHaveURL(/\/public$/);
  await expect(dialog.getByLabel("Username")).toBeFocused();
  // The sign-in page's own card: the brand, PRIVATE, Sign in and the same words.
  await expect(dialog).toContainText("PRIVATE");
  await expect(dialog).toContainText("There is no sign-up: admins create every account.");
  // Fits the screen, phone included.
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(options.viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(options.viewport.height);
  // The form password managers know: a username field and a current-password field.
  await expect(dialog.getByLabel("Username")).toHaveAttribute("autocomplete", "username");
  await expect(dialog.getByLabel("Password")).toHaveAttribute("autocomplete", "current-password");
  const scan = await new AxeBuilder({ page: guest }).include("[data-testid=sign-in-window]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(scan.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  // Escape closes it, and focus goes back to Sign in.
  await guest.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(signIn).toBeFocused();
  await guest.context().close();
});

test("a phone held sideways gets a compact window whose form is all in reach", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "a phone held sideways");
  const guest = await guestPage(browser, baseURL!, { ...PHONE, viewport: { width: 844, height: 390 } });
  await guest.goto("/public");
  await guest.getByTestId("public-sign-in").tap();
  const dialog = guest.getByRole("dialog", { name: "Sign in" });
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(390);
  // The words are left out there; the title stays, and every field and the button can be reached.
  await expect(dialog.getByText("PRIVATE")).toBeHidden();
  for (const target of [dialog.getByLabel("Username"), dialog.getByLabel("Password"), dialog.getByRole("button", { name: "Sign in" })]) {
    await target.scrollIntoViewIfNeeded();
    await expect(target).toBeInViewport();
  }
  await guest.context().close();
});

test("signing in from the window: a wrong password is told in the window, a temporary one leads on to choosing your own", async ({ page, browser, baseURL }, info) => {
  desktopOnly(info.project.name);
  const { username, temporary } = await createMember(page, "Window");
  const guest = await guestPage(browser, baseURL!);
  await guest.goto("/public");
  await guest.getByTestId("public-sign-in").click();
  const dialog = guest.getByRole("dialog", { name: "Sign in" });
  await dialog.getByLabel("Username").fill(username);
  await dialog.getByLabel("Password").fill("not-the-password-1");
  await dialog.getByRole("button", { name: "Sign in" }).click();
  // The same generic answer as /login; still on the team page, in the window.
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByLabel("Username")).toHaveValue(username);
  await expect(guest).toHaveURL(/\/public$/);
  await dialog.getByLabel("Password").fill(temporary);
  await dialog.getByRole("button", { name: "Sign in" }).click();
  // A temporary password: the first-time steps, exactly as from /login.
  await expect(guest).toHaveURL(/\/welcome/);
  await expect(guest.getByTestId("set-password-form")).toBeVisible();
  await guest.context().close();
});

test("a member signs in from the window and lands on their start page; signing out returns to the team page", async ({ page, browser, baseURL }, info) => {
  test.skip(info.project.name === "tablet", "runs on phone and desktop");
  const phone = info.project.name === "phone";
  const member = await memberContext(browser, page, undefined, { base: "Window" });
  await member.context.close();
  const guest = await guestPage(browser, baseURL!, phone ? PHONE : { viewport: { width: 1440, height: 900 } });
  await guest.goto("/");
  await expect(guest).toHaveURL(/\/public$/);
  const signIn = guest.getByTestId("public-sign-in");
  if (phone) await signIn.tap();
  else await signIn.click();
  const dialog = guest.getByRole("dialog", { name: "Sign in" });
  await dialog.getByLabel("Username").fill(member.username);
  await dialog.getByLabel("Password").fill("Mine#2026-team");
  await dialog.getByRole("button", { name: "Sign in" }).click();
  await expect(guest).toHaveURL(/\/team$/);
  if (!phone) {
    // Signing out of the only account: back to the team page, where Sign in opens the window again.
    await guest.locator("aside").getByTestId("account-menu-button").click();
    await guest.getByTestId("account-menu").getByRole("menuitem", { name: "Sign out", exact: true }).click();
    await expect(guest).toHaveURL(/\/public$/);
    await expect(guest.getByTestId("public-sign-in")).toBeVisible();
  }
  await guest.context().close();
});

test("/login stays for direct links and leads back to the team page; signing out of the last account goes to the site's address", async ({ browser, baseURL }, info) => {
  desktopOnly(info.project.name);
  const guest = await guestPage(browser, baseURL!);
  await guest.goto("/login");
  await expect(guest.getByTestId("login-form")).toBeVisible();
  await guest.getByTestId("login-public-link").click();
  await expect(guest).toHaveURL(/\/public$/);
  const res = await guest.context().request.post("/api/auth/logout", { maxRedirects: 0 });
  expect(res.status()).toBe(303);
  expect(res.headers()["location"]).toBe("/");
  await guest.context().close();
});

test("Install App sits in the team page's header (the icon alone on a phone) and opens the install window; the installed app never shows it", async ({ browser, baseURL }, info) => {
  const phone = info.project.name === "phone";
  const guest = await guestPage(browser, baseURL!, phone ? PHONE : {});
  await guest.goto("/public");
  const install = guest.getByTestId("public-header").getByRole("button", { name: "Install App" });
  await expect(install).toBeVisible();
  // Discreet: a phone shows the icon only (its name stays for screen readers), wider screens the word too.
  if (phone) await expect(install.getByText("Install App")).toHaveClass(/max-sm:sr-only/);
  else await expect(install.getByText("Install App")).toBeVisible();
  const size = (await install.boundingBox())!;
  if (phone) expect(Math.min(size.width, size.height)).toBeGreaterThanOrEqual(44);
  expect(await install.getAttribute("class")).toContain("[@media(display-mode:standalone)]:hidden");
  if (phone) await install.tap();
  else await install.click();
  await expect(guest.getByTestId("install-window")).toBeVisible();
  await guest.context().close();
  // Inside the installed app (its display mode) there is nothing to install.
  const installed = await browser.newContext(phone ? PHONE : {});
  await installed.addCookies([{ name: GUEST_COOKIE, value: "1", url: baseURL! }]);
  await installed.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q: string) => (q.includes("display-mode") ? ({ ...real(q), matches: true, media: q, addEventListener() {}, removeEventListener() {} } as MediaQueryList) : real(q));
  });
  const app = await installed.newPage();
  await app.goto("/public");
  await expect(app.getByTestId("public-sign-in")).toBeVisible();
  await expect(app.getByTestId("public-header").getByTestId("install-app")).toHaveCount(0);
  await installed.close();
});

test("the team page meets WCAG 2.1 A/AA (axe: no serious or critical issues), and nothing scrolls sideways", async ({ browser, baseURL }, info) => {
  const options = info.project.name === "phone" ? PHONE : info.project.name === "tablet" ? { viewport: { width: 820, height: 1180 } } : { viewport: { width: 1440, height: 900 } };
  const guest = await guestPage(browser, baseURL!, options);
  await guest.goto("/public");
  await expect(guest.getByTestId("lineup-cell").first()).toBeVisible();
  const overflow = await guest.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const scan = await new AxeBuilder({ page: guest }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(scan.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  await guest.context().close();
});
