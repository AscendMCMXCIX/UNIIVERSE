import { expect, test, type Locator, type Page } from "./test";
import { besideAMark, closeGame, openGame } from "./match-history";

/*
  A game's breakdown under its Match History card (demo data, in memory): the four sections share
  one tab row, the Analysis compares only what it says it compares, the Timeline draws the gold
  difference and reads it minute by minute (keyboard, and as a table) with the kills, objectives
  and largest swings beside it (never a cause), the Build shows the order
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
  if ((await personal.getAttribute("data-state")) === "ok") {
    await expect(personal.getByTestId("personal-sample")).toHaveText(/^Your last \d+ (ranked|normal|Clash|Swiftplay and Quickplay) games? as /);
    // Where the game sits, in counts of those games: never a bare percentage.
    for (const standing of await personal.getByTestId("personal-standing").all()) await expect(standing).toHaveText(/^(Your best in \d+|Higher than (all \d+|none of \d+|\d+ of \d+))$/);
  } else await expect(personal).toContainText("Not enough earlier games to compare with");
  // Turret takedowns out of the team's towers, when the two agree.
  const turrets = analysis.getByTestId("match-objectives").locator("div", { has: page.getByText("Turret takedowns", { exact: true }) }).locator("dd");
  if (await turrets.count()) {
    const [took, of] = (await turrets.innerText()).split(" of ").map((n) => Number(n.replace(/,/g, "")));
    if (of !== undefined) expect(took).toBeLessThanOrEqual(of);
  }
  await fitsWidth(page, "Analysis");
});

test("a game without a timeline compares the lane at the end only, and says why", async ({ page }) => {
  await openHistory(page);
  const cards = await page.getByTestId("match-card").count();
  for (let i = 0; i < cards; i++) {
    const card = page.getByTestId("match-card").nth(i);
    const breakdown = await openGame(card);
    const timeline = await section(breakdown, "timeline");
    await expect(timeline.getByTestId("timeline-loading")).toHaveCount(0, { timeout: 15_000 });
    // Read before switching: a section that is not shown is not in the page.
    const none = (await timeline.getByTestId("timeline-message").count()) > 0;
    const lane = (await section(breakdown, "analysis")).getByTestId("lane-comparison");
    if (none && (await lane.getAttribute("data-state")) !== "none") {
      // No rows of dashes: the end of the game, and a line saying why 10:00 and 15:00 are missing.
      await expect(lane.getByTestId("lane-at-end")).toContainText(/[+−±]\d/);
      await expect(lane.getByTestId("lane-at-10")).toHaveCount(0);
      await expect(lane.getByTestId("lane-at-15")).toHaveCount(0);
      await expect(lane.getByTestId("lane-note")).not.toBeEmpty();
      return;
    }
    await closeGame(card);
  }
  throw new Error("no demo game without a timeline on the first page");
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
  // On a touch screen the tables run with the page (a box scrolling inside it would catch the finger); with a mouse the table scrolls in its box.
  const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  expect(await timeline.getByTestId("gold-chart-table").locator("xpath=..").evaluate((el) => getComputedStyle(el).overflowY)).toBe(coarse ? "visible" : "auto");
  // Switching sections reuses the one answer: Build and Analysis ask for nothing more.
  const before = posts.length;
  await section(breakdown, "build");
  await section(breakdown, "analysis");
  await section(breakdown, "timeline");
  await expect(chart).toBeVisible();
  await page.waitForTimeout(300);
  expect(posts.length - before).toBe(0);
});

test("Timeline marks the kills and objectives, lists the largest swings beside what happened in those minutes, and holds every event as a table", async ({ page }) => {
  await openHistory(page);
  const { timeline } = await gameWithTimeline(page);
  const chart = timeline.getByTestId("gold-chart");
  // Each team's kills along the chart: the demo keeps all ten players' kills.
  const kills = chart.getByTestId("gold-chart-kills");
  await expect(kills).toBeAttached();
  expect(Number(await kills.getAttribute("data-own")) + Number(await kills.getAttribute("data-enemy"))).toBeGreaterThan(0);
  // Objectives under the curve, by the team that took them; the legend names only the kinds shown.
  const markers = chart.getByTestId("timeline-objective");
  expect(await markers.count()).toBeGreaterThan(0);
  const kinds = new Set(await markers.evaluateAll((els) => els.map((e) => e.getAttribute("data-kind"))));
  const legend = chart.getByTestId("gold-chart-legend");
  const words: Record<string, string> = { dragon: "D dragon", elder: "E elder", grubs: "G voidgrubs", herald: "H herald", atakhan: "A Atakhan", baron: "B Baron", tower: "T tower", inhibitor: "I inhibitor" };
  for (const [kind, word] of Object.entries(words)) {
    if (kinds.has(kind)) await expect(legend).toContainText(word);
    else await expect(legend).not.toContainText(word);
  }
  for (const own of await markers.evaluateAll((els) => els.map((e) => e.getAttribute("data-own")))) expect(["true", "false"]).toContain(own);
  // No two marks under the curve overlap, on a phone too: a busy minute takes more rows, so each
  // mark stays legible and can be touched on its own.
  const overlapping = await chart.getByTestId("gold-chart-events").evaluate((el) => {
    const boxes = [...el.querySelectorAll("[data-minute]")].map((e) => e.getBoundingClientRect());
    return boxes.flatMap((a, i) => boxes.slice(i + 1).filter((b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5)).length;
  });
  expect(overlapping, "marks under the curve that overlap").toBe(0);
  // A minute read by keyboard says what happened since the minute before, somewhere in the game.
  const frames = await timeline.getByTestId("gold-chart-table").locator("tbody tr").count();
  await chart.getByTestId("gold-chart-svg").focus();
  await page.keyboard.press("Home");
  let told = false;
  for (let i = 1; i < frames && !told; i++) {
    await page.keyboard.press("ArrowRight");
    told = /since the minute before: /.test(await chart.getByTestId("gold-chart-readout").innerText());
  }
  expect(told, "a minute with a kill or an objective says so").toBe(true);
  // The largest swings, when the gold moved enough: each with its window and the events beside it, never a cause.
  for (const swing of await timeline.getByTestId("gold-swing").all()) {
    await expect(swing).toHaveText(/^\d+:\d{2}–\d+:\d{2} [+−][\d,]+/);
    await expect(swing.getByTestId("gold-swing-events")).toHaveText(/^In those minutes: /);
    await expect(swing).not.toContainText(/because|caused|due to|thanks to/i);
  }
  // Every event in words: objectives by team, and the player's own kills, assists and deaths.
  await timeline.getByText("Every objective, and your kills, assists and deaths").click();
  const rows = timeline.getByTestId("timeline-events-table").locator("tbody tr");
  expect(await rows.count()).toBeGreaterThanOrEqual(await markers.count());
  for (const side of await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-side")))) expect(["own", "enemy", "you"]).toContain(side);
  // Each row carries the chart's mark for its kind of event.
  expect(await rows.evaluateAll((els) => els.filter((e) => !e.querySelector("td:nth-child(2) [aria-hidden='true'] > *")).length)).toBe(0);
  await fitsWidth(page, "Timeline events");
});

test("a mark under the curve reads the minute that holds it; a touch keeps its reading after the finger lifts", async ({ page }) => {
  await openHistory(page);
  const { timeline } = await gameWithTimeline(page);
  const chart = timeline.getByTestId("gold-chart");
  const readout = chart.getByTestId("gold-chart-readout");
  const mark = chart.getByTestId("timeline-objective").first();
  const minute = Number(await mark.getAttribute("data-minute"));
  const touch = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  await mark.scrollIntoViewIfNeeded();
  if (touch) await mark.tap();
  else await mark.hover();
  // The reading names the objective: its frame is the first at or after the objective's moment.
  await expect(readout).toContainText(/since the minute before: .*for (your team|the other team)/);
  const [m, s] = (await readout.innerText()).split(" · ")[0]!.split(":").map(Number);
  const read = m! + s! / 60;
  expect(read).toBeGreaterThanOrEqual(minute - 1 / 60);
  expect(read - minute).toBeLessThan(1.5);
  if (touch) {
    // The finger has lifted: the reading stays until the next touch.
    await page.waitForTimeout(300);
    await expect(readout).toContainText("since the minute before: ");
  } else {
    // A mouse's reading ends when it leaves the chart.
    await page.mouse.move(1, 1);
    await expect(readout).toHaveText(/^Hover, touch or use the arrow keys/);
  }
});

test("a touch just beside a mark under the curve reads that mark, not the minute under the finger", async ({ page }) => {
  await openHistory(page);
  const { timeline } = await gameWithTimeline(page);
  const chart = timeline.getByTestId("gold-chart");
  const readout = chart.getByTestId("gold-chart-readout");
  const spot = await besideAMark(chart);
  expect(spot, "an objective with room beside it").not.toBeNull();
  if (await page.evaluate(() => matchMedia("(pointer: coarse)").matches)) await page.touchscreen.tap(spot!.x, spot!.y);
  else await page.mouse.move(spot!.x, spot!.y);
  // The objective's reading: the first frame at or after it, naming it.
  await expect(readout).toContainText(/since the minute before: .*for (your team|the other team)/);
  const [m, s] = (await readout.innerText()).split(" · ")[0]!.split(":").map(Number);
  const read = m! + s! / 60;
  expect(read).toBeGreaterThanOrEqual(spot!.minute - 1 / 60);
  expect(read - spot!.minute).toBeLessThan(1.5);
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
