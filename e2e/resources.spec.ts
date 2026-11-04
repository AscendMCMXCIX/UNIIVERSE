import { expect, test, type Page } from "./test";
import { DEFAULT_RESOURCES } from "../src/domain/resources";
import { closeFilterSheet, openFilterBar } from "./filters";
import { memberContext, view } from "./member-account";

/*
  RESOURCES (Player Mode) and its manager (Admin Mode → Platform Settings → Resources). The browser
  tests run offline. Playwright never lets a test answer a request for /favicon.ico: once any route
  is installed it aborts them itself, unreported. So here every site's icon fails and no request
  leaves the test: each row must fall back to its built-in icon, and the icon it tried is checked
  from its markup, recorded as it is inserted.
*/

async function blockFavicons(page: Page) {
  await page.route(/\/favicon\.ico$/, (route) => route.abort());
  await page.addInitScript(() => {
    const seen: { src: string; referrerPolicy: string; loading: string }[] = [];
    (window as unknown as { __favicons: typeof seen }).__favicons = seen;
    new MutationObserver((changes) => {
      for (const c of changes) for (const n of c.addedNodes) if (n instanceof HTMLImageElement && n.closest("[data-testid=resource]")) seen.push({ src: n.src, referrerPolicy: n.referrerPolicy, loading: n.loading });
    }).observe(document, { childList: true, subtree: true });
  });
}

const rows = (page: Page) => page.getByTestId("resource");
// By the exact title: "OP.GG" starts "OP.GG ARAM", "LoLalytics" starts "LoLalytics Arena".
const row = (page: Page, title: string) => rows(page).filter({ has: page.getByText(title, { exact: true }) });

test.beforeEach(async ({ context, baseURL }) => {
  await view(context, baseURL!, "player");
});

test("every member finds the library in the sidebar: a panel per section, rows that open in a new tab, searchable and filtered by section", async ({ page }) => {
  await blockFavicons(page);
  await page.goto("/resources");
  await expect(page.getByRole("heading", { level: 1, name: "Resources" })).toBeVisible();
  const total = await rows(page).count();
  expect(total).toBeGreaterThanOrEqual(DEFAULT_RESOURCES.length - 2);
  await expect(page.getByTestId("resources-count")).toHaveText(`${total} resources`);
  // The five sections, each a panel; the ones that left the defaults (21 Oct 2026) are gone.
  for (const section of ["League of Legends", "Summoner's Rift", "ARAM", "Arena", "Esports"]) {
    await expect(page.getByRole("heading", { level: 2, name: section, exact: true })).toBeVisible();
  }
  for (const gone of ["Rotating modes", "League Classic", "Teamfight Tactics", "Learning"]) {
    await expect(page.getByRole("heading", { level: 2, name: gone, exact: true })).toHaveCount(0);
  }
  await expect(rows(page).filter({ hasText: "pros.lol" })).toHaveCount(0);
  // Managing the library is Admin Mode's: no control for it here, administrators included (the demo's local account is the Owner).
  await expect(page.getByTestId("resources-manage")).toHaveCount(0);
  // Every row is a link to its site in a new tab, cut off from this page and without its address.
  for (const link of await page.getByTestId("resource-link").all()) {
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
    await expect(link).toHaveAttribute("rel", /noreferrer/);
    expect(await link.getAttribute("href")).toMatch(/^https:\/\//);
  }
  await expect(row(page, "Patch notes").getByTestId("resource-link")).toHaveAttribute("href", "https://www.leagueoflegends.com/en-us/news/tags/patch-notes/");
  // Each row tried its site's own icon, lazily and without a referrer, and shows the built-in
  // icon when that does not load: never a broken image.
  await expect.poll(() => page.evaluate(() => (window as unknown as { __favicons: { src: string }[] }).__favicons.map((f) => f.src))).toContain("https://op.gg/favicon.ico");
  const tried = await page.evaluate(() => (window as unknown as { __favicons: { src: string; referrerPolicy: string; loading: string }[] }).__favicons);
  expect(tried.find((f) => f.src === "https://op.gg/favicon.ico")).toEqual({ src: "https://op.gg/favicon.ico", referrerPolicy: "no-referrer", loading: "lazy" });
  expect(tried.every((f) => /^https:\/\/[^/]+\/favicon\.ico$/.test(f.src) && f.referrerPolicy === "no-referrer")).toBe(true);
  // (Rows far below the fold keep a lazy image that has not started; these are near the top.)
  for (const title of ["League of Legends news", "OP.GG"]) {
    await expect(row(page, title).locator("img")).toHaveCount(0);
    await expect(row(page, title).locator("svg").first()).toBeVisible();
  }

  // Search: title, description or site; then a section.
  await page.getByTestId("resources-search").fill("aram");
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByTestId("resources-count")).toHaveText(`2 of ${total} resources`);
  await page.getByTestId("resources-search").fill("tier list arena");
  await expect(rows(page)).toHaveCount(2);
  await page.getByTestId("resources-search").fill("");
  await openFilterBar(page.getByTestId("resources-filters"));
  await page.getByTestId("resources-section").selectOption("esports");
  await expect(page.getByTestId("resources-section-group")).toHaveCount(1);
  await expect(page.getByTestId("resources-section-group")).toHaveAttribute("data-section", "esports");
  await expect(rows(page)).toHaveCount(2);
  await page.getByTestId("reset-filters").click();
  await expect(rows(page)).toHaveCount(total);

  // Nothing is wider than the screen.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // The sidebar (or the tablet menu, or the phone's account sheet) has it as its own entry.
  await closeFilterSheet(page);
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await expect(page.locator("aside").getByTestId("nav-resources")).toHaveAttribute("aria-current", "page");
  } else if ((page.viewportSize()?.width ?? 0) < 768) {
    await page.getByTestId("account-sheet-button").click();
    await expect(page.getByTestId("account-sheet").getByRole("link", { name: "Resources" })).toHaveAttribute("aria-current", "page");
  } else {
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("dialog", { name: "Menu" }).getByTestId("nav-resources")).toHaveAttribute("aria-current", "page");
  }
});

