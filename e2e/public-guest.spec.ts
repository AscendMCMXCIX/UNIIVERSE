import { expect, test, type Browser, type Page } from "@playwright/test";

/*
  THE PUBLIC TEAM PAGE. A visitor is a browser without an account (locally: the guest cookie, which
  turns the automatic local owner off). /public is always open: no switch, no banner, no per-member
  choice. It shows the lineup and each role's substitute under their display names, with nothing
  that manages the team, and every link on it stays public. Every members' page, API and picture
  stays closed to visitors.
*/

const GUEST_COOKIE = "uniiverse_guest";
const PRIVATE_PAGES = ["/team", "/players", "/matches", "/overview", "/overview/blocks", "/overview/matches", "/overview/matchups", "/overview/accounts", "/leaderboards", "/clash", "/settings", "/admin/people", "/admin/public-access"];

async function guestPage(browser: Browser, baseURL: string, viewport?: { width: number; height: number }): Promise<Page> {
  const context = await browser.newContext(viewport ? { viewport } : {});
  await context.addCookies([{ name: GUEST_COOKIE, value: "1", url: baseURL }]);
  return context.newPage();
}

/** Every same-site link on the page, as paths. */
const linksOn = (page: Page) => page.locator("a[href]").evaluateAll((as) => [...new Set(as.map((a) => new URL((a as HTMLAnchorElement).href)).filter((u) => u.origin === location.origin).map((u) => u.pathname + u.search))]);

test("open to everyone: the lineup by display name, no management controls, no banner", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "the phone and tablet layout is checked below");
  const guest = await guestPage(browser, baseURL!);
  const response = await guest.goto("/");
  await expect(guest).toHaveURL(/\/public$/);
  // A private page for each visitor: never stored by a shared cache.
  expect(response?.headers()["cache-control"] ?? "").toMatch(/private|no-store/);
  await expect(guest.getByTestId("team-name")).toBeVisible();
  await expect(guest.getByTestId("lineup-cell")).toHaveCount(5);
  await expect(guest.getByTestId("team-subtitle")).toHaveText("Main lineup");
  // Every role shows its player, by display name; no placeholders, no switch or preview banner.
  for (const role of ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"]) await expect(guest.getByTestId(`lineup-row-${role}`)).toHaveAttribute("data-player-name", /Demo/);
  await expect(guest.locator('[data-testid^="private-member-"]')).toHaveCount(0);
  await expect(guest.getByTestId("public-preview-banner")).toHaveCount(0);
  for (const id of ["edit-lineup", "lineup-suggestions", "start-substitute"]) await expect(guest.getByTestId(id)).toHaveCount(0);
  await expect(guest.locator('[data-testid^="substitute-menu-"]')).toHaveCount(0);
  await expect(guest.getByTestId("public-sign-in")).toBeVisible();
  await expect(guest.getByTestId("public-legal")).toContainText("isn't endorsed by Riot Games");
  // Nothing private is in the page: no members' pages or pictures, Riot IDs, ranks or sign-in names.
  const html = await guest.content();
  expect(html).not.toMatch(/\/players\/[0-9a-f-]{36}|\/api\/avatars\/|\/api\/card-banners\/|#OCE|"rank":\{|demo-/);
  await guest.context().close();
});

test("a role's substitute is on the back of its card, for visitors too; turning it saves nothing", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name === "tablet", "runs on phone and desktop");
  const guest = await guestPage(browser, baseURL!, info.project.name === "phone" ? { width: 375, height: 667 } : undefined);
  await guest.goto("/public");
  const top = guest.getByTestId("lineup-row-TOP");
  await top.scrollIntoViewIfNeeded();
  const turn = top.getByTestId("flip-to-substitute");
  await expect(turn).toBeVisible();
  // A role without a substitute has no turn control.
  await expect(guest.getByTestId("lineup-row-MID").getByTestId("flip-to-substitute")).toHaveCount(0);
  const posts: string[] = [];
  guest.on("request", (r) => {
    if (r.method() === "POST") posts.push(r.url());
  });
  await turn.click();
  const sub = guest.getByTestId("lineup-sub-TOP");
  await expect(sub).toBeVisible();
  await expect(sub).toHaveAttribute("data-player-name", "Demo Sub (Top)");
  await expect(sub.getByTestId("start-substitute")).toHaveCount(0);
  await sub.getByTestId("flip-back").click();
  await expect(top.getByTestId("flip-to-substitute")).toBeVisible();
  expect(posts).toEqual([]);
  await guest.context().close();
});

