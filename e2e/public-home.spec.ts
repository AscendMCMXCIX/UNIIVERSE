import { expect, test, type Browser, type Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { createMember, view } from "./member-account";

/*
  THE PUBLIC PAGE as the site's front door: visitors get it at "/", members go straight to their own
  start page. Sign In opens a small window over the page (the same form as /login, which stays for
  direct links); the window signs in through the same action, errors and temporary passwords
  included. Admin → Branding → Public page sets the words, the Discord invitation (never made up),
  whether the team is open to new players and the sign-off. Install App sits in the header.
  Demo roster, in-memory only; locally a visitor is a browser holding the guest cookie.
*/

const GUEST_COOKIE = "uniiverse_guest";

async function guestPage(browser: Browser, baseURL: string, options: Parameters<Browser["newContext"]>[0] = {}): Promise<Page> {
  const context = await browser.newContext(options);
  await context.addCookies([{ name: GUEST_COOKIE, value: "1", url: baseURL }]);
  return context.newPage();
}

const desktopOnly = (name: string) => test.skip(name !== "desktop", "runs once, on the desktop project");

test("visitors get the public page at the site's address; members go straight to their own start page", async ({ page, browser, baseURL }, info) => {
  desktopOnly(info.project.name);
  const guest = await guestPage(browser, baseURL!);
  await guest.goto("/");
  await expect(guest).toHaveURL(new RegExp(`^${baseURL}/?$`));
  await expect(guest.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(guest.getByTestId("public-hero-title")).toBeVisible();
  for (const id of ["public-team", "public-community", "public-playing", "public-footer"]) await expect(guest.getByTestId(id)).toBeVisible();
  await expect(guest.getByTestId("lineup-cell")).toHaveCount(5);
  // The way in for visitors, the way back for members.
  await expect(guest.getByTestId("public-sign-in")).toBeVisible();
  await expect(guest.getByTestId("public-open-app")).toHaveCount(0);
  await guest.context().close();
  // A signed-in member opening the site's address never sees the public page first.
  await page.goto("/");
  await expect(page).toHaveURL(/\/(team|overview|admin\/people)$/);
});

test("Sign In opens a window over the page; Escape closes it and focus goes back to Sign In", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name === "tablet", "runs on phone and desktop");
  const viewport = info.project.name === "phone" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  const guest = await guestPage(browser, baseURL!, { viewport, hasTouch: info.project.name === "phone" });
  await guest.goto("/");
  const signIn = guest.getByTestId("public-sign-in");
  // A real link to /login underneath, for new tabs and pages without script.
  await expect(signIn).toHaveAttribute("href", "/login");
  await signIn.click();
  const dialog = guest.getByRole("dialog", { name: "Sign in" });
  await expect(dialog).toBeVisible();
  await expect(guest).toHaveURL(new RegExp(`^${baseURL}/?$`));
  await expect(dialog.getByLabel("Username")).toBeFocused();
  // Fits the screen, phone included.
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  // The form password managers know: a username field and a current-password field.
  await expect(dialog.getByLabel("Username")).toHaveAttribute("autocomplete", "username");
  await expect(dialog.getByLabel("Password")).toHaveAttribute("autocomplete", "current-password");
  // The rest of the page is out of reach while it is open; Escape closes it.
  await guest.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(signIn).toBeFocused();
  // The footer's Sign In opens the same window.
  await guest.getByTestId("public-footer").getByRole("link", { name: "Sign In" }).click();
  await expect(guest.getByRole("dialog", { name: "Sign in" })).toBeVisible();
  const scan = await new AxeBuilder({ page: guest }).include("[data-testid=sign-in-window]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(scan.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  await guest.context().close();
});

test("signing in from the window: a wrong password is told in the window, a temporary one leads on to choosing your own", async ({ page, browser, baseURL }, info) => {
  desktopOnly(info.project.name);
  const { username, temporary } = await createMember(page, "Front");
  const guest = await guestPage(browser, baseURL!);
  await guest.goto("/");
  await guest.getByTestId("public-sign-in").click();
  const dialog = guest.getByRole("dialog", { name: "Sign in" });
  await dialog.getByLabel("Username").fill(username);
  await dialog.getByLabel("Password").fill("not-the-password-1");
  await dialog.getByRole("button", { name: "Sign in" }).click();
  // The same generic answer as /login; still on the public page, in the window.
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByLabel("Username")).toHaveValue(username);
  await expect(guest).toHaveURL(new RegExp(`^${baseURL}/?$`));
  await dialog.getByLabel("Password").fill(temporary);
  await dialog.getByRole("button", { name: "Sign in" }).click();
  // A temporary password: the first-time steps, exactly as from /login.
  await expect(guest).toHaveURL(/\/welcome/);
  await expect(guest.getByTestId("set-password-form")).toBeVisible();
  await guest.context().close();
});

