import { expect, test } from "./test";

/*
  PAGES HYDRATE AS THE SERVER SENT THEM. In production the browser loads Riot's images (position
  icons, splash art, rank emblems); the in-memory demo has no internet, so here each one is
  served a 1px stand-in. A part of a page that draws itself differently once one of those images
  has loaded would not match the server's HTML: React reports it (error #418), throws that part
  of the page away and draws it again, and whatever was on screen is replaced under the reader.
*/

const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

test("a teammate's profile hydrates without errors once Riot's images load", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "hydration is the same at every size");
  // Served as the hosts serve them, with `Access-Control-Allow-Origin: *`: the position icons are
  // CSS masks, which a browser fetches in CORS mode (role-icon.tsx).
  await page.route(/ddragon\.leagueoflegends\.com|raw\.communitydragon\.org/, (route) => route.fulfill({ contentType: "image/png", body: PIXEL, headers: { "access-control-allow-origin": "*" } }));
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto("/players");
  const profile = new URL((await page.locator("main a[data-testid='player-card'][data-player-name='Demo Mid']").getAttribute("href"))!, "http://x").pathname;
  // The profile's header hydrates first; each tab streams in after it, once its icons have loaded.
  for (const tab of ["", "/champions", "/matches"]) {
    await page.goto(profile + tab);
    await page.waitForLoadState("networkidle");
    // Riot's position icon has replaced the built-in shape, after hydration and without an error.
    await expect(page.locator("main span[data-role-icon]").first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("a position icon answered without CORS headers keeps its built-in shape, never an empty mask", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the icon's loading is the same at every size");
  // CommunityDragon's host normally sends `Access-Control-Allow-Origin: *`; on 19 Nov 2026 one
  // answer came without it (Production check 44637598842). A mask from that answer draws nothing,
  // so the icon must not switch to the mask: the built-in shape stays, named for screen readers.
  // Playwright adds CORS headers to a fulfilled answer that has none, so the refusal is made the
  // other way a browser sees it: the answer names another site as the one allowed to use it.
  await page.route(/raw\.communitydragon\.org/, (route) => route.fulfill({ contentType: "image/png", body: PIXEL, headers: { "access-control-allow-origin": "https://elsewhere.example" } }));
  await page.goto("/players");
  const profile = new URL((await page.locator("main a[data-testid='player-card'][data-player-name='Demo Mid']").getAttribute("href"))!, "http://x").pathname;
  await page.goto(profile);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main svg[data-role-icon]").first(), "the built-in shape").toBeVisible();
  await expect(page.locator("main span[data-role-icon]"), "no mask from an answer the mask cannot use").toHaveCount(0);
});

/*
  A Select is drawn as the native control in the server's HTML and as the popover button once the
  page's code runs (src/components/ui/select.tsx). Both must take the same width, or the line they
  sit on reflows as the page hydrates: on the profile Overview at 1440 × 900 a 2px wider button
  wrapped Season performance's scope line and moved the whole Overview 14px down, so a click
  aimed at a link a moment before landed beside it (e2e/multikills.spec.ts, 27 Nov 2026). The
  native select is 12px + its label + 28px (the chevron's room); the button 12px + label + a 4px
  gap + the 16px chevron + 8px.
*/
test("a Select keeps its width when the page hydrates, so nothing beside it moves", async ({ page, browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "the popover form is the desktop's (phones keep the native select)");
  await page.goto("/players");
  const profile = new URL((await page.locator("main a[data-testid='player-card'][data-player-name='Demo Top']").getAttribute("href"))!, "http://x").pathname;
  // The server's HTML alone: the native select, as the browser draws it before the page's code runs. The app's script bundles
  // are refused (its styles still load), so nothing hydrates; the HTML's own inline scripts still run, which reveal the streamed sections (with
  // JavaScript off altogether those would stay hidden and measure 0px).
  const bare = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL });
  await bare.route(/\/_next\/static\/chunks\/[^?]*\.js(\?|$)/, (route) => route.abort());
  const serverPage = await bare.newPage();
  await serverPage.goto(`${profile}?mode=solo`);
  await expect(serverPage.locator("#overview-mode")).toBeVisible();
  const native = await serverPage.locator("#overview-mode").evaluate((e) => ({ tag: e.tagName, width: e.getBoundingClientRect().width }));
  const linkBefore = await serverPage.getByTestId("multikills-by-champion").evaluate((e) => e.getBoundingClientRect().top);
  await bare.close();
  expect(native.tag).toBe("SELECT");
  // Hydrated: the popover button, the same width; the Overview's link where the server drew it.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${profile}?mode=solo`);
  await expect(page.locator("#overview-mode[data-ready]")).toBeAttached();
  const hydrated = await page.locator("#overview-mode").evaluate((e) => ({ tag: e.tagName, width: e.getBoundingClientRect().width }));
  expect(hydrated.tag).toBe("BUTTON");
  expect(Math.abs(hydrated.width - native.width), `native ${native.width}px, popover ${hydrated.width}px`).toBeLessThanOrEqual(0.5);
  expect(await page.getByTestId("multikills-by-champion").evaluate((e) => e.getBoundingClientRect().top)).toBeCloseTo(linkBefore, 0);
});
