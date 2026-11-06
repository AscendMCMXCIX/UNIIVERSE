import { expect, test } from "./test";

/*
  A profile's Riot Accounts tab never sends the accounts' PUUIDs to the browser
  (docs/RIOT_COMPLIANCE.md): not in the page, not in the data React carries with it. The demo's
  accounts have the PUUID "demo-<player id>".
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

test("a teammate's Riot Accounts tab carries no PUUID", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "the payload is the same at every width");
  await page.goto("/players");
  const href = await page.locator('a[href^="/players/"]').first().getAttribute("href");
  const id = /\/players\/([0-9a-f-]{36})/.exec(href ?? "")?.[1];
  expect(id, "a member's profile link").toBeTruthy();
  await page.goto(`/players/${id}/accounts`);
  await expect(page.getByText("Riot accounts").first()).toBeVisible();
  // The whole response: the HTML and the serialised props of client components inside it.
  const html = await (await page.request.get(`/players/${id}/accounts`)).text();
  expect(html).not.toContain(`demo-${id}`);
  const flight = await (await page.request.get(`/players/${id}/accounts`, { headers: { RSC: "1" } })).text();
  expect(flight).not.toContain(`demo-${id}`);
  // The accounts are still listed, with their server.
  expect(html).toContain("#DEMO");
});
