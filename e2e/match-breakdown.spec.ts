import { expect, test, type Locator, type Page } from "./test";
import { besideAMark, closeGame, opensFullScreen, openGame } from "./match-history";
import { NARROW_MOUSE_WINDOWS, expectInReach } from "./reach";
import { AxeBuilder } from "@axe-core/playwright";

/*
  A game's post-game view under its Match History card (demo data, in memory; on phones the window):
  one view without subtabs (the loadout, the rune page, six figure tiles with each of the player's
  figures once, the lane, the notes and the compact scoreboard), two folds for the gold over the game
  and the build and skill order, the open card folded into a header with Previous, Next and Close,
  and one history rule (Back closes the game, however many games were stepped through). The Timeline
  fold draws the gold difference and reads it minute by minute (keyboard, and as a table) with the
  kills, objectives and largest swings beside it (never a cause). The match timeline is asked for
  once as the game opens. Every sixth demo game has no stored timeline (and the demo has no Riot key
  to fetch it), so the timeline tests use the first game whose curve draws.
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

/** Opens one of the view's folds (closed by default). */
async function section(breakdown: Locator, key: "timeline" | "build") {
  const fold = breakdown.getByTestId(key === "timeline" ? "fold-gold" : "fold-build");
  if (!(await fold.evaluate((d) => (d as HTMLDetailsElement).open))) await fold.locator("summary").click();
  await expect(fold).toHaveAttribute("open", "");
  return fold;
}

/** The first of the newest games whose stored timeline draws the gold difference, its gold fold open. */
async function gameWithTimeline(page: Page): Promise<{ card: Locator; breakdown: Locator; timeline: Locator }> {
  for (let i = 0; i < 6; i++) {
    const card = page.getByTestId("match-card").nth(i);
    const breakdown = await openGame(card);
    await expect(breakdown.getByTestId("post-game-notes")).toBeVisible({ timeout: 15_000 });
    // A game Riot does not provide the timeline of says so once, quietly, and has no folds.
    if (await breakdown.getByTestId("timeline-missing").count()) {
      await closeGame(card);
      continue;
    }
    const timeline = await section(breakdown, "timeline");
    await expect(timeline.getByTestId("timeline-loading")).toHaveCount(0, { timeout: 15_000 });
    if (await timeline.getByTestId("gold-chart").count()) return { card, breakdown, timeline };
    await closeGame(card);
  }
  throw new Error("no demo game with a timeline among the newest six");
}

