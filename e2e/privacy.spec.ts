import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "./test";

/*
  THE PRIVACY NOTICE. /privacy is open without an account (a former member can read it), linked
  from sign-in, the public team page and Settings, and fits a phone held either way without
  sideways scrolling. It names the one privacy contact (a Discord username, shown in full and
  copied with one tap, never a link), says what is stored, who sees it and how long, and carries
  the approved wording on permanent removal and backups.
*/

const GUEST_COOKIE = "uniiverse_guest";
const fitsWidth = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("is public, linked from sign-in, and lists what is stored, who sees it and how long", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name === "tablet", "runs on phone and desktop");
  const context = await browser.newContext(info.project.name === "phone" ? { viewport: { width: 375, height: 667 } } : {});
  await context.addCookies([{ name: GUEST_COOKIE, value: "1", url: baseURL! }]);
  const guest = await context.newPage();
  await guest.goto("/login");
  await guest.getByTestId("login-privacy-link").click();
  await expect(guest).toHaveURL(/\/privacy$/);
  await expect(guest.getByRole("heading", { name: "Privacy", level: 1 })).toBeVisible();
  const stored = guest.getByTestId("privacy-stored").locator(":scope > li");
  await expect(stored).toHaveCount(14);
  await expect(stored.filter({ hasText: "Page speed counts" })).toContainText("Nothing identifies you");
  // Clash Scout is retired: the scouts saved before then stay listed until the clean-up deletes them.
  await expect(stored.filter({ hasText: "Clash scouts saved before Clash Scout was retired" })).toContainText("Nobody in the app");
  await expect(stored.filter({ hasText: "Clash scouts saved before Clash Scout was retired" })).toContainText("Permanent removal already empties");
  await expect(guest.getByText("jsDelivr")).toHaveCount(0);
  await expect(stored.filter({ hasText: "Social links, only if you add them" })).toContainText("Only you, until you switch on Show publicly for a link: then team members and the public team page");
  await expect(stored.first()).toContainText("scrypt hash");
  await expect(guest.getByText("Failed sign-ins")).toBeVisible();
  await expect(stored.nth(1)).toContainText("deleted automatically about a week later");
  // Shared match records outlive deleted profiles; permanent removal takes the person out of them.
  await expect(guest.getByTestId("privacy-stored")).toContainText("a game stays stored after the profiles that played it are deleted");
  await expect(stored.filter({ hasText: "Removal records" })).toContainText("Never a name, Riot ID or PUUID");
  await expect(guest.getByText("It never shows usernames, Riot IDs, ranks or statistics.")).toBeVisible();
  expect(await fitsWidth(guest)).toBe(true);
  await context.close();
});

test("names the Discord privacy contact in full, copies it with one tap, and never links to Discord", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name === "tablet", "runs on phone and desktop");
  const context = await browser.newContext(info.project.name === "phone" ? { viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true } : {});
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL! });
  await context.addCookies([{ name: GUEST_COOKIE, value: "1", url: baseURL! }]);
  const guest = await context.newPage();
  await guest.goto("/privacy");
  const contact = guest.getByTestId("privacy-contact");
  await expect(guest.getByRole("heading", { name: "Contact us about your privacy", level: 2 })).toBeVisible();
  await expect(contact.getByTestId("privacy-discord")).toHaveText("@ascend1999");
  await expect(contact).toContainText("You can request access to, correction of, or permanent removal of your personal information stored by");
  await expect(contact).toContainText("You don't need an active");
  await expect(contact).toContainText("If we're not already connected on Discord, send a friend request to ascend1999. Once accepted, you can privately message the team owner.");
  await expect(contact).toContainText("We may need to verify your identity before processing requests involving personal information. Never share passwords or authentication credentials. All privacy requests are handled privately.");
  // A username alone proves nothing, and the page says how a request is checked and who cannot use this route.
  await expect(guest.getByTestId("privacy-verification")).toContainText("A Discord username on its own does not show who someone is.");
  await expect(guest.getByTestId("privacy-verification")).toContainText("someone without a usable Discord account cannot make one this way");
  // No invented Discord address: nothing on the page links to Discord.
  await expect(guest.locator('a[href*="discord"]')).toHaveCount(0);

  const copy = guest.getByTestId("privacy-discord-copy");
  await expect(copy).toHaveAccessibleName("Copy the Discord username ascend1999");
  await copy.click();
  await expect(copy).toHaveAttribute("data-copied", "true");
  await expect(guest.getByText("Discord username copied.")).toBeVisible();
  expect(await guest.evaluate(() => navigator.clipboard.readText())).toBe("ascend1999");
  expect(await fitsWidth(guest)).toBe(true);
  await context.close();
});

