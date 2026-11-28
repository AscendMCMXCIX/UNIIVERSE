import { expect, test, type Page } from "./test";
import { flowUnchanged, openAt } from "./workspace";

/*
  Admin Mode → Platform Settings → Branding on a desktop window: a sectioned workspace
  (docs/RESPONSIVE.md, "One-screen desktop pages", Branding). A rail of the sections (Name, Images,
  Background, Colours, Public page) with the Save bar at its foot; one section at a time, in the
  address (?section=, an entry each: Back returns to the one before); the old #brand-… addresses and
  /admin/public-access name their section; the form is one, so a draft survives a switch, and the
  rail marks a section holding unsaved changes, and Colours while a check fails. The page's fit at
  the owner's configurations is e2e/one-screen.spec.ts's. Outside the gate (a short window) every
  section is stacked as before. Nothing is saved here: every draft is cancelled.
*/

test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "a desktop window's workspace (desktop project only)"));

const shown = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-ws-section]")].filter((el) => el.getBoundingClientRect().height > 0).map((el) => el.dataset.wsSection));
const link = (page: Page, id: string) => page.locator(`[data-testid=branding-rail-link][data-target=${id}]`);

test("one section at a time from the rail, in the address: Back returns to the one before, and an old address names its section", async ({ page }) => {
  await openAt(page, "/admin/branding", [1440, 900], "expanded", { admin: true });
  await expect(page.getByTestId("branding-rail").getByRole("link")).toHaveText(["Name", "Images", "Background", "Colours", "Public page"]);
  expect(await shown(page)).toEqual(["name"]);
  await expect(link(page, "name")).toHaveAttribute("aria-current", "page");
  // The Save bar stands at the rail's foot, seen from every section.
  await expect(page.getByTestId("branding-actions")).toBeVisible();
  await link(page, "colours").click();
  await expect(page).toHaveURL(/\/admin\/branding\?section=colours$/);
  expect(await shown(page)).toEqual(["colours"]);
  await expect(page.locator("[data-ws-section=colours]")).toBeFocused();
  await expect(page.getByTestId("branding-actions")).toBeVisible();
  await link(page, "public").click();
  expect(await shown(page)).toEqual(["public"]);
  await expect(page.getByTestId("brand-public")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\?section=colours$/);
  expect(await shown(page)).toEqual(["colours"]);
  await page.goBack();
  await expect(page).toHaveURL(/\/admin\/branding$/);
  expect(await shown(page)).toEqual(["name"]);
  await page.goForward();
  expect(await shown(page)).toEqual(["colours"]);
  // A link to a section, an old in-page anchor, and the old Public access address.
  await page.goto("/admin/branding?section=images");
  await expect.poll(() => shown(page)).toEqual(["images"]);
  await page.goto("/admin/branding#brand-backdrop");
  await expect.poll(() => shown(page)).toEqual(["background"]);
  await expect(page).toHaveURL(/\?section=background#brand-backdrop$/);
  await page.goto("/admin/public-access");
  await expect(page).toHaveURL(/\/admin\/branding\?section=public#brand-public$/);
  await expect.poll(() => shown(page)).toEqual(["public"]);
});

test("the section follows a soft navigation to the page's own address, and a Back that leaves the page writes nothing onto the page it goes to", async ({ page }) => {
  await openAt(page, "/admin/previews", [1440, 900], "expanded", { admin: true });
  // Platform Settings' tab: a Next <Link>, so the pages are soft navigations (Next keeps Branding mounted between them).
  await page.getByTestId("admin-settings-tab-branding").click();
  await expect(page).toHaveURL(/\/admin\/branding$/);
  await expect.poll(() => shown(page)).toEqual(["name"]);
  await link(page, "colours").click();
  await expect(page).toHaveURL(/\?section=colours$/);
  expect(await shown(page)).toEqual(["colours"]);
  // The tab again, from Colours: the page's own path with another query shows the first section (the address decides, not the mount).
  await page.getByTestId("admin-settings-tab-branding").click();
  await expect(page).toHaveURL(/\/admin\/branding$/);
  await expect.poll(() => shown(page)).toEqual(["name"]);
  await expect(link(page, "name")).toHaveAttribute("aria-current", "page");
  // Back walks the sections, then leaves the page: nothing is written onto Previews' address.
  await page.goBack();
  await expect(page).toHaveURL(/\?section=colours$/);
  await expect.poll(() => shown(page)).toEqual(["colours"]);
  await page.goBack();
  await expect(page).toHaveURL(/\/admin\/branding$/);
  await expect.poll(() => shown(page)).toEqual(["name"]);
  await page.goBack();
  await expect(page).toHaveURL(/\/admin\/previews$/);
  await expect(page.getByTestId("branding-panel")).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(new URL(page.url()).search).toBe("");
});

test("the form is one: a draft survives a switch, the rail marks unsaved changes and a failing check, and Cancel drops them", async ({ page }) => {
  await openAt(page, "/admin/branding", [1440, 900], "expanded", { admin: true });
  await expect(page.getByTestId("brand-appBackground")).toHaveAttribute("data-ready", "true");
  await expect(page.getByTestId("branding-rail-unsaved")).toHaveCount(0);
  // A draft in Name: marked, kept through a switch to Colours and back.
  await page.locator("#brand-tagline").fill("A draft tagline");
  await expect(link(page, "name").getByTestId("branding-rail-unsaved")).toBeVisible();
  await expect(link(page, "name")).toContainText("unsaved changes");
  await link(page, "colours").click();
  // An unreadable background: Colours is marked with an error, and Save waits for it.
  await page.getByRole("textbox", { name: "Background hex" }).fill("#ffffff");
  await expect(link(page, "colours").getByTestId("branding-rail-error")).toBeVisible();
  await expect(link(page, "colours")).toContainText("has an error");
  await expect(page.getByTestId("branding-save")).toBeDisabled();
  await link(page, "name").click();
  await expect(page.locator("#brand-tagline")).toHaveValue("A draft tagline");
  // Cancel drops every draft: no marker is left.
  await page.getByTestId("branding-cancel").click();
  await expect(page.locator("#brand-tagline")).toHaveValue("");
  await expect(page.getByTestId("branding-rail-unsaved")).toHaveCount(0);
  await expect(page.getByTestId("branding-rail-error")).toHaveCount(0);
});

test("outside the workspace every section is stacked as before: no rail, the Save bar after Colours, the Public team page 20px under it", async ({ page }) => {
  await flowUnchanged(page, "/admin/branding", { admin: true });
  await openAt(page, "/admin/branding", [1366, 640], "expanded", { admin: true });
  await expect(page.getByTestId("branding-rail")).toBeHidden();
  expect(await shown(page)).toEqual(["name", "images", "background", "colours", "public"]);
  const gap = await page.evaluate(() => document.querySelector("[data-testid=brand-public]")!.getBoundingClientRect().top - document.querySelector("[data-testid=branding-actions]")!.getBoundingClientRect().bottom);
  expect(Math.round(gap)).toBe(20);
});
