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
