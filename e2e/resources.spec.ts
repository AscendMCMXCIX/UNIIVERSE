import { expect, test, type Locator, type Page } from "./test";
import { DEFAULT_RESOURCES } from "../src/domain/resources";
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
/** A segment of the Library's index: All, Favourites or a section (by its key). */
const segment = (page: Page, key: string) => page.getByTestId(`resources-index-${key}`);
/** Chooses a segment as a finger would on a touch screen, with a click on a desktop; again until the page is interactive (a tap before hydration does nothing). */
async function choose(page: Page, target: Locator) {
  const touch = (page.viewportSize()?.width ?? 1440) < 1024;
  await expect(async () => {
    if ((await target.getAttribute("aria-checked")) !== "true") await (touch ? target.tap({ timeout: 2_000 }) : target.click({ timeout: 2_000 }));
    await expect(target).toHaveAttribute("aria-checked", "true", { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

test.beforeEach(async ({ context, baseURL }) => {
  await view(context, baseURL!, "player");
});

test("every member finds the library in the sidebar: grouped by section, rows that open in a new tab, searchable, and an index that filters by section", async ({ page }) => {
  await blockFavicons(page);
  await page.goto("/resources");
  await expect(page.getByRole("heading", { level: 1, name: "Resources" })).toBeVisible();
  const total = await rows(page).count();
  expect(total).toBeGreaterThanOrEqual(DEFAULT_RESOURCES.length - 2);
  // The live count at the index's end (left to screen readers on a phone, where each segment says it).
  await expect(page.getByTestId("resources-count")).toHaveText(`${total} resources`);
  // The five sections, each under an h2; the ones that left the defaults (21 Oct 2026) are gone.
  for (const section of ["League of Legends", "Summoner's Rift", "ARAM", "Arena", "Esports"]) {
    await expect(page.getByRole("heading", { level: 2, name: section, exact: true })).toBeVisible();
  }
  for (const gone of ["Rotating modes", "League Classic", "Teamfight Tactics", "Learning"]) {
    await expect(page.getByRole("heading", { level: 2, name: gone, exact: true })).toHaveCount(0);
  }
  await expect(rows(page).filter({ hasText: "pros.lol" })).toHaveCount(0);
  // The index: All, Favourites and the five sections, one choice, each with its count; All chosen.
  const index = page.getByTestId("resources-index");
  await expect(index).toHaveAttribute("role", "radiogroup");
  await expect(index.getByRole("radio")).toHaveCount(7);
  await expect(segment(page, "all")).toHaveAttribute("aria-checked", "true");
  await expect(segment(page, "all").getByTestId("resources-index-count")).toHaveText(String(total));
  await expect(segment(page, "league").getByTestId("resources-index-count")).toHaveText("3");
  // The Filters sheet, the favourites row and the count line are gone.
  await expect(page.getByTestId("resources-filters")).toHaveCount(0);
  await expect(page.getByTestId("filter-toggle")).toHaveCount(0);
  await expect(page.getByTestId("resources-favourites")).toHaveCount(0);
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
  // The host follows the title, then ↗.
  await expect(row(page, "OP.GG").getByTestId("resource-host")).toHaveText("op.gg↗");
  // Each row tried its site's own icon, lazily and without a referrer, and shows the built-in
  // icon when that does not load: never a broken image.
  await expect.poll(() => page.evaluate(() => (window as unknown as { __favicons: { src: string }[] }).__favicons.map((f) => f.src))).toContain("https://op.gg/favicon.ico");
  const tried = await page.evaluate(() => (window as unknown as { __favicons: { src: string; referrerPolicy: string; loading: string }[] }).__favicons);
  expect(tried.find((f) => f.src === "https://op.gg/favicon.ico")).toEqual({ src: "https://op.gg/favicon.ico", referrerPolicy: "no-referrer", loading: "lazy" });
  expect(tried.every((f) => /^https:\/\/[^/]+\/favicon\.ico$/.test(f.src) && f.referrerPolicy === "no-referrer")).toBe(true);
  // (Rows far below the fold keep a lazy image that has not started; these are near the top.)
  // The stand-in is the host's initial on its own tinted tile, not one generic mark for every site.
  for (const [title, initial] of [["League of Legends news", "L"], ["OP.GG", "O"]] as const) {
    await expect(row(page, title).locator("img")).toHaveCount(0);
    await expect(row(page, title).getByTestId("resource-icon-standin")).toHaveText(initial);
  }

  // Search: title, description or site; the index's counts follow it.
  await page.getByTestId("resources-search").fill("aram");
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByTestId("resources-count")).toHaveText(`2 of ${total} resources`);
  await expect(segment(page, "all").getByTestId("resources-index-count")).toHaveText("2");
  await expect(segment(page, "aram").getByTestId("resources-index-count")).toHaveText("2");
  await expect(segment(page, "league").getByTestId("resources-index-count")).toHaveText("0");
  await page.getByTestId("resources-search").fill("tier list arena");
  await expect(rows(page)).toHaveCount(2);
  await page.getByTestId("resources-search").fill("");

  // A section, by tapping its segment (a click on a desktop): only its rows, under its heading.
  await choose(page, segment(page, "esports"));
  await expect(segment(page, "all")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("resources-section-group")).toHaveCount(1);
  await expect(page.getByTestId("resources-section-group")).toHaveAttribute("data-section", "esports");
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByTestId("resources-count")).toHaveText(`2 of ${total} resources`);
  // A search with nothing in the chosen section says so.
  await page.getByTestId("resources-search").fill("aram");
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByTestId("resources-nothing")).toBeVisible();
  await page.getByTestId("resources-search").fill("");
  await choose(page, segment(page, "all"));
  await expect(rows(page)).toHaveCount(total);

  // Nothing is wider than the screen.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // The sidebar (or the tablet menu, or the phone's account screen) has it as its own entry.
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

test("the layout: one panel on a phone, a panel per section packed into columns wider; the title wraps, the host gives way", async ({ page }, info) => {
  await blockFavicons(page);
  await page.goto("/resources");
  const list = page.getByTestId("resources-list");
  await expect(list).toBeVisible();
  const groups = page.getByTestId("resources-section-group");
  await expect(groups).toHaveCount(5);
  const columns = await list.evaluate((el) => getComputedStyle(el).columnCount);
  if (info.project.name === "phone") {
    // One panel: the list itself is the surface, its sections separated by hairlines.
    expect(columns).toBe("auto");
    expect(await list.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("1px");
    expect(await groups.first().evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("0px");
  } else {
    // Two columns on a tablet, three from xl; each section a panel kept whole.
    expect(columns).toBe(info.project.name === "desktop" ? "3" : "2");
    expect(await groups.first().evaluate((el) => [getComputedStyle(el).borderTopWidth, getComputedStyle(el).breakInside])).toEqual(["1px", "avoid"]);
    // From lg the search, the index and the count share one row.
    if (info.project.name === "desktop") {
      const search = (await page.getByTestId("resources-search").boundingBox())!;
      const count = (await page.getByTestId("resources-count").boundingBox())!;
      expect(Math.abs(search.y + search.height / 2 - (count.y + count.height / 2))).toBeLessThanOrEqual(4);
    }
  }
  // A title is whole: it wraps rather than being cut; the host is the one cut short, and ↗ always shows.
  const cut = await page.getByTestId("resource-title").evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length);
  expect(cut).toBe(0);
  for (const host of await page.getByTestId("resource-host").all()) await expect(host).toContainText("↗");
});

test("favourites: the ★ segment is drawn with the page, its count fills from this browser without moving the list, and it filters to the starred sites", async ({ page }) => {
  await blockFavicons(page);
  // The server's page: the ★ segment is there with an empty slot of the count's width.
  const html = await (await page.request.get("/resources")).text();
  expect(html).toContain('data-testid="resources-index-favourites"');
  // Its count's slot is empty there: favourites are read from the browser.
  expect(html).toMatch(/data-testid="resources-index-favourites"[^]*?data-testid="resources-index-count"><\/span>/);
  await page.goto("/resources");
  const star = segment(page, "favourites");
  const count = star.getByTestId("resources-index-count");
  // Once the page has read this browser: none yet.
  await expect(count).toHaveText("0");
  await expect(star).toBeVisible();
  // Where the first row sits in the page (not the window: tapping a star lower down scrolls it).
  const firstTop = () => rows(page).first().evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  const before = { star: (await star.boundingBox())!, first: await firstTop() };
  const toggle = row(page, "LoLalytics ARAM").getByTestId("resource-favourite");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(count).toHaveText("1");
  // Nothing moved: the segment keeps its width, the list its place.
  const after = { star: (await star.boundingBox())!, first: await firstTop() };
  expect(Math.abs(after.star.width - before.star.width), "the ★ segment keeps its width").toBeLessThanOrEqual(0.5);
  expect(Math.abs(after.first - before.first), "the list stays where it was").toBeLessThanOrEqual(0.5);
  // The ★ segment: only the starred sites.
  await choose(page, star);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("LoLalytics ARAM");
  await expect(rows(page).first().getByTestId("resource-link")).toHaveAttribute("target", "_blank");
  // Kept in this browser: after a reload the count is back, and the list was never moved to make room.
  await page.reload();
  await expect(segment(page, "favourites").getByTestId("resources-index-count")).toHaveText("1");
  await expect(segment(page, "all")).toHaveAttribute("aria-checked", "true");
  expect(Math.abs((await firstTop()) - before.first), "the list is where it was before any favourite").toBeLessThanOrEqual(0.5);
  // Unstarred: the ★ segment says what the star does.
  await choose(page, segment(page, "favourites"));
  await row(page, "LoLalytics ARAM").getByTestId("resource-favourite").click();
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByTestId("resources-favourites-empty")).toContainText("star a site");
  await expect(segment(page, "favourites").getByTestId("resources-index-count")).toHaveText("0");
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
