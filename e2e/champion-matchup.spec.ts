import { expect, test, type Page } from "./test";
import { expectNoSeriousAxe } from "./axe";
import { pick } from "./select";

/*
  MATCHUP INTEL (docs/MATCHUP_INTEL.md; the owner's request of 26 Nov 2026, item 4): Champion
  Intel's Compare with a lane. On the in-memory demo (server/demo/matchup-fixture.ts): Ahri against
  Zed in Mid has 14 Ranked Solo/Duo games with a timeline (the figures) and an opponent note on Zed;
  Riven against Darius in Top has 4 (the honest "figures show from 10") and a note on Darius; any
  other pair has none. The notes' other states come from the demo's test cookies.
*/

const isDesktop = (name: string) => name === "desktop";
const ready = (page: Page) => expect(page.getByTestId("lookup-view")).toHaveAttribute("data-ready", "true");
const band = (page: Page) => page.getByTestId("matchup-band");
const panel = (page: Page, n: 1 | 2) => page.locator(`[data-testid="lookup-panel"][data-panel="${n}"]`);
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const scrollers = (page: Page) => page.evaluate(() => [...document.querySelectorAll("main *")].filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1).length);
/** The band's bottom and the lowest of both champions' five ability rows, in px from the top of the screen. */
const fit = (page: Page) =>
  page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-testid="lookup-ability"]')].map((r) => r.getBoundingClientRect().bottom);
    const pe = [...document.querySelectorAll('[data-testid="lookup-ability"]:not([data-slot="R"])')].map((r) => r.getBoundingClientRect().bottom);
    return { band: document.querySelector('[data-testid="matchup-band"]')!.getBoundingClientRect().bottom, rows: Math.max(...rows), pe: Math.max(...pe), screen: innerHeight };
  });
const NEUTRAL = /\b(faster|slower|better|worse|advantage|stronger|weaker|favou?red|wins?|winning|counters?|easy|you|your|should|must|best|optimal)\b/i;

