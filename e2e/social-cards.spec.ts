import { expect, test, type Browser, type Page } from "@playwright/test";

/*
  Social icons on player cards (domain/social-links, the demo roster's synthetic links): Team
  Overview cards, a substitute's side, the Players directory, the public page and the card
  previews show each member's links only to the audience they chose, and a link kept to "Only me"
  shows nowhere. Each icon is its own control: using one never opens, turns or selects the card
  under it, nor opens the profile. Channel links open in a new tab; a stub answers them here, so
  no request leaves the test.
*/

const HIDDEN = ["demo.support.private"];
const TEAM_ONLY = ["demo_mid_live", "demo.mid"];

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  for (const site of ["https://www.youtube.com/**", "https://www.twitch.tv/**"]) await context.route(site, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<title>stub</title>" }));
});

async function guestPage(browser: Browser, baseURL: string): Promise<Page> {
  const context = await browser.newContext();
  await context.addCookies([{ name: "uniiverse_guest", value: "1", url: baseURL }]);
  return context.newPage();
}

test("Team Overview: teammates see the links chosen for the team, and using one leaves the card alone", async ({ page, context }, info) => {
  test.skip(info.project.name !== "desktop", "five cards across on the desktop; the directory test covers touch");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/team");
  const mid = page.getByTestId("lineup-row-MID");
  const icons = mid.getByTestId("card-social");
  await expect(icons).toBeVisible();
  await expect(icons.getByTestId("card-social-youtube")).toHaveAttribute("href", "https://www.youtube.com/@DemoMidChannel");
  await expect(icons.getByTestId("card-social-youtube")).toHaveAttribute("target", "_blank");
  await expect(icons.getByTestId("card-social-youtube")).toHaveAttribute("rel", /noopener/);
  await expect(icons.getByTestId("card-social-twitch")).toHaveAttribute("href", "https://www.twitch.tv/demo_mid_live");
  // The icons share the avatar's row: a card with them is as tall as its neighbours, names in line.
  const top = (role: string) => page.getByTestId(`lineup-row-${role}`).locator("[data-testid='card-fit']").evaluate((el) => Math.round(el.getBoundingClientRect().top));
  expect(await top("MID")).toBe(await top("JUNGLE"));

  // Discord copies the username; the card is neither selected nor opened.
  await icons.getByTestId("card-social-discord").click();
  await expect(page.getByText("Discord username copied.")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("demo.mid");
  await expect(mid).not.toHaveAttribute("data-selected", /.*/);
  await expect(page.getByTestId("player-detail")).toBeHidden();
  // A channel opens in a new tab, and the card stays as it was.
  const [tab] = await Promise.all([context.waitForEvent("page"), icons.getByTestId("card-social-youtube").click()]);
  await tab.close();
  await expect(mid).not.toHaveAttribute("data-selected", /.*/);
  await expect(page.getByTestId("player-detail")).toBeHidden();

  // A link kept to "Only me" shows nowhere: no icon on the card, and not its value in the page.
  await expect(page.getByTestId("lineup-row-SUPPORT").getByTestId("card-social")).toHaveCount(0);
  const html = await page.content();
  for (const v of HIDDEN) expect(html).not.toContain(v);
});

test("a substitute's side shows their own links, and using one keeps the card turned", async ({ page, context }, info) => {
  test.skip(info.project.name !== "desktop", "runs on the desktop's five cards across");
  await page.goto("/team");
  const card = page.getByTestId("lineup-card-SUPPORT");
  await card.getByTestId("flip-to-substitute").click();
  await expect(card).toHaveAttribute("data-flipped", "true");
  const sub = page.getByTestId("lineup-sub-SUPPORT");
  const twitch = sub.getByTestId("card-social-twitch");
  await expect(twitch).toBeVisible();
  await expect(twitch).toHaveAttribute("href", "https://www.twitch.tv/demo_sub_support");
  const [tab] = await Promise.all([context.waitForEvent("page"), twitch.click()]);
  await tab.close();
  await expect(card).toHaveAttribute("data-flipped", "true");
  await expect(sub).not.toHaveAttribute("data-selected", /.*/);
  await expect(page.getByTestId("player-detail")).toBeHidden();
  // The starter's side has no links of their own to show.
  await expect(page.getByTestId("lineup-row-SUPPORT").getByTestId("card-social")).toHaveCount(0);
});

test("Players: the icons sit on the card, and using one never opens the profile", async ({ page, context }, info) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/players");
  const icons = page.getByRole("list", { name: "Demo Mid's social links" });
  await expect(icons).toBeVisible();
  await expect(icons.getByTestId("card-social-youtube")).toHaveAttribute("href", "https://www.youtube.com/@DemoMidChannel");
  await expect(icons.getByTestId("card-social-twitch")).toHaveAttribute("href", "https://www.twitch.tv/demo_mid_live");
  // Over the card's own artwork, inside its edges.
  const card = (await page.locator("main a[data-testid='player-card'][data-player-name='Demo Mid']").boundingBox())!;
  const box = (await icons.boundingBox())!;
  expect(box.x).toBeGreaterThan(card.x);
  expect(box.x + box.width).toBeLessThan(card.x + card.width);
  expect(box.y).toBeGreaterThan(card.y);
  // Big enough to tap on a touch screen: a 32px mark with an invisible margin, so a tap 20px from
  // its centre still lands on it (a 40px target).
  if (info.project.name === "phone") {
    const d = (await icons.getByTestId("card-social-discord").boundingBox())!;
    expect(d.width).toBeGreaterThanOrEqual(32);
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("[data-testid='card-social-discord']") !== null, { x: d.x + d.width / 2, y: d.y + d.height / 2 + 19 });
    expect(hit).toBe(true);
  }
  await icons.getByTestId("card-social-discord").click();
  await expect(page.getByText(/Discord username copied|Not copied/)).toBeVisible();
  await expect(page).toHaveURL(/\/players$/);
  // Only the chosen audiences: the hidden Discord of Demo Support shows nowhere.
  await expect(page.getByRole("list", { name: "Demo Support's social links" })).toHaveCount(0);
  const html = await page.content();
  for (const v of HIDDEN) expect(html).not.toContain(v);
});

