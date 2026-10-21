import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_RESOURCES } from "../src/domain/resources";
import { openFilterBar } from "./filters";
import { memberContext, view } from "./member-account";
import { png } from "./png";

/*
  RESOURCES (Player Mode) and its manager (Admin Mode → Platform Settings → Resources). The browser
  tests run offline: each site's favicon is answered here (a small PNG for some sites, a failure for
  the others), so a row shows either the site's icon or the fallback, and no request leaves the test.
*/

const FAVICON_OK = ["op.gg", "lolalytics.com"];

async function answerFavicons(page: Page) {
  await page.route(/^https:\/\/[^/]+\/favicon\.ico$/, (route) => {
    const host = new URL(route.request().url()).hostname;
    return FAVICON_OK.includes(host) ? route.fulfill({ status: 200, contentType: "image/png", body: png(16, 16) }) : route.abort();
  });
}

const rows = (page: Page) => page.getByTestId("resource");
// By the exact title: "Patch notes" is also in the TFT news description, "OP.GG" starts "OP.GG ARAM".
const row = (page: Page, title: string) => rows(page).filter({ has: page.getByText(title, { exact: true }) });

test.beforeEach(async ({ context, baseURL }) => {
  await view(context, baseURL!, "player");
});

test("every member finds the library in the sidebar: sections of compact rows that open in a new tab, searchable and filtered by section", async ({ page }) => {
  await answerFavicons(page);
  await page.goto("/resources");
  await expect(page.getByRole("heading", { level: 1, name: "Resources" })).toBeVisible();
  const total = await rows(page).count();
  expect(total).toBeGreaterThanOrEqual(DEFAULT_RESOURCES.length - 2);
  await expect(page.getByTestId("resources-count")).toHaveText(`${total} resources`);
  for (const section of ["League of Legends", "Summoner's Rift", "ARAM", "Arena", "Rotating modes", "League Classic", "Teamfight Tactics", "Esports", "Learning"]) {
    await expect(page.getByRole("heading", { level: 2, name: section, exact: true })).toBeVisible();
  }
  // Every row is a link to its site in a new tab, cut off from this page and without its address.
  for (const link of await page.getByTestId("resource-link").all()) {
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
    await expect(link).toHaveAttribute("rel", /noreferrer/);
    expect(await link.getAttribute("href")).toMatch(/^https:\/\//);
  }
  await expect(row(page, "Patch notes").getByTestId("resource-link")).toHaveAttribute("href", "https://www.leagueoflegends.com/en-us/news/tags/patch-notes/");
  // The site's own icon where it loads (without a referrer), the fallback where it does not.
  const opgg = row(page, "OP.GG").first().locator("img");
  await expect(opgg).toHaveAttribute("src", "https://op.gg/favicon.ico");
  await expect(opgg).toHaveAttribute("referrerpolicy", "no-referrer");
  await expect(row(page, "MetaTFT").locator("img")).toHaveCount(0);
  await expect(row(page, "MetaTFT").locator("svg").first()).toBeVisible();

  // Search: title, description or site; then a section.
  await page.getByTestId("resources-search").fill("aram");
  await expect(rows(page)).toHaveCount(3);
  await expect(page.getByTestId("resources-count")).toHaveText(`3 of ${total} resources`);
  await page.getByTestId("resources-search").fill("tier list arena");
  await expect(rows(page)).toHaveCount(2);
  await page.getByTestId("resources-search").fill("");
  await openFilterBar(page.getByTestId("resources-filters"));
  await page.getByTestId("resources-section").selectOption("tft");
  await expect(page.getByTestId("resources-section-group")).toHaveCount(1);
  await expect(page.getByTestId("resources-section-group")).toHaveAttribute("data-section", "tft");
  await expect(rows(page)).toHaveCount(3);
  await page.getByTestId("reset-filters").click();
  await expect(rows(page)).toHaveCount(total);

  // Nothing is wider than the screen.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // The sidebar (or the phone menu) has it as its own entry.
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await expect(page.locator("aside").getByTestId("nav-resources")).toHaveAttribute("aria-current", "page");
  } else {
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("dialog", { name: "Menu" }).getByTestId("nav-resources")).toHaveAttribute("aria-current", "page");
  }
});

test("favourites stay on this device, at the top of the page", async ({ page }) => {
  await answerFavicons(page);
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
  await answerFavicons(page);
  await page.goto("/resources");
  await page.getByTestId("resources-manage").click();
  await expect(page).toHaveURL(/\/admin\/resources$/);
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
  await form.getByTestId("resource-section").selectOption("sr");
  await form.getByTestId("resource-icon").selectOption("stats");
  await form.getByTestId("resource-save").click();
  await expect(managed("U.GG test")).toBeVisible();
  await expect(managed("U.GG test").locator("a")).toHaveAttribute("href", `https://${site}/`);

  // Edit, reorder, hide and remove.
  await managed("pros.lol").getByTestId("resource-edit").click();
  await page.getByTestId("resource-form").getByTestId("resource-title").fill("pros.lol builds");
  await page.getByTestId("resource-form").getByTestId("resource-save").click();
  await expect(managed("pros.lol builds")).toBeVisible();
  await managed("LoLalytics").first().getByTestId("resource-up").click();
  await expect(manager.locator("[data-section='sr'] [data-testid='managed-resource']").first()).toContainText("LoLalytics");
  await managed("Patch notes").getByTestId("resource-hide").click();
  await expect(managed("Patch notes")).toHaveAttribute("data-hidden", "true");
  await managed("MetaTFT").getByTestId("resource-remove").click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(managed("MetaTFT")).toHaveCount(0);
  await expect(page.getByTestId("resources-removed").getByTestId("removed-resource")).toContainText(["MetaTFT"]);

  // Members see exactly that, after a reload too.
  await page.goto("/resources");
  await expect(row(page, "U.GG test")).toBeVisible();
  await expect(row(page, "pros.lol builds")).toBeVisible();
  await expect(row(page, "Patch notes")).toHaveCount(0);
  await expect(row(page, "MetaTFT")).toHaveCount(0);
  await expect(page.locator("[data-section='sr'] [data-testid='resource']").first()).toContainText("LoLalytics");
  await page.reload();
  await expect(row(page, "Patch notes")).toHaveCount(0);

  // Back to the defaults as they were: restore, show, rename, move back, remove the added one.
  await page.goto("/admin/resources");
  await page.getByTestId("resources-removed").getByTestId("removed-resource").filter({ hasText: "MetaTFT" }).getByTestId("resource-restore").click();
  await expect(managed("MetaTFT")).toBeVisible();
  await expect(page.getByTestId("resources-removed")).toHaveCount(0);
  await managed("Patch notes").getByTestId("resource-hide").click();
  await expect(managed("Patch notes")).toHaveAttribute("data-hidden", "false");
  await managed("pros.lol builds").getByTestId("resource-edit").click();
  await page.getByTestId("resource-form").getByTestId("resource-title").fill("pros.lol");
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
    await answerFavicons(member);
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