test("favourites stay on this device, at the top of the page", async ({ page }) => {
  await blockFavicons(page);
  await page.goto("/resources");
  await expect(page.getByTestId("resources-favourites")).toHaveCount(0);
  const star = row(page, "LoLalytics ARAM").getByTestId("resource-favourite");
  await star.click();
  await expect(star).toHaveAttribute("aria-pressed", "true");
  const strip = page.getByTestId("resources-favourites");
  await expect(strip.getByTestId("resources-favourite-link")).toHaveCount(1);
  await expect(strip.getByTestId("resources-favourite-link")).toContainText("LoLalytics ARAM");
  await expect(strip.getByTestId("resources-favourite-link")).toHaveAttribute("target", "_blank");
  await page.reload();
  await expect(page.getByTestId("resources-favourites").getByTestId("resources-favourite-link")).toHaveCount(1);
  await row(page, "LoLalytics ARAM").getByTestId("resource-favourite").click();
  await expect(page.getByTestId("resources-favourites")).toHaveCount(0);
});

test("an administrator keeps the library in Admin Mode; members see each change, and a removed default comes back only when restored", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on the desktop project");
  await blockFavicons(page);
  await page.goto("/admin/resources");
  await expect(page.getByTestId("admin-settings-tabs").getByRole("link")).toHaveText(["Branding", "Previews", "Resources"]);
  const manager = page.getByTestId("resources-manager");
  const managed = (title: string) => manager.getByTestId("managed-resource").filter({ has: page.getByText(title, { exact: true }) });

  // Add: the address is checked as it is typed; an unsafe one cannot be saved.
  const site = `ugg${Date.now().toString(36)}.example.com`;
  await page.getByTestId("resource-add").click();
  const form = page.getByTestId("resource-form");
  await form.getByTestId("resource-title").fill("U.GG test");
  await form.getByTestId("resource-url").fill("javascript:alert(1)");
  await expect(form).toContainText("Only https:// addresses can be added.");
  await expect(form.getByTestId("resource-save")).toBeDisabled();
  await form.getByTestId("resource-url").fill(site);
  await form.getByTestId("resource-description").fill("Builds and tier lists.");
  // Only the sections offered: the ones that left the defaults take nothing new.
  await expect(form.getByTestId("resource-section").locator("option")).toHaveText(["League of Legends", "Summoner's Rift", "ARAM", "Arena", "Esports"]);
  await form.getByTestId("resource-section").selectOption("sr");
  await form.getByTestId("resource-icon").selectOption("stats");
  await form.getByTestId("resource-save").click();
  await expect(managed("U.GG test")).toBeVisible();
  await expect(managed("U.GG test").locator("a")).toHaveAttribute("href", `https://${site}/`);

  // Edit, reorder, hide and remove.
  await managed("LoLalytics Arena").getByTestId("resource-edit").click();
  await page.getByTestId("resource-form").getByTestId("resource-title").fill("LoLalytics Arena builds");
  await page.getByTestId("resource-form").getByTestId("resource-save").click();
  await expect(managed("LoLalytics Arena builds")).toBeVisible();
  await managed("LoLalytics").first().getByTestId("resource-up").click();
  await expect(manager.locator("[data-section='sr'] [data-testid='managed-resource']").first()).toContainText("LoLalytics");
  await managed("Patch notes").getByTestId("resource-hide").click();
  await expect(managed("Patch notes")).toHaveAttribute("data-hidden", "true");
  await managed("Esports news").getByTestId("resource-remove").click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(managed("Esports news")).toHaveCount(0);
  await expect(page.getByTestId("resources-removed").getByTestId("removed-resource")).toContainText(["Esports news"]);

  // Members see exactly that, after a reload too.
  await page.goto("/resources");
  await expect(row(page, "U.GG test")).toBeVisible();
  await expect(row(page, "LoLalytics Arena builds")).toBeVisible();
  await expect(row(page, "Patch notes")).toHaveCount(0);
  await expect(row(page, "Esports news")).toHaveCount(0);
  await expect(page.locator("[data-section='sr'] [data-testid='resource']").first()).toContainText("LoLalytics");
  await page.reload();
  await expect(row(page, "Patch notes")).toHaveCount(0);

  // Back to the defaults as they were: restore, show, rename, move back, remove the added one.
  await page.goto("/admin/resources");
  await page.getByTestId("resources-removed").getByTestId("removed-resource").filter({ hasText: "Esports news" }).getByTestId("resource-restore").click();
  await expect(managed("Esports news")).toBeVisible();
  await expect(page.getByTestId("resources-removed")).toHaveCount(0);
  await managed("Patch notes").getByTestId("resource-hide").click();
  await expect(managed("Patch notes")).toHaveAttribute("data-hidden", "false");
  await managed("LoLalytics Arena builds").getByTestId("resource-edit").click();
  await page.getByTestId("resource-form").getByTestId("resource-title").fill("LoLalytics Arena");
  await page.getByTestId("resource-form").getByTestId("resource-save").click();
  await managed("LoLalytics").first().getByTestId("resource-down").click();
  await expect(manager.locator("[data-section='sr'] [data-testid='managed-resource']").first()).toContainText("OP.GG");
  await managed("U.GG test").getByTestId("resource-remove").click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(managed("U.GG test")).toHaveCount(0);
  // An added resource is not a default: nothing to restore.
  await expect(page.getByTestId("resources-removed")).toHaveCount(0);
});

test("a member who is not an administrator browses the library but cannot manage it", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on the desktop project");
  const { context, page: member } = await memberContext(browser, page);
  try {
    await blockFavicons(member);
    await member.goto("/resources");
    await expect(member.getByRole("heading", { level: 1, name: "Resources" })).toBeVisible();
    await expect(member.getByTestId("resource").first()).toBeVisible();
    await expect(member.getByTestId("resources-manage")).toHaveCount(0);
    await member.goto("/admin/resources");
    await expect(member).not.toHaveURL(/\/admin\/resources$/);
    await expect(member.getByTestId("resources-manager")).toHaveCount(0);
  } finally {
    await context.close();
  }
});