test("the Lane control turns Compare into Matchup Intel: the band above the board, its three blocks named in words, the lane in the address", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "the desktop");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/lookup?champion=Ahri&champion2=Zed");
  await ready(page);
  await expect(band(page)).toHaveCount(0);
  const lane = page.getByTestId("lookup-lane");
  await expect(lane).toHaveAccessibleName("Lane matchup for Ahri and Zed");
  await expect(lane.getByTestId("lookup-lane-ALL")).toHaveAttribute("aria-checked", "true");
  const entries = await page.evaluate(() => history.length);
  await lane.getByTestId("lookup-lane-MID").click();
  await expect(page).toHaveURL(/\/lookup\?champion=Ahri&champion2=Zed&lane=MID$/);
  await expect(band(page)).toHaveAttribute("data-lane", "MID");
  expect(await page.evaluate(() => history.length), "a lane replaces the address, as a champion does").toBe(entries);
  await expect(lane.getByTestId("lookup-lane-MID")).toHaveAttribute("aria-checked", "true");
  await expect(band(page).getByRole("heading", { level: 2 })).toHaveAccessibleName("Matchup Intel, Mid: Ahri against Zed");
  await expect(band(page).getByRole("heading", { level: 3 })).toHaveText(["Reviewed notes", "In the team's matches", "From Riot's data"]);
  await expect(panel(page, 1).getByTestId("lookup-side")).toHaveText("Playing");
  await expect(panel(page, 2).getByTestId("lookup-side")).toHaveText("Against");
  // A reload opens the same.
  await page.reload();
  await ready(page);
  await expect(band(page)).toHaveAttribute("data-lane", "MID");
  // The figures: 14 Solo/Duo games, each share with its 95% range.
  const team = band(page).getByTestId("matchup-team");
  await expect(team).toHaveAttribute("data-state", "shown");
  await expect(team).toHaveAttribute("data-queue", "solo");
  await expect(team).toHaveAttribute("data-games", "14");
  await expect(team.getByTestId("matchup-sample")).toHaveText(/^14 games · Season \d{4}/);
  await expect(team.getByTestId("matchup-ahead")).toHaveAttribute("data-of", "14");
  await expect(team.getByTestId("matchup-ahead").locator("dd")).toContainText(/\d+ of 14 · \d+% \(\d+–\d+%\)/);
  await expect(team.getByTestId("matchup-won").locator("dd")).toContainText(/\d+ of 14 · \d+% \(\d+–\d+%\)/);
  for (const id of ["matchup-median", "matchup-kills", "matchup-first-blood"]) await expect(team.getByTestId(id)).toBeVisible();
  // Riot's level-1 differences: of one quantity, equal to the columns' own figures.
  const lines = band(page).getByTestId("matchup-kit-line");
  await expect(lines).toHaveCount(5);
  const attack = band(page).locator('[data-testid="matchup-kit-line"][data-key="attackrange"]');
  const [a, b] = ((await attack.getAttribute("data-values")) ?? "").split(",").map(Number);
  expect(a).toBe(Number((await panel(page, 1).getByTestId("lookup-facts").getByTestId("lookup-range").textContent())!.replace(/,/g, "")));
  expect(b).toBe(Number((await panel(page, 2).getByTestId("lookup-facts").getByTestId("lookup-range").textContent())!.replace(/,/g, "")));
  await expect(attack.locator("dd")).toHaveText(`${Math.abs(a! - b!)} more for ${a! > b! ? "Ahri" : "Zed"}`);
  // The opponent note on Zed: fresh, its points with the abilities they rest on, its sources behind the fold.
  const notes = band(page).getByTestId("matchup-notes");
  await expect(notes).toHaveAttribute("data-state", "shown");
  await expect(notes.getByTestId("matchup-note")).toHaveAttribute("data-freshness", "fresh");
  await expect(notes.getByTestId("matchup-notes-meta")).toHaveText(/^Patch \d+\.\d+$/);
  await expect(notes.getByTestId("matchup-point")).toHaveCount(2);
  await expect(notes.getByTestId("matchup-ref").first()).toBeVisible();
  await notes.getByTestId("matchup-notes-more").locator("summary").click();
  await expect(notes.getByTestId("matchup-point")).toHaveCount(3);
  await expect(notes.getByTestId("matchup-sources")).toContainText("Riot's Data Dragon");
  // Neutral words only; nothing scrolls inside.
  expect(await band(page).textContent()).not.toMatch(NEUTRAL);
  expect(await scrollers(page)).toBe(0);
  await expectNoSeriousAxe(page, "Matchup Intel with figures", ["[data-testid=matchup-band]"]);
  // No lane again: Compare as it was.
  await lane.getByTestId("lookup-lane-ALL").click();
  await expect(page).toHaveURL(/\/lookup\?champion=Ahri&champion2=Zed$/);
  await expect(band(page)).toHaveCount(0);
  await expect(panel(page, 1).getByTestId("lookup-side")).toHaveCount(0);
});

test("Swap keeps the lane and shows the other side of the same games; ✕ drops the lane; a champion changed keeps it", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "the desktop");
  await page.goto("/lookup?champion=Ahri&champion2=Zed&lane=MID");
  await ready(page);
  const median = async () => Number(await band(page).getByTestId("matchup-median").getAttribute("data-gold"));
  const before = { gold: await median(), ahead: Number(await band(page).getByTestId("matchup-ahead").getAttribute("data-n")), won: Number(await band(page).getByTestId("matchup-won").getAttribute("data-n")) };
  const attack = await band(page).locator('[data-testid="matchup-kit-line"][data-key="attackrange"]').getAttribute("data-values");
  await page.getByTestId("lookup-swap").click();
  await expect(page).toHaveURL(/\/lookup\?champion=Zed&champion2=Ahri&lane=MID$/);
  await expect(band(page)).toHaveAttribute("data-a", "Zed");
  await expect(band(page).getByTestId("matchup-team")).toHaveAttribute("data-games", "14");
  expect(await median()).toBe(-before.gold);
  expect(Number(await band(page).getByTestId("matchup-won").getAttribute("data-n"))).toBe(14 - before.won);
  expect(Number(await band(page).getByTestId("matchup-ahead").getAttribute("data-n"))).toBeLessThanOrEqual(14 - before.ahead);
  await expect(band(page).locator('[data-testid="matchup-kit-line"][data-key="attackrange"]')).toHaveAttribute("data-values", attack!.split(",").reverse().join(","));
  await expect(panel(page, 1).getByTestId("lookup-side")).toHaveText("Playing");
  // Zed is played now: the note on Zed as the opponent no longer applies; none is written about Ahri.
  await expect(band(page).getByTestId("matchup-notes")).toHaveAttribute("data-state", "none");
  await expect(band(page).getByTestId("matchup-notes-line")).toHaveText("No reviewed notes for Zed vs Ahri in Mid yet.");
  // ✕ on the second column: one champion, no lane.
  await panel(page, 2).getByTestId("lookup-remove").click();
  await expect(page).toHaveURL(/\/lookup\?champion=Zed$/);
  await expect(band(page)).toHaveCount(0);
});