test("the public page shows only the links chosen for the public", async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "one pass is enough for what the page holds");
  const guest = await guestPage(browser, baseURL!);
  await guest.goto("/public");
  const mid = guest.getByTestId("lineup-row-MID");
  await expect(mid.getByTestId("card-social-youtube")).toHaveAttribute("href", "https://www.youtube.com/@DemoMidChannel");
  await expect(mid.getByTestId("card-social-twitch")).toHaveCount(0);
  await expect(mid.getByTestId("card-social-discord")).toHaveCount(0);
  // The Support substitute chose the public for their Twitch: on the back of the card.
  await guest.getByTestId("lineup-row-SUPPORT").getByTestId("flip-to-substitute").click();
  await expect(guest.getByTestId("lineup-sub-SUPPORT").getByTestId("card-social-twitch")).toHaveAttribute("href", "https://www.twitch.tv/demo_sub_support");
  const html = await guest.content();
  for (const v of [...TEAM_ONLY, ...HIDDEN]) expect(html).not.toContain(v);
  await guest.context().close();
});

test("the card preview in the Studio shows the same icons, without actions", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on the desktop project");
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-MID").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}`);
  await expect(page.getByTestId("profile-header").getByTestId("social-links")).toBeVisible();
  await expect(async () => {
    await page.getByTestId("profile-header").getByTestId("customise-card").click();
    await expect(page.getByTestId("card-studio")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  const preview = page.getByTestId("card-preview").getByTestId("card-social-preview");
  await expect(preview).toBeVisible();
  await expect(preview.locator(":scope > span")).toHaveCount(3);
  await expect(page.getByTestId("card-preview").locator("a[href*='youtube'], a[href*='twitch']")).toHaveCount(0);
});
