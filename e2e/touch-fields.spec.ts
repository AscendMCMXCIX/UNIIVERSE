import { expect, test, type Page } from "./test";

/*
  Text fields on touch screens stay at 16px wider than a phone too (docs/RESPONSIVE.md →
  Primitives): iOS zooms the page into a focused field whose text is under 16px, on an iPad and on a
  phone held sideways as on an upright phone. With a mouse from md they are 14px, as before.
  In-memory demo roster.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

/** The font size of every text field shown on the page (inputs that take text, selects, text areas). */
function fieldSizes(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("input, select, textarea")]
      .filter((el) => !(el instanceof HTMLInputElement) || ["text", "search", "email", "password", "url", "number", "tel", ""].includes(el.type))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
      })
      .map((el) => ({ field: el.getAttribute("data-testid") ?? el.getAttribute("name") ?? el.tagName.toLowerCase(), size: parseFloat(getComputedStyle(el).fontSize) })),
  );
}

for (const path of ["/settings", "/players", "/resources"]) {
  test(`text fields on ${path} are 16px on a touch screen and 14px with a mouse from md`, async ({ page }, info) => {
    test.skip(info.project.name === "phone", "phones keep 16px at every width (MOBILE.md)");
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const sizes = await fieldSizes(page);
    expect(sizes.length, `${path}: a field to measure`).toBeGreaterThan(0);
    const expected = info.project.name === "tablet" ? 16 : 14;
    for (const { field, size } of sizes) expect(size, `${path}: ${field}`).toBe(expected);
  });
}