test("a pair with fewer than 10 games says so, with no percentage; a pair with none says that; the queue is chosen in the band, with no request", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "the desktop");
  await page.goto("/lookup?champion=Riven&champion2=Darius&lane=TOP");
  await ready(page);
  const team = band(page).getByTestId("matchup-team");
  await expect(team).toHaveAttribute("data-state", "few");
  await expect(team).toHaveAttribute("data-games", "4");
  await expect(team.getByTestId("matchup-team-line")).toHaveText("4 games in the team's matches (Ranked Solo/Duo, Season 2026). Figures show from 10.");
  expect(await team.textContent()).not.toMatch(/\d+%/);
  await expect(band(page).getByTestId("matchup-note")).toHaveAttribute("data-freshness", "fresh");
  await expectNoSeriousAxe(page, "Matchup Intel with few games", ["[data-testid=matchup-band]"]);
  // The queue: Ranked Flex, chosen in the band, in the address, with no request to the server.
  let requests = 0;
  page.on("request", (r) => r.url().includes("/lookup") && r.resourceType() !== "image" && (requests += 1));
  await pick(team.getByTestId("matchup-queue"), "flex");
  await expect(page).toHaveURL(/[?&]queue=flex(&|$)/);
  await expect(team).toHaveAttribute("data-queue", "flex");
  await expect(team.getByTestId("matchup-team-line")).toHaveText("No Ranked Flex games of Riven vs Darius in Top in the team's matches yet.");
  expect(requests).toBe(0);
  // A pair the team never met in that lane.
  await page.goto("/lookup?champion=Aatrox&champion2=Ahri&lane=MID");
  await ready(page);
  await expect(band(page).getByTestId("matchup-team")).toHaveAttribute("data-state", "none");
  await expect(band(page).getByTestId("matchup-notes-line")).toHaveText("No reviewed notes for Aatrox vs Ahri in Mid yet.");
});

