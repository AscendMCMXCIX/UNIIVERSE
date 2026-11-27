import { expect, test } from "./test";

/*
  Large text on the narrowest phones (Release 19, the reconciliation's A4 and A15b): at 150%, 175% and
  200% text on 320 and 375px phones, the pages the large-text audit of 18 Nov had left (My Profile's
  setup form, Settings, Team Matches, All Champions, Match History) are no wider than the phone. /me
  scrolled sideways by 54-179px at 320px (the "Add another account" and "Create my player profile"
  buttons kept one line); its buttons now wrap. A word broken across lines is allowed only inside a
  member's or a champion's name, which have nowhere else to go.
*/

const ROUTES = ["/me", "/settings", "/matches", "/overview/champions", "/overview/matches"];

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

test("at 150% to 200% text on 320 and 375px phones, My Profile's setup, Settings, Team Matches, All Champions and Match History are no wider than the phone", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the narrowest phones");
  test.setTimeout(240_000);
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 667 });
    for (const route of ROUTES) {
      for (const size of [150, 175, 200]) {
        await page.goto(route);
        await page.addStyleTag({ content: `html { font-size: ${size}% !important; }` });
        await page.evaluate(() => document.fonts.ready);
        const at = `${route} at ${width}px, ${size}% text`;
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), { message: `${at}: no sideways scroll` }).toBeLessThanOrEqual(1);
      }
    }
  }
});
