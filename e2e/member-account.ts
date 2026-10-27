import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

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

/** A team member account, signed in on its own browser context (first-time setup included, with `role` as their Primary Role). */
export async function memberContext(browser: Browser, admin: Page, viewport = { width: 1440, height: 900 }, { base = "Viewer", role = "Mid" }: { base?: string; role?: "Top" | "Jungle" | "Mid" | "Bottom" | "Support" } = {}): Promise<{ context: BrowserContext; page: Page; username: string }> {
  const { username, temporary } = await createMember(admin, base);
  const context = await browser.newContext({ viewport, ...webkitMemberOptions(browser) });
  const page = await context.newPage();
  await choosePassword(page, username, temporary);
  const setup = page.getByTestId("setup-form");
  // A refused password (or a session lost on the way) says so instead of timing out.
  const refused = page.getByTestId("set-password-form").getByRole("alert");
  await expect(setup.or(refused)).toBeVisible();
  if (await refused.isVisible()) throw new Error(`Save my password was refused: ${await refused.innerText()}`);
  await setup.getByTestId("setup-continue").click();
  await setup.getByRole("radiogroup", { name: "Primary role" }).getByRole("button", { name: role }).click();
  await setup.getByTestId("primary-pool-toggle").click();
  await setup.getByTestId("primary-pool-results").getByRole("option").first().click();
  await page.keyboard.press("Escape");
  await setup.getByRole("button", { name: "Finish setup" }).click();
  // The optional Personalise step comes next; skip it.
  await page.getByTestId("personalise-done").click();
  await expect(page.locator("aside").getByTestId("account-current-name")).toHaveText(username);
  return { context, page, username };
}

/**
 * Signs in on /login. Locally a browser without a session is the automatic local owner, who is
 * sent past /login: the guest cookie makes it a visitor first (one account per browser).
 * With `next`, a successful sign-in opens that page instead of the account's start page: going
 * there with page.goto while the start page is still on its way cuts that navigation short, and
 * the app then loads the start page again over the goto (seen in WebKit).
 */
export async function signIn(page: Page, username: string, password: string, next?: string) {
  await keepSessionInWebKit(page.context());
  if (!page.url().startsWith("http")) await page.goto("/public");
  await page.context().addCookies([{ name: "uniiverse_guest", value: "1", url: page.url().split("/").slice(0, 3).join("/") }]);
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  const form = page.getByTestId("login-form");
  await form.getByLabel("Username").fill(username);
  await form.getByLabel("Password").fill(password);
  await form.getByRole("button", { name: "Sign in" }).click();
}

const keeping = new WeakSet<BrowserContext>();

/**
 * WebKit keeps no `Secure` cookie on http://localhost (WebKit bugs 231035 and 281149; Chromium
 * makes an exception for localhost), and the e2e server is a production build, whose session
 * cookies are `Secure`: a member signed in on WebKit would lose the session at the next request.
 * In WebKit only, the cookies a form's response sets are stored again without `Secure`. Production
 * is served over https, where Safari keeps them as they are. The context must be made with
 * webkitMemberOptions: a page the service worker controls sends its requests past Playwright's
 * routing in WebKit, and a sign-in that slips past it loses its cookie.
 */
export async function keepSessionInWebKit(context: BrowserContext) {
  if (context.browser()?.browserType().name() !== "webkit" || keeping.has(context)) return;
  keeping.add(context);
  await storeCookiesWithoutSecure(context);
}

/** Options for a WebKit context a member signs in on: no service worker, so every request is routed (see keepSessionInWebKit). */
export function webkitMemberOptions(browser: Browser): { serviceWorkers?: "block" } {
  return browser.browserType().name() === "webkit" ? { serviceWorkers: "block" } : {};
}

/** Every POST's response is passed on with its cookies stored without `Secure` (any browser). */
export async function storeCookiesWithoutSecure(context: BrowserContext) {
  await context.route(
    () => true,
    async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const response = await route.fetch({ maxRedirects: 0 });
      const headers: Record<string, string> = {};
      for (const { name, value } of response.headersArray()) {
        const key = name.toLowerCase();
        if (key === "set-cookie") await storeWithoutSecure(context, route.request().url(), value);
        // The body handed on is the decoded one, measured again by Playwright.
        else if (key !== "content-encoding" && key !== "content-length" && key !== "transfer-encoding") headers[key] = key in headers ? `${headers[key]}, ${value}` : value;
      }
      await route.fulfill({ status: response.status(), headers, body: await response.body() });
    },
  );
}

async function storeWithoutSecure(context: BrowserContext, url: string, header: string) {
  const [pair = "", ...parts] = header.split(";");
  const at = pair.indexOf("=");
  const name = pair.slice(0, at).trim();
  const value = pair.slice(at + 1).trim();
  const attributes = new Map(parts.map((part) => [part.split("=")[0]!.trim().toLowerCase(), part.slice(part.indexOf("=") + 1).trim()]));
  const path = attributes.get("path") || "/";
  const maxAge = attributes.has("max-age") ? Number(attributes.get("max-age")) : null;
  const expires = maxAge !== null ? Date.now() / 1000 + maxAge : attributes.has("expires") ? Date.parse(attributes.get("expires")!) / 1000 : -1;
  if (expires !== -1 && expires * 1000 <= Date.now()) return context.clearCookies({ name, path });
  const sameSite = attributes.get("samesite")?.toLowerCase() === "strict" ? "Strict" : "Lax";
  await context.addCookies([{ name, value, domain: new URL(url).hostname, path, expires, httpOnly: attributes.has("httponly"), secure: false, sameSite }]);
}
