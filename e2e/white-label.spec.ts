import { expect, test } from "./test";
import { view } from "./member-account";
import { NEUTRAL_NAME } from "../src/domain/branding";

/*
  White-label: the app's own name is a branding setting (Admin → Branding → App name). A new
  install (the in-memory demo) starts with the neutral name; whatever the Owner sets shows in tab
  titles, the welcome wording and Riot's notice, and "Reset colours to defaults" never renames the
  install. The test puts the demo's name back at the end, so other tests see it as it was.
*/

async function saveBranding(page: import("@playwright/test").Page) {
  await page.getByTestId("branding-save").click();
  await expect(page.getByText("Branding saved.")).toBeVisible();
}

test("the app name set in Branding names the tabs and Riot's notice, and a reset keeps it", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "one desktop pass is enough");
  await view(context, baseURL!, "admin");
  await page.goto("/admin/branding");
  const field = page.getByTestId("brand-product");
  await expect(field).toHaveValue(NEUTRAL_NAME);
  // Every tab title ends with the app name ("Page · name", or the name alone).
  await expect(page).toHaveTitle(new RegExp(`${NEUTRAL_NAME}$`));
  try {
    await field.fill("Rocket Hub");
    await saveBranding(page);

    await view(context, baseURL!, "player");
    await page.goto("/settings");
    await expect(page).toHaveTitle(/Rocket Hub$/);
    await expect(page.locator("#compliance")).toContainText("Rocket Hub isn't endorsed by Riot Games");
    await page.goto("/login");
    await expect(page).toHaveTitle(/Rocket Hub$/);
    // The installed app carries the same name.
    const manifest = (await (await page.request.get("/manifest.webmanifest")).json()) as { name: string };
    expect(manifest.name).toBe("Rocket Hub");

    // A reset restores colours and background visibility, never the names.
    await view(context, baseURL!, "admin");
    await page.goto("/admin/branding");
    await page.getByRole("button", { name: "Reset colours to defaults" }).click();
    await expect(page.getByText("Colours and background visibility reset; names kept.")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("brand-product")).toHaveValue("Rocket Hub");
  } finally {
    await view(context, baseURL!, "admin");
    await page.goto("/admin/branding");
    await page.getByTestId("brand-product").fill(NEUTRAL_NAME);
    if (await page.getByTestId("branding-save").isEnabled()) await saveBranding(page);
  }
});