test("/login stays for direct links, and leads back to the public page", async ({ browser, baseURL }, info) => {
  desktopOnly(info.project.name);
  const guest = await guestPage(browser, baseURL!);
  await guest.goto("/login");
  await expect(guest.getByTestId("login-form")).toBeVisible();
  await guest.getByTestId("login-public-link").click();
  await expect(guest).toHaveURL(new RegExp(`^${baseURL}/?$`));
  await expect(guest.getByTestId("public-hero-title")).toBeVisible();
  // Signing out of the last account lands on the public page too, where signing in starts.
  const res = await guest.context().request.post("/api/auth/logout", { maxRedirects: 0 });
  expect(res.status()).toBe(303);
  expect(res.headers()["location"]).toBe("/");
  await guest.context().close();
});

test("Admin → Branding → Public page: the Discord invitation, the team's openness and the sign-off reach the page; anything but an invitation is refused", async ({ page, browser, baseURL }, info) => {
  desktopOnly(info.project.name);
  await view(page.context(), baseURL!, "admin");
  await page.goto("/admin/branding");
  const panel = page.getByTestId("public-site-panel");
  const save = panel.getByTestId("ps-save");
  const invite = panel.getByTestId("ps-discord");
  // Not an invitation: said at once, and nothing can be saved.
  await invite.fill("https://example.com/invite/friends");
  await expect(panel.getByRole("alert")).toContainText("invitation link");
  await expect(save).toBeDisabled();
  try {
    await invite.fill("discord.gg/uv-e2e-test");
    await panel.getByText("Open to new players", { exact: true }).click();
    await expect(panel.getByRole("switch", { name: /Open to new players/ })).not.toBeChecked();
    await panel.getByTestId("ps-sign-off").fill("Stay kind");
    await save.click();
    await expect(page.getByText("Public page saved.")).toBeVisible();
    await expect(invite).toHaveValue("https://discord.gg/uv-e2e-test");

    const guest = await guestPage(browser, baseURL!);
    await guest.goto("/");
    for (const id of ["public-cta-community", "public-discord-join"]) {
      const link = guest.getByTestId(id);
      await expect(link).toHaveAttribute("href", "https://discord.gg/uv-e2e-test");
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", /noopener/);
    }
    // Closed: the page says so, and asks nobody to come and play.
    await expect(guest.getByTestId("playing-status")).toHaveText("Not looking for players right now");
    await expect(guest.getByTestId("public-playing-discord")).toHaveCount(0);
    await expect(guest.getByTestId("public-playing")).toContainText("not of the League team");
    await expect(guest.getByTestId("public-sign-off")).toHaveText("Stay kind");
    await guest.context().close();
  } finally {
    await invite.fill("");
    if (!(await panel.getByRole("switch", { name: /Open to new players/ }).isChecked())) await panel.getByText("Open to new players", { exact: true }).click();
    await expect(panel.getByRole("switch", { name: /Open to new players/ })).toBeChecked();
    await panel.getByTestId("ps-sign-off").fill("");
    if (await save.isEnabled()) {
      await save.click();
      await expect(page.getByText("Public page saved.").first()).toBeVisible();
    }
  }
  // Without an invitation there is no Discord link anywhere on the page: none is ever made up.
  const guest = await guestPage(browser, baseURL!);
  await guest.goto("/");
  await expect(guest.locator('a[href*="discord"]')).toHaveCount(0);
  await expect(guest.getByTestId("playing-status")).toHaveText("Open to new players");
  await expect(guest.getByTestId("public-sign-off")).toHaveCount(0);
  await guest.context().close();
});