/** Nothing on the page is wider than the screen. */
async function fitsWidth(page: Page, label: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${label}: no sideways scrolling`).toBeLessThanOrEqual(1);
}

test("while the notes load, the view passes axe and says what loads as one polite status", async ({ page }) => {
  await openHistory(page, "TOP");
  // The game's own requests in order: the record, then the timeline (which the notes read).
  const actions: string[] = [];
  page.on("request", (r) => {
    const id = r.headers()["next-action"];
    if (r.method() === "POST" && id) actions.push(id);
  });
  const first = page.getByTestId("match-card").nth(0);
  await expect(await openGame(first)).toBeVisible();
  await expect(page.getByTestId("post-game-notes")).toBeVisible({ timeout: 15_000 });
  const timelineAction = actions[1];
  expect(timelineAction).toBeTruthy();
  await closeGame(first);
  // The next game's timeline held back, so its notes stay loading while axe reads the view (#323:
  // a named div there was aria-prohibited-attr, which a scan after the notes arrived never saw).
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/*", async (route) => {
    if (route.request().method() === "POST" && route.request().headers()["next-action"] === timelineAction) await held;
    await route.fallback();
  });
  const breakdown = await openGame(page.getByTestId("match-card").nth(1));
  const loading = breakdown.getByTestId("post-game-notes-loading");
  await expect(loading).toBeVisible();
  await expect(loading).toHaveAttribute("role", "status");
  await expect(loading).toHaveText("Loading the notes");
  const scan = await new AxeBuilder({ page }).include("[data-testid=match-breakdown]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(scan.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  release();
  await expect(breakdown.getByTestId("post-game-notes")).toBeVisible({ timeout: 15_000 });
  await expect(loading).toHaveCount(0);
});

test("one view without subtabs: the loadout names itself, each figure once, the lane, the notes and the scoreboard", async ({ page }) => {
  await openHistory(page, "TOP");
  const breakdown = await openGame(page.getByTestId("match-card").nth(1));
  await expect(breakdown.getByTestId("post-game-notes")).toBeVisible({ timeout: 15_000 });
  await expect(breakdown.locator("[role=tab]")).toHaveCount(0);
  // The inventory: six slots and the trinket; an icon names itself on focus (and on a tap), inside the screen.
  await expect(breakdown.getByTestId("post-game-items").locator(":scope > *")).toHaveCount(7);
  const icon = breakdown.getByTestId("post-game-items").getByTestId("loadout-icon").first();
  await icon.focus();
  const name = breakdown.getByTestId("loadout-name").first();
  await expect(name).toHaveText((await icon.getAttribute("aria-label"))!);
  const box = (await name.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  // Each of the player's figures once in the whole view: CS/min, KDA, kill participation and damage share.
  const text = await breakdown.innerText();
  const tiles = breakdown.getByTestId("post-game-figures");
  const cspm = (await tiles.getByTestId("figure-cs").innerText()).match(/(\d+\.\d) \/ min/)![1]!;
  const kda = (await tiles.getByTestId("figure-kda").innerText()).match(/(\d+\.\d\d) KDA/)?.[1];
  const share = (await tiles.getByTestId("figure-damage").innerText()).match(/(\d+%) of team/)![1]!;
  const count = (needle: string) => text.split(needle).length - 1;
  expect(count(`${cspm} / min`), "CS per minute once").toBe(1);
  if (kda) expect(count(`${kda} KDA`), "KDA once").toBe(1);
  expect(count(`${share} of team`), "damage share once").toBe(1);
  expect(await breakdown.getByTestId("participant-kda").filter({ hasText: /KDA|%/ }).count(), "scoreboard rows carry no ratio or share").toBe(0);
  // The notes: at most two Went well, two Went wrong and one Focus next, or one honest line.
  const notes = breakdown.getByTestId("post-game-notes");
  expect(Number(await notes.getAttribute("data-well"))).toBeLessThanOrEqual(2);
  expect(Number(await notes.getAttribute("data-wrong"))).toBeLessThanOrEqual(2);
  expect(Number(await notes.getAttribute("data-focus"))).toBeLessThanOrEqual(1);
  expect((await notes.getByTestId("post-game-note").count()) + (await notes.getByTestId("notes-fallback").count())).toBeGreaterThan(0);
  for (const n of await notes.getByTestId("post-game-note").allInnerTexts()) expect(n.split(/\s+/).length, n).toBeLessThanOrEqual(20);
  // The lane names the opponent or says it is not clear; both teams in the scoreboard.
  await expect(breakdown.getByTestId("post-game-lane")).toBeVisible();
  await expect(breakdown.getByTestId("participant")).toHaveCount(10);
  await fitsWidth(page, "post-game view");
});

test("a game without a timeline says so once, and its notes skip what the timeline would tell", async ({ page }) => {
  await openHistory(page, "TOP");
  for (let i = 0; i < 8; i++) {
    const card = page.getByTestId("match-card").nth(i);
    const breakdown = await openGame(card);
    await expect(breakdown.getByTestId("post-game-notes")).toBeVisible({ timeout: 15_000 });
    if (await breakdown.getByTestId("timeline-missing").count()) {
      await expect(breakdown.getByTestId("timeline-missing")).toHaveText("Timeline not available for this game");
      await expect(breakdown.getByTestId("post-game-folds")).toHaveCount(0);
      await expect(breakdown.getByText(/at 10 minutes|before 10 minutes/)).toHaveCount(0);
      return;
    }
    await closeGame(card);
  }
  throw new Error("no demo game without a timeline among the newest eight");
});

test("Previous and Next keep the open game's header in place; Escape closes and Back closes after three Nexts", async ({ page }) => {
  test.skip(opensFullScreen(page), "phones open the window (mobile-nav covers it)");
  await openHistory(page, "TOP");
  const cards = page.getByTestId("match-card");
  await openGame(cards.nth(1));
  const header = () => page.locator("li[data-expanded] [data-testid=match-card]");
  const y0 = (await header().boundingBox())!.y;
  const length = await page.evaluate(() => history.length);
  for (let i = 0; i < 3; i++) {
    const before = new URL(page.url()).searchParams.get("match");
    await page.getByTestId("game-header-next").click();
    await expect.poll(() => new URL(page.url()).searchParams.get("match")).not.toBe(before);
    await expect(page.locator("li[data-expanded] [data-testid=post-game-notes]")).toBeVisible({ timeout: 15_000 });
    expect(Math.abs((await header().boundingBox())!.y - y0), "the header keeps its place").toBeLessThanOrEqual(2);
    // The focus stays on Next, in the game now open.
    await expect(page.locator("li[data-expanded] [data-testid=game-header-next]")).toBeFocused();
  }
  // Switching replaced the one entry the opening added.
  expect(await page.evaluate(() => history.length)).toBe(length);
  const last = new URL(page.url()).searchParams.get("match")!;
  await page.goBack();
  await expect(page.locator("li[data-expanded]")).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("match")).toBeNull();
  await expect(page.locator(`[data-testid=match-row][data-match="${last}"]`)).toBeFocused();
  // Escape, with the focus in the open game, closes it and returns the focus to its card.
  await openGame(cards.nth(2));
  await page.locator("li[data-expanded] [data-testid=game-header-next]").focus();
  await page.keyboard.press("Escape");
  await expect(page.locator("li[data-expanded]")).toHaveCount(0);
  await expect(cards.nth(2).getByTestId("match-row")).toBeFocused();
});

test("a window 640–767px wide with a mouse (the phone's frame): a game opens as the window, its Close and Next in reach, nothing under the bars", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "a mouse in a narrow window: the desktop project, resized");
  for (const size of NARROW_MOUSE_WINDOWS) {
    await page.setViewportSize(size);
    await openHistory(page, "TOP");
    await openGame(page.getByTestId("match-card").nth(1));
    const win = page.locator("dialog[open][data-testid=match-detail]");
    await expect(win, `${size.width}×${size.height}`).toBeVisible();
    // Not under its card, where the pinned header and footer sat under the top bar and the tab bar.
    await expect(page.locator("li[data-expanded]")).toHaveCount(0);
    await expectInReach(page, [win.getByTestId("match-detail-close"), win.getByTestId("match-detail-next")]);
    await win.getByTestId("match-detail-close").click();
    await expect(win).toHaveCount(0);
  }
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
  // The folds reuse the one answer the opening asked for: opening Build asks for nothing more.
  const before = posts.length;
  await section(breakdown, "build");
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

test("Build lists what was bought minute by minute and the skill order; the rune page is in the loadout", async ({ page }) => {
  await openHistory(page);
  const { breakdown } = await gameWithTimeline(page);
  const build = await section(breakdown, "build");
  const steps = build.getByTestId("build-steps").locator(":scope > li");
  // The fold draws its content once it has opened (its toggle event, a moment after the click): wait for it.
  await expect(steps.nth(2)).toBeVisible();
  await expect(steps.first()).toContainText("0 min");
  await expect(build.getByTestId("skill-order").locator("li").first()).toHaveAttribute("title", /^Level 1: [QWE]$/);
  await expect(breakdown.getByTestId("rune-page")).toBeVisible();
  await fitsWidth(page, "Build");
});
