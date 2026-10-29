import { expect, test, type Locator, type Page } from "./test";
import { closeGame, openGame } from "./match-history";

/*
  A game's breakdown under its Match History card (demo data, in memory): the four sections share
  one tab row, the Analysis compares only what it says it compares, the Timeline draws the gold
  difference and reads it minute by minute (keyboard, and as a table), the Build shows the order
  bought and the skills, and the match timeline is asked for once however often the sections are
  switched. Every sixth demo game has no stored timeline (and the demo has no Riot key to fetch
  it), so the tests use the first game whose Timeline draws.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

async function openHistory(page: Page, role = "MID") {
  await page.goto("/team");
  const id = (await page.getByTestId(`lineup-row-${role}`).getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/matches`);
  await expect(page.locator("[data-testid='match-history'][data-ready]")).toBeVisible();
}

/** Opens a section of an open breakdown. */
async function section(breakdown: Locator, key: "scoreboard" | "analysis" | "timeline" | "build") {
  await breakdown.getByTestId(`match-tab-${key}`).click();
  await expect(breakdown.getByTestId(`match-tab-${key}`)).toHaveAttribute("aria-selected", "true");
  return breakdown.getByTestId(`match-panel-${key}`);
}

/** The first of the newest games whose stored timeline draws the gold difference, open on its Timeline. */
async function gameWithTimeline(page: Page): Promise<{ card: Locator; breakdown: Locator; timeline: Locator }> {
  for (let i = 0; i < 6; i++) {
    const card = page.getByTestId("match-card").nth(i);
    const breakdown = await openGame(card);
    const timeline = await section(breakdown, "timeline");
    await expect(timeline.getByTestId("timeline-loading")).toHaveCount(0, { timeout: 15_000 });
    if (await timeline.getByTestId("gold-chart").count()) return { card, breakdown, timeline };
    // A game Riot does not provide the timeline of says so, in words, and draws nothing.
    await expect(timeline.getByTestId("timeline-message")).toBeVisible();
    await closeGame(card);
  }
  throw new Error("no demo game with a timeline among the newest six");
}

/** Nothing on the page is wider than the screen. */
async function fitsWidth(page: Page, label: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${label}: no sideways scrolling`).toBeLessThanOrEqual(1);
}

test("the four sections share one tab row and the keyboard moves between them", async ({ page }) => {
  await openHistory(page);
  const breakdown = await openGame(page.getByTestId("match-card").first());
  const tabs = breakdown.getByRole("tab");
  await expect(tabs).toHaveText(["Scoreboard", "Analysis", "Timeline", "Build"]);
  await expect(breakdown.getByTestId("match-tab-scoreboard")).toHaveAttribute("aria-selected", "true");
  // One tab stop: the selected tab; the arrows, Home and End move the selection.
  await breakdown.getByTestId("match-tab-scoreboard").focus();
  await page.keyboard.press("ArrowRight");
  await expect(breakdown.getByTestId("match-tab-analysis")).toBeFocused();
  await expect(breakdown.getByTestId("match-panel-analysis")).toBeVisible();
  await page.keyboard.press("End");
  await expect(breakdown.getByTestId("match-tab-build")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await expect(breakdown.getByTestId("match-tab-scoreboard")).toHaveAttribute("aria-selected", "true");
  await expect(breakdown.locator("[role='tab'][tabindex='0']")).toHaveCount(1);
  // On a phone the four tabs share the width: none is cut off or scrolled away.
  const row = (await breakdown.getByRole("tablist").boundingBox())!;
  for (const tab of await tabs.all()) {
    const box = (await tab.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(row.x - 0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(row.x + row.width + 0.5);
  }
  await fitsWidth(page, "an open game");
});

test("Analysis compares the game with what it names: the team, the ten players, the lane opponent and the player's own earlier games", async ({ page }) => {
  await openHistory(page);
  const { breakdown } = await gameWithTimeline(page);
  const analysis = await section(breakdown, "analysis");
  // Shares of the team, as percentages.
  await expect(analysis.getByTestId("match-shares")).toContainText(/Champion damage\s*\d+%/);
  // The demo's lane opponent is the one enemy in the same position: 10:00 and 15:00 from the timeline.
  const lane = analysis.getByTestId("lane-comparison");
  await expect(lane).toHaveAttribute("data-state", "timeline", { timeout: 15_000 });
  for (const at of ["lane-at-10", "lane-at-15", "lane-at-end"]) await expect(lane.getByTestId(at)).toContainText(/[+−±]\d/);
  // The player's place among the players with each figure.
  await expect(analysis.getByTestId("match-places")).toContainText(/\d+(st|nd|rd|th) of \d+/);
  // Compared with the player's own earlier games: the sample is named, or why there is none.
  const personal = analysis.getByTestId("personal-comparison");
  if ((await personal.getAttribute("data-state")) === "ok") await expect(personal.getByTestId("personal-sample")).toHaveText(/^Your last \d+ (ranked|normal|Clash|Swiftplay and Quickplay) games? as /);
  else await expect(personal).toContainText("Not enough earlier games to compare with");
  await fitsWidth(page, "Analysis");
});

test("Timeline draws the gold difference, reads a minute by keyboard and as a table, and asks for the timeline once", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.headers()["next-action"]) posts.push(r.url());
  });
  await openHistory(page);
  const { breakdown, timeline } = await gameWithTimeline(page);
  const chart = timeline.getByTestId("gold-chart");
  await expect(chart.getByTestId("gold-chart-line")).toBeVisible();
  await expect(timeline.getByTestId("gold-story")).toContainText("Largest lead");
  await expect(timeline.getByTestId("gold-story")).toContainText("At the end");
  // The keyboard reads one frame at a time, from the start.
  const svg = chart.getByTestId("gold-chart-svg");
  await svg.focus();
  await page.keyboard.press("Home");
  await expect(chart.getByTestId("gold-chart-readout")).toHaveText(/^0:00 · Even/);
  await page.keyboard.press("ArrowRight");
  await expect(chart.getByTestId("gold-chart-readout")).toHaveText(/^1:0\d · (Even|Your team ahead by [\d,]+ gold|The other team ahead by [\d,]+ gold)/);
  await page.keyboard.press("End");
  const end = (await chart.getByTestId("gold-chart-readout").innerText()).split(" · ")[0]!;
  // Every frame as a table, the last one the end of the game.
  await timeline.getByText("Every minute as a table").click();
  const rows = timeline.getByTestId("gold-chart-table").locator("tbody tr");
  expect(await rows.count()).toBeGreaterThan(20);
  await expect(rows.last().locator("td").first()).toHaveText(end);
  await fitsWidth(page, "Timeline");
  // Switching sections reuses the one answer: Build and Analysis ask for nothing more.
  const before = posts.length;
  await section(breakdown, "build");
  await section(breakdown, "analysis");
  await section(breakdown, "timeline");
  await expect(chart).toBeVisible();
  await page.waitForTimeout(300);
  expect(posts.length - before).toBe(0);
});

test("Build lists what was bought minute by minute, the skill order and the runes", async ({ page }) => {
  await openHistory(page);
  const { breakdown } = await gameWithTimeline(page);
  const build = await section(breakdown, "build");
  const steps = build.getByTestId("build-steps").locator(":scope > li");
  expect(await steps.count()).toBeGreaterThan(2);
  await expect(steps.first()).toContainText("0 min");
  await expect(build.getByTestId("skill-order").locator("li").first()).toHaveAttribute("title", /^Level 1: [QWE]$/);
  await expect(build.getByTestId("rune-page")).toBeVisible();
  await fitsWidth(page, "Build");
});
