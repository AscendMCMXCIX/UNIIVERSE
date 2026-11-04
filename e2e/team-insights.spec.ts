import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "./test";
import { memberContext } from "./member-account";

/*
  Team → Matches → Insights, as administrators preview it while the owner decides
  (docs/TEAM_INSIGHTS.md). The demo viewer is the Owner. The demo's games are synthetic (demo mode
  only), never real Riot data. A member is sent back to Team → Matches.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).include("[data-testid=team-insights]").analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test("the preview says what it read, what stands out (or that nothing does), and how", async ({ page }) => {
  await page.goto("/matches/insights");
  const root = page.getByTestId("team-insights");
  await expect(root.getByRole("heading", { level: 1, name: "Team insights" })).toBeVisible();
  await expect(root.getByText("Preview for administrators")).toBeVisible();
  // What was read: the season, the games, the members and the dates.
  await expect(root).toContainText(/Season 2026 · ([\d,]+ games? of \d+ members?, [\d,]+ played together|No games yet)/);
  // Either findings, each a plain statement with its records and interval, or a plain "nothing".
  const findings = root.getByTestId("insight-finding");
  const nothing = root.getByTestId("insights-nothing");
  await expect(findings.or(nothing).first()).toBeVisible();
  if (await findings.count()) {
    await expect(findings.first()).toContainText(/has won (more|less) often/);
    await expect(findings.first()).toContainText(/likely between/);
  } else {
    // The sentence itself, not just the empty state's title.
    await expect(nothing).toContainText(/Nothing has enough games to compare yet: a comparison needs 20 comparable games on each side\.|Nothing could be compared yet\.|Nothing stands out\. \d+ comparisons? (was|were) checked|There are no games to compare yet/);
  }
  // The method is one click away and says what it does not claim.
  const method = root.getByTestId("insights-method");
  await method.locator("summary").click();
  await expect(method).toContainText("do not say why");
  // Every comparison, with both sides' records: checked ones with their status, the rest waiting.
  const all = root.getByTestId("insights-all");
  if (await all.count()) {
    await all.locator("summary").click();
    const row = all.getByTestId("insight-row").or(all.getByTestId("insight-unchecked")).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText(/With teammates: .* · Alone: |With .*: .* · With other teammates: |Last 30 days: .* · Earlier: /);
    await expect(all).not.toContainText("— of 0");
  }
  await axe(page);
  // A quiet way back to Team → Matches (the preview has no tab bar of its own).
  await expect(root.getByTestId("insights-back")).toHaveAttribute("href", "/matches");
  // Nothing overflows the page sideways at any width.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("a member who is not an administrator is sent to Team → Matches", async ({ browser, page: admin }) => {
  test.skip(test.info().project.name !== "desktop", "one device is enough for the access check");
  const { context, page } = await memberContext(browser, admin, undefined, { base: "Insight" });
  await page.goto("/matches/insights");
  await expect(page).toHaveURL(/\/matches$/);
  await expect(page.getByTestId("team-insights")).toHaveCount(0);
  await context.close();
});
