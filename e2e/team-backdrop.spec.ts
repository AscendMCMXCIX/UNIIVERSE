import { deflateSync } from "node:zlib";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { memberContext, signIn, view } from "./member-account";

/*
  Background visibility is team branding, the same on every page (in-memory demo): set by an admin in
  Admin → Branding, saved on the server and the same for every member. An admin gives the team an
  app background first and the test puts everything back at the end (other tests see the demo as
  it was). Checked: live preview on the branding page only, Cancel, Save, a second account seeing
  the saved level (also after signing in again), an old per-browser preference ignored, no editing
  for a member (page and control), Reset to default, every page at the same level.
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

const vars = (page: Page) => page.evaluate(() => ({ art: getComputedStyle(document.documentElement).getPropertyValue("--backdrop-art").trim(), veil: getComputedStyle(document.documentElement).getPropertyValue("--backdrop-veil").trim(), image: getComputedStyle(document.querySelector('[data-testid="brand-backdrop"] img')!).opacity }));
const artFor = (level: number) => String(Math.round((0.5 + 0.5 * (level / 100)) * 1000) / 1000);
const veilFor = (level: number) => String(Math.round((0.88 - 0.6 * (level / 100)) * 1000) / 1000);

async function setLevel(page: Page, level: number) {
  await page.getByTestId("backdrop-slider").fill(String(level));
  await expect(page.getByTestId("backdrop-value")).toHaveText(`${level}%`);
}

async function saveBranding(page: Page) {
  await page.getByTestId("branding-save").click();
  await expect(page.getByText("Branding saved.")).toBeVisible();
  await expect(page.getByTestId("branding-save")).toBeDisabled();
}

test("background visibility: set by an admin in Branding, the same for every member", async ({ page, context, baseURL, browser }) => {
  // No artwork: nothing on Team Overview and nothing to set in Branding.
  await view(context, baseURL!, "player");
  await page.goto("/team");
  await expect(page.getByTestId("lineup-overview")).toBeVisible();
  await expect(page.getByTestId("backdrop-style")).toHaveCount(0);
  await view(context, baseURL!, "admin");
  await page.goto("/admin/branding");
  await expect(page.getByTestId("backdrop-no-artwork")).toBeVisible();
  await expect(page.getByTestId("backdrop-slider")).toHaveCount(0);

  // The admin adds an app background.
  await page.getByLabel("Upload app background").setInputFiles({ name: "backdrop.png", mimeType: "image/png", buffer: png() });
  await expect(page.getByText("App background updated.")).toBeVisible();

  let member: { context: BrowserContext; page: Page; username: string } | null = null;
  try {
    // Team Overview: the default level, in the page as sent (no flash), and no per-user control.
    await view(context, baseURL!, "player");
    await page.goto("/team");
    expect(await vars(page)).toEqual({ art: artFor(50), veil: veilFor(50), image: artFor(50) });
    await expect(page.getByTestId("appearance-button")).toHaveCount(0);

    // Admin → Branding: the slider, its value and a live preview on this page's background.
    await view(context, baseURL!, "admin");
    await page.goto("/admin/branding");
    const slider = page.getByTestId("backdrop-slider");
    await expect(slider).toHaveAccessibleName("Background visibility");
    await expect(page.getByTestId("backdrop-value")).toHaveText("50%");
    expect((await vars(page)).art).toBe(artFor(50));
    await setLevel(page, 100);
    expect(await vars(page)).toEqual({ art: "1", veil: "0.28", image: "1" });
    await expect(page.getByTestId("backdrop-saved")).toHaveText(" · saved: 50%");
    await expect(page.getByTestId("branding-save")).toBeEnabled();

    // Unsaved: nobody else sees it (a second browser, the owner's player view).
    const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await view(other, baseURL!, "player");
    const otherPage = await other.newPage();
    await otherPage.goto("/team");
    expect((await vars(otherPage)).art).toBe(artFor(50));

    // Cancel discards it.
    await page.getByTestId("branding-cancel").click();
    await expect(page.getByTestId("backdrop-value")).toHaveText("50%");
    expect((await vars(page)).art).toBe(artFor(50));
    await expect(page.getByTestId("branding-save")).toBeDisabled();

    // Save applies it for everyone.
    await setLevel(page, 75);
    expect((await vars(page)).art).toBe(artFor(75));
    await saveBranding(page);
    await otherPage.reload();
    expect((await vars(otherPage)).art).toBe(artFor(75));
    await other.close();

    // Another account (a team member) sees the same, after a refresh and after signing in again,
    // and an old per-browser preference changes nothing.
    member = await memberContext(browser, page);
    await member.page.goto("/team");
    expect(await vars(member.page)).toEqual({ art: artFor(75), veil: veilFor(75), image: artFor(75) });
    await member.context.addCookies([{ name: "uniiverse_team_backdrop", value: "5", url: baseURL! }]);
    await member.page.reload();
    expect((await vars(member.page)).art).toBe(artFor(75));
    await expect(member.page.getByTestId("appearance-button")).toHaveCount(0);
    const again = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const againPage = await again.newPage();
    await signIn(againPage, member.username, "Mine#2026x");
    await expect(againPage.locator("aside").getByTestId("account-current-name")).toHaveText(member.username);
    await againPage.goto("/team");
    expect((await vars(againPage)).art).toBe(artFor(75));
    await again.close();

    // A member cannot open the branding settings, so cannot change the level (the server action
    // refuses it too: tests/db/branding-backdrop.test.ts).
    await member.page.goto("/admin/branding");
    await expect(member.page).toHaveURL(/\/no-access|\/team|\/overview/);
    await expect(member.page.getByTestId("backdrop-slider")).toHaveCount(0);

    // Every page shows the same level (one mapping for the whole app).
    for (const path of ["/players", "/overview", "/leaderboards", "/matches"]) {
      await member.page.goto(path);
      expect(await vars(member.page), path).toEqual({ art: artFor(75), veil: veilFor(75), image: artFor(75) });
    }

    // Reset to default, saved: everyone is back at 50%.
    await page.goto("/admin/branding");
    await expect(page.getByTestId("backdrop-value")).toHaveText("75%");
    await page.getByTestId("backdrop-reset").click();
    await expect(page.getByTestId("backdrop-value")).toHaveText("50%");
    await expect(page.getByTestId("backdrop-reset")).toBeDisabled();
    await saveBranding(page);
    await member.page.goto("/team");
    expect((await vars(member.page)).art).toBe(artFor(50));
  } finally {
    await member?.context.close();
    // Leave the demo as it was: default level and no app background.
    await view(context, baseURL!, "admin");
    await page.goto("/admin/branding");
    if ((await page.getByTestId("backdrop-value").count()) && (await page.getByTestId("backdrop-value").innerText()) !== "50%") {
      await page.getByTestId("backdrop-reset").click();
      await saveBranding(page);
    }
    await page.getByRole("button", { name: /Remove/ }).last().click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("App background removed.")).toBeVisible();
    await view(context, baseURL!, "player");
    await page.goto("/team");
    await expect(page.getByTestId("backdrop-style")).toHaveCount(0);
  }
});