test("the notes' states: not re-checked two patches on, hidden four patches on, hidden at once when Riot changed the opponent, each said in words", async ({ page, context, baseURL }, info) => {
  test.skip(!isDesktop(info.project.name), "the desktop");
  const notes = band(page).getByTestId("matchup-notes");
  await context.addCookies([{ name: "uniiverse-test-note-age", value: "2", url: baseURL! }]);
  await page.goto("/lookup?champion=Ahri&champion2=Zed&lane=MID");
  await ready(page);
  await expect(notes.getByTestId("matchup-note")).toHaveAttribute("data-freshness", "stale");
  await expect(notes.getByTestId("matchup-notes-meta")).toHaveText(/^Reviewed on \d+\.\d+ · not re-checked for \d+\.\d+$/);
  await expect(notes.getByTestId("matchup-point").first()).toBeVisible();
  await context.addCookies([{ name: "uniiverse-test-note-age", value: "4", url: baseURL! }]);
  await page.reload();
  await expect(notes.getByTestId("matchup-note-hidden")).toHaveAttribute("data-freshness", "hidden-old");
  await expect(notes.getByTestId("matchup-note-hidden")).toHaveText(/^A reviewed note is hidden: its last review \(\d+\.\d+\) is 4 patches old\.$/);
  await expect(notes.getByTestId("matchup-point")).toHaveCount(0);
  await context.clearCookies({ name: "uniiverse-test-note-age" });
  await context.addCookies([{ name: "uniiverse-test-kit-changed", value: "1", url: baseURL! }]);
  await page.reload();
  await expect(notes.getByTestId("matchup-note-hidden")).toHaveAttribute("data-freshness", "hidden-changed");
  await expect(notes.getByTestId("matchup-note-hidden")).toHaveText(/^A reviewed note is hidden: Riot's data for Zed changed after its review on \d+\.\d+\.$/);
  await expectNoSeriousAxe(page, "Matchup Intel with a hidden note", ["[data-testid=matchup-band]"]);
});

test("one screen: the band and both champions' five abilities at 1440 × 900 and 1920 × 1080, the band at 1366 × 768, the sidebar open and folded, with room to spare", async ({ page, context, baseURL }, info) => {
  test.skip(!isDesktop(info.project.name), "the desktop");
  test.setTimeout(120_000);
  for (const folded of [false, true]) {
    await context.clearCookies({ name: "uniiverse_sidebar" });
    if (folded) await context.addCookies([{ name: "uniiverse_sidebar", value: "collapsed", url: baseURL! }]);
    for (const [width, height] of [[1366, 768], [1440, 900], [1920, 1080]] as const) {
      await page.setViewportSize({ width, height });
      for (const path of ["/lookup?champion=Ahri&champion2=Zed&lane=MID", "/lookup?champion=Riven&champion2=Darius&lane=TOP", "/lookup?champion=Teemo&champion2=Jayce&lane=TOP"]) {
        await page.goto(path);
        await ready(page);
        await expect(band(page)).toBeVisible();
        const m = await fit(page);
        const where = `${path} at ${width} × ${height}${folded ? ", folded" : ""}`;
        // At least 12px to spare (CI's Chromium sets text a little wider than this container's).
        expect(m.band, `${where}: the band on screen`).toBeLessThanOrEqual(m.screen - 12);
        if (width >= 1440 && !path.includes("Teemo")) expect(m.rows, `${where}: the five abilities of both on screen`).toBeLessThanOrEqual(m.screen - 12);
        if (width >= 1440) expect(m.pe, `${where}: P to E of both on screen`).toBeLessThanOrEqual(m.screen - 12);
        expect(await overflow(page), where).toBeLessThanOrEqual(1);
        expect(await scrollers(page), where).toBe(0);
      }
    }
  }
});

test("phones and tablets: the blocks stack above the board, nothing wider than the screen at 100% and 200% text, the lane control's targets a finger's size", async ({ page }, info) => {
  test.skip(isDesktop(info.project.name), "phones and tablets");
  const sizes = info.project.name === "phone" ? [320, 375, 390, 430] : [info.project.use.viewport?.width ?? 820];
  for (const width of sizes) {
    for (const zoom of [100, 200]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/lookup?champion=Ahri&champion2=Zed&lane=MID");
      await ready(page);
      if (zoom === 200) await page.addStyleTag({ content: "html { font-size: 200% }" });
      await expect(band(page)).toBeVisible();
      const where = `${width}px at ${zoom}%`;
      expect(await overflow(page), where).toBeLessThanOrEqual(1);
      // Stacked: notes, then the team's matches, then Riot's data, one under the other.
      const tops = await band(page).evaluate((b) => ["matchup-notes", "matchup-team", "matchup-riot"].map((id) => b.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect().top));
      if (width < 900) expect(tops[0]! < tops[1]! && tops[1]! < tops[2]!, `${where}: stacked`).toBe(true);
      const small = await page.getByTestId("lookup-lane").locator("button").evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 44).length);
      expect(small, `${where}: the lane control's targets`).toBe(0);
    }
  }
  await expectNoSeriousAxe(page, "Matchup Intel on a phone or tablet", ["[data-testid=matchup-band]"]);
});

test("Matchup Intel's old address and All Champions' preview lead here with the lane", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "once");
  await page.goto("/resources/matchups?role=mid&champion=Ahri&vs=Zed");
  await expect(page).toHaveURL(/\/lookup\?champion=Ahri&champion2=Zed&lane=MID$/);
  await expect(band(page)).toHaveAttribute("data-lane", "MID");
});