test("carries the approved wording on permanent removal and backups, and its index reaches every section", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one size is enough for the wording");
  await page.goto("/privacy");
  const removal = page.getByTestId("privacy-removal");
  await expect(page.getByRole("heading", { name: "Permanent removal of personal information", level: 2 })).toBeVisible();
  await expect(removal).toContainText("This process removes their account, profile, linked Riot identities and associated personal information. Shared gameplay records may be preserved only where the information can be sufficiently de-identified. Records that cannot be safely retained without identifying the person will be deleted.");
  await expect(removal).toContainText("Previously created encrypted backups may temporarily retain information after deletion. Backup retention, offline copies and restoration procedures are managed to prevent previously erased information from being inadvertently restored.");
  await expect(removal).toContainText("Removal cannot be undone.");
  await expect(page.getByTestId("privacy-backups")).toContainText(
    "An encrypted database backup is scheduled weekly. Each successful backup is tested by restoring it into a temporary database and is retained for 28 days as a private GitHub Actions artifact. Information removed from the live database may remain in existing encrypted backups until those backups expire.",
  );
  await expect(page.getByTestId("privacy-clash-scout")).toContainText("They will be deleted in a database clean-up once a recent backup has been checked.");

  const index = page.getByTestId("privacy-index").getByRole("link");
  await expect(index).toHaveCount(9);
  for (const link of await index.all()) {
    const target = (await link.getAttribute("href"))!;
    await expect(page.locator(target)).toHaveCount(1);
  }
  await page.getByTestId("privacy-index").getByRole("link", { name: "Backups" }).click();
  await expect(page).toHaveURL(/#backups$/);
  await expect(page.getByRole("heading", { name: "Backups", level: 2 })).toBeInViewport();
});

test("has no critical or serious accessibility violations, on a phone or a desktop", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name === "tablet", "runs on phone and desktop");
  const context = await browser.newContext(info.project.name === "phone" ? { viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true } : {});
  await context.addCookies([{ name: GUEST_COOKIE, value: "1", url: baseURL! }]);
  const guest = await context.newPage();
  await guest.goto("/privacy");
  await guest.waitForLoadState("networkidle");
  const result = await new AxeBuilder({ page: guest }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const blocking = result.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  expect(blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")})`)).toEqual([]);
  await context.close();
});

test("fits a phone held sideways, with finger-sized controls", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "the phone layout");
  const context = await browser.newContext({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });
  await context.addCookies([{ name: GUEST_COOKIE, value: "1", url: baseURL! }]);
  const guest = await context.newPage();
  await guest.goto("/privacy");
  await expect(guest.getByTestId("privacy-contact")).toBeVisible();
  expect(await fitsWidth(guest)).toBe(true);
  const copyBox = await guest.getByTestId("privacy-discord-copy").boundingBox();
  expect(copyBox!.height).toBeGreaterThanOrEqual(44);
  const indexBox = await guest.getByTestId("privacy-index").getByRole("link").first().boundingBox();
  expect(indexBox!.height).toBeGreaterThanOrEqual(40);
  await context.close();
});

test("the public team page and Settings link to it", async ({ page, browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "one size is enough for a link");
  await page.goto("/settings");
  const link = page.getByTestId("settings-privacy-link");
  await expect(link).toHaveAttribute("href", "/privacy");
  await link.click();
  await expect(page).toHaveURL(/\/privacy$/);

  const context = await browser.newContext();
  await context.addCookies([{ name: GUEST_COOKIE, value: "1", url: baseURL! }]);
  const guest = await context.newPage();
  await guest.goto("/public");
  await guest.getByTestId("public-privacy-link").click();
  await expect(guest).toHaveURL(/\/privacy$/);
  await context.close();
});

test("browser storage Clash Scout left behind is deleted on the next visit, from any page", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "browser storage is the same at every size");
  await page.goto("/privacy");
  // What earlier versions left: an unsaved scout in localStorage, and the text recogniser's IndexedDB cache.
  await page.evaluate(async () => {
    localStorage.setItem("uniiverse.clash-scout.draft.v1", JSON.stringify({ teamId: "t", content: { opponentName: "Night Owls Gaming" }, shots: [], updatedAt: "" }));
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("keyval-store");
      open.onupgradeneeded = () => open.result.createObjectStore("keyval");
      open.onsuccess = () => (open.result.close(), resolve());
      open.onerror = () => reject(open.error);
    });
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(async () => ({ draft: localStorage.getItem("uniiverse.clash-scout.draft.v1"), cache: (await indexedDB.databases()).some((d) => d.name === "keyval-store") })))
    .toEqual({ draft: null, cache: false });
});
