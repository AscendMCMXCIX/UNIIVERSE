import { deflateSync } from "node:zlib";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/*
  Team Overview → Appearance → Background visibility (in-memory demo). An admin gives the team an
  app background first (and removes it again at the end, so other tests see the demo as it was).
  The level changes the backdrop at once, is kept for this browser, comes back on the next visit,
  resets to the default, applies to Team Overview only, and never re-renders or moves the lineup.
*/

test.skip(({ isMobile }) => !!isMobile, "one desktop pass is enough; phones are covered in the layout checks");

/** A small solid PNG (the upload only needs a real image). */
function png(width = 48, height = 27): Buffer {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = table[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x40)]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))), chunk("IEND", Buffer.alloc(0))]);
}

const view = (context: BrowserContext, baseURL: string, as: "admin" | "player") => context.addCookies([{ name: "uniiverse_view", value: as, url: baseURL }]);
const vars = (page: Page) => page.evaluate(() => ({ art: getComputedStyle(document.documentElement).getPropertyValue("--backdrop-art").trim(), veil: getComputedStyle(document.documentElement).getPropertyValue("--backdrop-veil").trim(), image: getComputedStyle(document.querySelector('[data-testid="brand-backdrop"] img')!).opacity }));

test("background visibility: live, kept for this browser, reset, Team Overview only", async ({ page, context, baseURL }) => {
  // No artwork, no control.
  await view(context, baseURL!, "player");
  await page.goto("/team");
  await expect(page.getByTestId("lineup-overview")).toBeVisible();
  await expect(page.getByTestId("appearance-button")).toHaveCount(0);

  // The admin adds an app background.
  await view(context, baseURL!, "admin");
  await page.goto("/admin/branding");
  await page.getByLabel("Upload app background").setInputFiles({ name: "backdrop.png", mimeType: "image/png", buffer: png() });
  await expect(page.getByText("App background updated.")).toBeVisible();

  try {
    await view(context, baseURL!, "player");
    await page.goto("/team");
    await page.waitForLoadState("networkidle");
    const button = page.getByTestId("appearance-button");
    await expect(button).toBeVisible();
    // The default (50%) is already applied in the page as sent: no flash of the old backdrop.
    expect(await vars(page)).toEqual({ art: "0.46", veil: "0.75", image: "0.46" });
    const before = await page.getByTestId("lineup-cell").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));

    // Opens a small popover; the slider has focus and a readable value.
    await expect(async () => {
      await button.click();
      await expect(page.getByTestId("appearance-popover")).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
    const slider = page.getByTestId("backdrop-slider");
    await expect(slider).toBeFocused();
    await expect(slider).toHaveAccessibleName("Background visibility");
    await expect(page.getByTestId("backdrop-value")).toHaveText("50%");

    // Live: every step moves the backdrop at once; the lineup does not move or re-render.
    await page.evaluate(() => {
      (window as unknown as { __mutations: number }).__mutations = 0;
      new MutationObserver((m) => ((window as unknown as { __mutations: number }).__mutations += m.length)).observe(document.querySelector('[data-testid="lineup-overview"]')!, { subtree: true, childList: true, attributes: true, characterData: true });
    });
    await page.keyboard.press("End");
    await expect(page.getByTestId("backdrop-value")).toHaveText("100%");
    expect(await vars(page)).toEqual({ art: "0.8", veil: "0.5", image: "0.8" });
    await page.keyboard.press("Home");
    await expect(page.getByTestId("backdrop-value")).toHaveText("0%");
    expect((await vars(page)).art).toBe("0.12");
    for (let i = 0; i < 75; i++) await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("backdrop-value")).toHaveText("75%");
    expect(await page.evaluate(() => (window as unknown as { __mutations: number }).__mutations)).toBe(0);
    expect(await page.getByTestId("lineup-cell").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))).toEqual(before);

    // Escape closes it and returns to the button.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("appearance-popover")).toHaveCount(0);
    await expect(button).toBeFocused();

    // Kept for this browser: the next visit renders at 75%.
    await expect.poll(async () => (await context.cookies()).find((c) => c.name === "uniiverse_team_backdrop")?.value).toBe("75");
    await page.reload();
    expect((await vars(page)).art).toBe(String(Math.round((0.12 + 0.68 * 0.75) * 1000) / 1000));

    // Other pages keep the standard, subtle backdrop.
    await page.goto("/players");
    expect(await vars(page)).toEqual({ art: "", veil: "", image: "0.3" });

    // Reset to default.
    await page.goto("/team");
    await page.waitForLoadState("networkidle");
    await expect(async () => {
      await button.click();
      await expect(page.getByTestId("appearance-popover")).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
    await page.getByTestId("backdrop-reset").click();
    await expect(page.getByTestId("backdrop-value")).toHaveText("50%");
    await expect(page.getByTestId("backdrop-reset")).toBeDisabled();
    expect((await vars(page)).art).toBe("0.46");
    await expect.poll(async () => (await context.cookies()).find((c) => c.name === "uniiverse_team_backdrop")?.value).toBe("50");
    // A click elsewhere closes it.
    await page.getByTestId("team-name").click();
    await expect(page.getByTestId("appearance-popover")).toHaveCount(0);
  } finally {
    // Leave the demo as it was.
    await view(context, baseURL!, "admin");
    await page.goto("/admin/branding");
    await page.getByRole("button", { name: /Remove/ }).last().click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("App background removed.")).toBeVisible();
    await view(context, baseURL!, "player");
    await page.goto("/team");
    await expect(page.getByTestId("appearance-button")).toHaveCount(0);
  }
});