test("every link on the public page, and in a player's panel, stays public", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "one pass is enough for links");
  const guest = await guestPage(browser, baseURL!);
  await guest.goto("/public");
  const links = new Set(await linksOn(guest));
  // A player's panel (the pool, viewed only): no profile or edit link for visitors.
  await guest.getByTestId("lineup-row-MID").getByTestId("open-player-detail").click();
  const panel = guest.getByTestId("player-detail");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("edit-pool-on-profile")).toHaveCount(0);
  for (const l of await linksOn(guest)) links.add(l);
  await guest.keyboard.press("Escape");
  const api = guest.context().request;
  for (const path of links) {
    if (path === "/login" || path.startsWith("/login?")) continue;
    const res = await api.get(path, { maxRedirects: 0 });
    const to = res.headers()["location"] ?? "";
    expect(to, `${path} sends a visitor to ${to}`).not.toMatch(/\/login/);
    expect(res.status(), path).toBeLessThan(400);
  }
  await guest.context().close();
});

test("members' pages, APIs and pictures stay closed to visitors; sign in is one step away", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "one pass is enough for access rules");
  const guest = await guestPage(browser, baseURL!);
  for (const path of PRIVATE_PAGES) {
    await guest.goto(path);
    await expect(guest, path).toHaveURL(/\/login/);
  }
  const api = guest.context().request;
  for (const path of ["/api/avatars/00000000-0000-4000-8000-000000000000?v=1", "/api/card-banners/00000000-0000-4000-8000-000000000000?v=1"]) {
    expect((await api.get(path)).status(), path).toBe(401);
  }
  // Clash Scout's champion prints are for members only.
  expect((await api.get("/api/clash/champion-prints?v=1")).status()).toBe(404);
  // Public pictures: only for the players on the page.
  expect((await api.get("/api/public/avatars/00000000-0000-4000-8000-000000000000")).status()).toBe(404);
  await guest.goto("/public");
  await guest.getByTestId("public-sign-in").click();
  await expect(guest).toHaveURL(/\/login/);
  await guest.getByTestId("login-public-link").click();
  await expect(guest).toHaveURL(/\/public$/);
  await guest.context().close();
});

test("members see the same page, and no longer find a public switch or opt-in", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one pass is enough");
  await page.goto("/public");
  await expect(page.getByTestId("team-name")).toBeVisible();
  await expect(page.getByTestId("public-preview-banner")).toHaveCount(0);
  await expect(page.getByTestId("public-open-app")).toBeVisible();
  await expect(page.getByTestId("lineup-row-TOP")).toHaveAttribute("data-player-name", /Demo/);
  await page.goto("/settings");
  await expect(page.getByTestId("public-profile-panel")).toHaveCount(0);
  // The old Admin address opens the public page itself.
  await page.goto("/admin/public-access");
  await expect(page).toHaveURL(/\/public$/);
});

test("the public page fits a phone and a tablet", async ({ page, browser, baseURL }, info) => {
  test.skip(info.project.name === "desktop", "desktop is covered above");
  const guest = await guestPage(browser, baseURL!, page.viewportSize() ?? undefined);
  await guest.goto("/public");
  await expect(guest.getByTestId("team-name")).toBeVisible();
  await expect(guest.getByTestId("public-sign-in")).toBeVisible();
  const overflow = await guest.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await guest.context().close();
});