test("Admin → Previews shows the public page as a visitor sees it, and its sign-in sends nothing", async ({ page, baseURL }, info) => {
  desktopOnly(info.project.name);
  await view(page.context(), baseURL!, "admin");
  await page.goto("/admin/previews?screen=public");
  await expect(page.getByTestId("preview-screen-public")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("preview-frame")).toHaveAttribute("src", "/preview/public");
  await page.goto("/preview/public");
  await expect(page.getByTestId("preview-badge")).toBeVisible();
  await expect(page.getByTestId("public-open-app")).toHaveCount(0);
  await page.getByTestId("public-sign-in").click();
  const dialog = page.getByRole("dialog", { name: "Sign in" });
  await dialog.getByLabel("Username").fill("someone");
  await dialog.getByLabel("Password").fill("anything-at-all");
  await dialog.getByRole("button", { name: "Sign in" }).click();
  await expect(dialog.getByTestId("preview-note")).toBeVisible();
  await expect(page).toHaveURL(/\/preview\/public$/);
});

test("Install App sits in the public header and opens the install window; the installed app never shows it", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name === "tablet", "runs on phone and desktop");
  const guest = await guestPage(browser, baseURL!, info.project.name === "phone" ? { viewport: { width: 390, height: 844 }, hasTouch: true } : {});
  await guest.goto("/");
  const install = guest.getByTestId("public-header").getByRole("button", { name: "Install App" });
  await expect(install).toBeVisible();
  expect(await install.getAttribute("class")).toContain("[@media(display-mode:standalone)]:hidden");
  await install.click();
  await expect(guest.getByTestId("install-window")).toBeVisible();
  await guest.context().close();
});

test("motion stays out of the way: everything is in place for reduced motion, and nothing scrolls sideways", async ({ browser, baseURL }, info) => {
  const viewport = info.project.name === "phone" ? { width: 375, height: 667 } : info.project.name === "tablet" ? { width: 820, height: 1180 } : { width: 1440, height: 900 };
  const calm = await guestPage(browser, baseURL!, { viewport, reducedMotion: "reduce" });
  await calm.goto("/");
  const title = calm.getByTestId("public-hero-title");
  await expect(title).toBeVisible();
  expect(await title.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  expect(await calm.locator(".public-aurora").first().evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  const overflow = await calm.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await calm.context().close();
  // With motion allowed, the hero's words arrive once, and its light drifts.
  const moving = await guestPage(browser, baseURL!, { viewport, reducedMotion: "no-preference" });
  await moving.goto("/");
  expect(await moving.getByTestId("public-hero-title").evaluate((el) => getComputedStyle(el).animationName)).toBe("public-enter");
  expect(await moving.locator(".public-aurora").first().evaluate((el) => getComputedStyle(el).animationIterationCount)).toBe("infinite");
  await moving.context().close();
});

test("the public page meets WCAG 2.1 A/AA (axe: no serious or critical issues)", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name === "tablet", "runs on phone and desktop");
  const guest = await guestPage(browser, baseURL!, { reducedMotion: "reduce", ...(info.project.name === "phone" ? { viewport: { width: 390, height: 844 }, hasTouch: true } : {}) });
  await guest.goto("/");
  await expect(guest.getByTestId("lineup-cell").first()).toBeVisible();
  const scan = await new AxeBuilder({ page: guest }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(scan.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  await guest.context().close();
});
