import { expect, test, type Page } from "./test";
import { FLOOR, OWNER_SIZES, cfg, flowUnchanged, openAt, resizeTo, type Size } from "./workspace";

/*
  Admin Mode → Platform Settings → Previews on a desktop window: a fitted canvas (docs/RESPONSIVE.md,
  "One-screen desktop pages", Previews). The studio fills the window under the header; the controls
  and the size line stand in a column at its left; the device is drawn whole in the room beside them,
  scaled by the room's width and height, and its size line says the scale. The page's fit at the
  owner's configurations is e2e/one-screen.spec.ts's; here, that the device is whole in its box at
  every size and device, and that the flow (a short window) is the studio as before.
*/

test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "a desktop window's canvas (desktop project only)"));

/** The device's box, its frame, and the scale the size line says. */
const canvas = (page: Page) =>
  page.evaluate(() => {
    const box = document.querySelector<HTMLElement>("[data-testid=preview-device]")!.parentElement!.getBoundingClientRect();
    const device = document.querySelector<HTMLElement>("[data-testid=preview-device]")!.getBoundingClientRect();
    const said = /shown at (\d+)%/.exec(document.querySelector("[data-testid=preview-size]")!.textContent ?? "")?.[1];
    const [w, h] = (/^(\d+) × (\d+) px/.exec(document.querySelector("[data-testid=preview-size]")!.textContent ?? "") ?? []).slice(1).map(Number);
    return { box: { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height }, device: { top: device.top, bottom: device.bottom, left: device.left, right: device.right, width: device.width, height: device.height }, said: said ? Number(said) : 100, w: w!, h: h! };
  });

test("the device is drawn whole in the room beside the controls, scaled by the room's width and height, at every size and device", async ({ page }) => {
  test.setTimeout(120_000);
  await openAt(page, "/admin/previews", OWNER_SIZES[0]!, "expanded", { admin: true });
  for (const device of ["phone", "tablet", "laptop", "desktop"] as const) {
    await page.getByTestId(`preview-device-${device}`).click();
    for (const size of [...OWNER_SIZES, FLOOR] as Size[]) {
      await resizeTo(page, size);
      const at = `${cfg(size, "expanded")}, ${device}`;
      await expect.poll(async () => (await canvas(page)).device.height, { message: `${at}: the device fits its box` }).toBeLessThanOrEqual((await canvas(page)).box.height + 0.5);
      const c = await canvas(page);
      // Whole in its box: no side past it.
      expect(c.device.top, at).toBeGreaterThanOrEqual(c.box.top - 0.5);
      expect(c.device.bottom, at).toBeLessThanOrEqual(c.box.bottom + 0.5);
      expect(c.device.left, at).toBeGreaterThanOrEqual(c.box.left - 0.5);
      expect(c.device.right, at).toBeLessThanOrEqual(c.box.right + 0.5);
      // As large as the room allows: it touches the box's width or its height (or is at 100%).
      const fill = Math.max(c.device.width / c.box.width, c.device.height / c.box.height);
      if (c.said < 100) expect(fill, `${at}: as large as the room allows`).toBeGreaterThan(0.98);
      // The size line says the scale it is drawn at.
      expect(Math.abs(c.device.width - (c.w * c.said) / 100), `${at}: drawn at the scale the size line says`).toBeLessThanOrEqual(c.w / 100 + 2);
      // The page does not scroll.
      expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight), `${at}: the page is the window`).toBeLessThanOrEqual(0);
    }
  }
  // Rotated: the tablet held sideways, still whole.
  await page.getByTestId("preview-device-tablet").click();
  await page.getByTestId("preview-rotate").click();
  await resizeTo(page, FLOOR);
  const c = await canvas(page);
  expect([c.w, c.h]).toEqual([1024, 768]);
  expect(c.device.bottom).toBeLessThanOrEqual(c.box.bottom + 0.5);
  expect(c.device.right).toBeLessThanOrEqual(c.box.right + 0.5);
});

test("outside the workspace the studio is as before: its controls in a row above the device, scaled by the width alone", async ({ page }) => {
  await flowUnchanged(page, "/admin/previews", { admin: true });
  // In a short window the phone is drawn at full size (it is narrower than the room), and the page scrolls to it.
  await openAt(page, "/admin/previews", [1366, 640], "expanded", { admin: true });
  await expect(page.getByTestId("preview-size")).toHaveText("390 × 844 px");
  const controls = await page.getByTestId("preview-screen-login").boundingBox();
  const device = await page.getByTestId("preview-device").boundingBox();
  expect(device!.y, "the device under the controls").toBeGreaterThan(controls!.y + controls!.height);
  expect(Math.round(device!.height)).toBe(844);
});
