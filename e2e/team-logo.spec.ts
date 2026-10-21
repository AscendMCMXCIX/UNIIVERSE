import { expect, test, type Browser } from "@playwright/test";
import path from "node:path";

/*
  THE TEAM LOGO: an animated logo (e2e/fixtures/animated-logo.gif, two frames, twice as wide as it
  is tall) uploaded in Admin → Branding shows at its own proportions in a square, never squeezed,
  on phones, tablets and desktops, and it animates on every one of them: the browser is given the
  animation (served as its web copy), and only someone who asks for reduced motion gets the still
  first frame. The logo is removed again at the end, so other tests see the usual team mark.
*/

const GIF = path.join(__dirname, "fixtures/animated-logo.gif");

const SCREENS = [
  { name: "phone", viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, side: 48 },
  { name: "phone sideways", viewport: { width: 812, height: 375 }, isMobile: true, hasTouch: true, side: 44 },
  { name: "tablet", viewport: { width: 768, height: 1024 }, isMobile: false, hasTouch: true, side: 64 },
  { name: "desktop", viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, side: 80 },
] as const;

async function teamLogo(browser: Browser, baseURL: string, screen: (typeof SCREENS)[number], reducedMotion: "reduce" | "no-preference") {
  const context = await browser.newContext({ viewport: screen.viewport, isMobile: screen.isMobile, hasTouch: screen.hasTouch, reducedMotion });
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL }]);
  const page = await context.newPage();
  await page.goto("/team");
  const img = page.getByTestId("team-header").locator("img").first();
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  const box = (await img.boundingBox())!;
  const shown = await img.evaluate((i: HTMLImageElement) => ({ src: i.currentSrc, fit: getComputedStyle(i).objectFit, ratio: i.naturalWidth / i.naturalHeight }));
  await context.close();
  return { box, ...shown };
}

test("the team logo keeps its proportions in a square everywhere, and animates unless motion is reduced", async ({ page, browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "one upload, checked on several screens below");
  test.setTimeout(180_000);
  await page.context().addCookies([{ name: "uniiverse_view", value: "admin", url: baseURL! }]);
  await page.goto("/admin/branding");
  const card = page.locator("[data-testid=brand-logo][data-ready=true]");
  await expect(card).toBeVisible();
  await card.locator("input[type=file]").setInputFiles(GIF);
  await expect(page.getByText(/Logo updated \(animated\)/)).toBeVisible({ timeout: 60_000 });
  try {
    for (const screen of SCREENS) {
      const moving = await teamLogo(browser, baseURL!, screen, "no-preference");
      // A square of the header's size, whatever the window (a crowded phone header included).
      expect(Math.round(moving.box.width), `${screen.name}: width`).toBe(screen.side);
      expect(Math.round(moving.box.height), `${screen.name}: height`).toBe(screen.side);
      // The picture inside keeps its own shape (2:1 here), drawn whole.
      expect(moving.fit).toBe("contain");
      expect(moving.ratio).toBeCloseTo(2, 1);
      // The animation, not the still frame.
      expect(new URL(moving.src).pathname, `${screen.name}: animated`).toBe("/api/branding/logo");
      const still = await teamLogo(browser, baseURL!, screen, "reduce");
      expect(new URL(still.src).pathname, `${screen.name}: reduced motion`).toBe("/api/branding/logo-static");
      expect(Math.round(still.box.width)).toBe(screen.side);
      expect(Math.round(still.box.height)).toBe(screen.side);
    }
    // The phone's top bar shows the same logo, square too.
    const context = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
    await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
    const phone = await context.newPage();
    await phone.goto("/team");
    const bar = (await phone.locator("header img").first().boundingBox())!;
    expect(Math.round(bar.width)).toBe(Math.round(bar.height));
    await context.close();
  } finally {
    // Back to the usual team mark for every other test.
    await page.goto("/admin/branding");
    await page.locator("[data-testid=brand-logo][data-ready=true]").getByRole("button", { name: "Remove" }).click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect(page.getByTestId("brand-logo-empty")).toBeVisible();
  }
});
