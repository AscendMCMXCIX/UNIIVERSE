import fs from "node:fs";
import { expect, test, type Page } from "./test";
import { memberContext } from "./member-account";

/*
  CLASH SCOUT TESTING LAB (/clash/lab). The browser tests have no Riot key: the stand-in answers
  for Riot (made-up mastery, labelled as such on every result), and the in-memory demo's recorded
  games on EUW are the "known accounts" (named "Demo Rival 7#DEMO" and so on, several accounts to a
  name). What is tested here is the page: who may open it, typing a test (figures read with their
  precision, duplicates refused, lines pasted, a full Riot ID checked), one Run, the results (never
  "correct" without known answers), a blind test (answers never shown before the run, conditions A
  and B apart), outdated-data versions, a test file saved and opened again, nothing kept by the
  browser, and the layout on a phone.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

async function openLab(page: Page) {
  await page.goto("/clash/lab", { waitUntil: "load" });
  await expect(page.getByTestId("clash-lab")).toHaveAttribute("data-ready", "true");
}
const players = (page: Page) => page.getByTestId("lab-player");
const results = (page: Page) => page.getByTestId("lab-manual-results").getByTestId("lab-result");

/** Chooses a champion for a player's slot from the searchable list. */
async function choose(page: Page, slot: number, index: number, name: string, id = name) {
  await players(page).nth(slot).getByTestId("lab-entry-champion").nth(index).click();
  const list = page.getByRole("dialog", { name: `Player ${slot + 1}, champion ${index + 1}` });
  await list.getByRole("searchbox").fill(name);
  await list.locator(`button[data-champion="${id}"]`).first().click();
  await expect(list).toBeHidden();
}

test("the Testing Lab is the Owner's and administrators': Clash Scout links to it, a member is told it does not exist", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop", "permissions are the same at every size");
  await page.goto("/clash");
  await page.getByTestId("clash-lab-link").click();
  await expect(page).toHaveURL(/\/clash\/lab$/);
  await expect(page.getByTestId("lab-banner")).toContainText("Test environment.");
  await expect(page.getByTestId("lab-banner")).toContainText("stand-in");
  const member = await memberContext(browser, page);
  await member.page.goto("/clash");
  await expect(member.page.getByRole("heading", { name: "Clash Scout" })).toBeVisible();
  await expect(member.page.getByTestId("clash-lab-link")).toHaveCount(0);
  await member.page.goto("/clash/lab");
  await expect(member.page.getByTestId("not-found")).toContainText("This page does not exist");
  await expect(member.page.getByTestId("clash-lab")).toHaveCount(0);
  await member.context.close();
});

test("a manual test: example data, one Run, a result for each player, and nothing called correct", async ({ page }, info) => {
  test.skip(info.project.name === "tablet", "phone and desktop cover the page");
  await openLab(page);
  await expect(players(page)).toHaveCount(5);
  await page.getByTestId("lab-example").click();
  await expect(players(page).first().getByTestId("lab-player-name")).toHaveValue("Top Example");
  await expect(players(page).first().getByTestId("lab-entry-hint").first()).toHaveText("450,000 exactly");
  await expect(players(page).nth(2).getByTestId("lab-entry-hint").first()).toHaveText("1.2m: 1,150,000 to 1,249,999");
  await page.getByTestId("lab-run").click();
  await expect(results(page)).toHaveCount(5);
  // Nobody known has these names: each says so, and no result is graded.
  await expect(page.getByTestId("lab-manual-results").locator('[data-testid="lab-result"][data-outcome="not-discovered"]')).toHaveCount(5);
  await expect(page.getByTestId("lab-manual-results").locator("[data-grade]")).toHaveCount(0);
  await expect(page.getByTestId("lab-manual-results")).toContainText("No right answers are known in a manual test");
  await expect(page.getByTestId("lab-manual-results").getByTestId("lab-stand-in")).toBeVisible();
  await expect(page.getByTestId("lab-summary-tile").filter({ hasText: "Players tested" })).toContainText("5");
  await expect(page.getByTestId("lab-run")).toHaveText(/Run again/);
  // A change makes the results stale until the next run.
  await players(page).first().getByTestId("lab-player-name").fill("Top Example 2");
  await expect(page.getByTestId("lab-stale")).toBeVisible();
  await expect(page.getByTestId("lab-run")).toHaveText(/Run Identification Test/);
});

test("entries are read as typed: precision shown, a duplicate champion refused, and a full Riot ID checked with Riot", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one pass is enough for the checks");
  await openLab(page);
  await page.getByTestId("lab-server").selectOption("euw1");
  const first = players(page).first();
  await first.getByTestId("lab-player-name").fill("Demo Rival 7#DEMO");
  await expect(first).toContainText("Riot checks this exact Riot ID");
  await choose(page, 0, 0, "Ahri");
  await first.getByTestId("lab-entry-points").nth(0).fill("150.4k");
  await expect(first.getByTestId("lab-entry-hint").first()).toHaveText("150.4k: 150,350 to 150,449");
  await choose(page, 0, 1, "Lux");
  await first.getByTestId("lab-entry-points").nth(1).fill("12x");
  await expect(first.getByTestId("lab-entry-hint").nth(1)).toHaveClass(/text-bad/);
  await first.getByTestId("lab-entry-points").nth(1).fill("90k");
  // The list offers no champion this player already has.
  await first.getByTestId("lab-entry-champion").nth(2).click();
  const list = page.getByRole("dialog", { name: "Player 1, champion 3" });
  await list.getByRole("searchbox").fill("Ahri");
  await expect(list.locator('button[data-champion="Ahri"]').first()).toBeDisabled();
  await list.getByRole("button", { name: "Close" }).click();
  // A second player with points but no name: refused where it is, after Run.
  await choose(page, 1, 0, "Lux");
  await players(page).nth(1).getByTestId("lab-entry-points").first().fill("20k");
  await page.getByTestId("lab-run").click();
  await expect(players(page).nth(1)).toContainText("Enter the name shown, or clear this player.");
  await expect(page.getByTestId("lab-run-status")).toContainText("One entry needs a look.");
  await players(page).nth(1).getByTestId("lab-player-menu-button").click();
  await page.getByRole("menuitem", { name: "Clear this player" }).click();
  await page.getByTestId("lab-run").click();
  const result = results(page).first();
  await expect(result).toHaveAttribute("data-outcome", "verified");
  await expect(result.getByTestId("lab-candidate").first()).toHaveAttribute("data-verified", "true");
  await expect(result).toContainText("Without the tag, by mastery alone:");
  // Accounts are named by their Riot ID; never a PUUID.
  await expect(page.locator("body")).not.toContainText(/demo-filler|demo-together|demo-duo/);
});

test("lines pasted fill a player, and a player is copied to another", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one pass is enough");
  await openLab(page);
  await players(page).first().getByTestId("lab-player-menu-button").click();
  await page.getByRole("menuitem", { name: "Paste lines…" }).click();
  await page.getByTestId("lab-paste-text").fill("Riven Main\n1. Riven 450,000\nAmbessa — 175k\nKai'Sa: 120.3k\nNot A Champion 5k");
  await expect(page.getByTestId("lab-paste-preview")).toContainText("Name: Riven Main");
  await expect(page.getByTestId("lab-paste-preview")).toContainText("Riven 450,000 · Ambessa 175k · Kai'Sa 120.3k");
  await expect(page.getByTestId("lab-paste-preview")).toContainText(/Not champions: Not A Champion$/);
  await page.getByTestId("lab-paste-apply").click();
  const first = players(page).first();
  await expect(first.getByTestId("lab-player-name")).toHaveValue("Riven Main");
  await expect(first.getByTestId("lab-entry-points").nth(2)).toHaveValue("120.3k");
  await first.getByTestId("lab-player-menu-button").click();
  await page.getByRole("menuitem", { name: "Copy to Player 4" }).click();
  await expect(players(page).nth(3).getByTestId("lab-player-name")).toHaveValue("Riven Main");
  await expect(players(page).nth(3).getByTestId("lab-entry-points").first()).toHaveValue("450,000");
});

test("a blind test: names and figures only until the run, then graded under A and B apart; its versions compared", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one pass is enough for the blind and outdated tests");
  await openLab(page);
  await page.getByTestId("lab-mode-blind").click();
  await page.getByTestId("lab-blind-server").selectOption("euw1");
  await page.getByTestId("lab-blind-players").getByRole("radio", { name: "3" }).click();
  await page.getByTestId("lab-blind-generate").click();
  const preview = page.getByTestId("lab-blind-player");
  await expect(preview).toHaveCount(3);
  // What a screen shows: no tag, no account; the answers stay on the server.
  for (const name of await preview.locator("span[lang]").allInnerTexts()) expect(name).not.toContain("#");
  await expect(page.getByTestId("lab-blind-test")).toContainText("Answers sealed on the server");
  await page.getByTestId("lab-blind-run").click();
  await expect(page.getByTestId("lab-blind-comparison")).toContainText("A · Real discovery");
  const a = page.getByTestId("lab-blind-results-discovery");
  await expect(a.getByTestId("lab-result")).toHaveCount(3);
  await expect(a.locator("[data-grade]")).toHaveCount(3);
  await expect(a.getByTestId("lab-result-truth").first()).toContainText("Right account:");
  await page.getByTestId("lab-blind-view-controlled").click();
  const b = page.getByTestId("lab-blind-results-controlled");
  await expect(b).toContainText("It is not evidence that Clash Scout can discover arbitrary opponents.");
  await expect(b.getByTestId("lab-result")).toHaveCount(3);
  // Every right account is in the controlled pool, so each one is listed and ranked.
  await expect(b.locator('[data-testid="lab-candidate"][data-truth="true"]')).toHaveCount(3);

  // Outdated data, on this blind test: a renamed player and close decoys.
  await page.getByTestId("lab-mode-outdated").click();
  await expect(page.getByTestId("lab-outdated-source-blind")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("lab-preset-identity").click();
  await page.getByTestId("lab-outdated-run").click();
  const rows = page.getByTestId("lab-outdated-row");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveAttribute("data-kind", "baseline");
  // Nobody has the new name: discovery finds no right account, the pool still does.
  const renamedRow = page.locator('[data-testid="lab-outdated-row"][data-kind="renamed"]');
  await expect(renamedRow.locator("td").nth(1)).toContainText("/3");
  await renamedRow.getByTestId("lab-outdated-details").click();
  await expect(page.getByTestId("lab-outdated-run-view").getByTestId("lab-result")).toHaveCount(3);
  // A version goes to the manual test as an editable copy, without its answers.
  await renamedRow.getByTestId("lab-outdated-edit").click();
  await expect(page.getByTestId("lab-manual")).toBeVisible();
  await expect(page.getByTestId("lab-team")).toHaveValue(/The player changed their Riot ID/);
  await expect(players(page).first().getByTestId("lab-player-name")).toHaveValue(/ II$/);
});

test("a test file is saved and opened again; Reset clears the test; a reload forgets it, and the browser keeps nothing", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "files and storage are the same at every size");
  await openLab(page);
  await page.getByTestId("lab-example").click();
  const download = page.waitForEvent("download");
  await page.getByTestId("lab-export").click();
  const file = await (await download).path();
  const saved = JSON.parse(fs.readFileSync(file!, "utf8"));
  expect(saved).toMatchObject({ kind: "uniiverse-clash-lab", version: 1, scenario: { teamName: "Example opponents" } });
  await page.getByTestId("lab-reset").click();
  await page.getByTestId("lab-reset-confirm").click();
  await expect(players(page).first().getByTestId("lab-player-name")).toHaveValue("");
  await page.getByTestId("lab-import-input").setInputFiles(file!);
  await expect(players(page).first().getByTestId("lab-player-name")).toHaveValue("Top Example");
  await expect(page.getByTestId("lab-team")).toHaveValue("Example opponents");
  // Nothing of the test in the browser's storage; a reload starts empty.
  const stored = await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)].map((k) => `${k}=${localStorage.getItem(k) ?? sessionStorage.getItem(k)}`).filter((v) => /Example|lab/i.test(v)));
  expect(stored).toEqual([]);
  await page.reload();
  await expect(page.getByTestId("clash-lab")).toHaveAttribute("data-ready", "true");
  await expect(players(page).first().getByTestId("lab-player-name")).toHaveValue("");
});

test("on a phone the Lab fits the screen: editors, results and the blind test, without sideways scrolling", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the phone layout");
  await openLab(page);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.getByTestId("lab-example").click();
  await page.getByTestId("lab-run").click();
  await expect(results(page)).toHaveCount(5);
  expect(await overflow()).toBeLessThanOrEqual(0);
  // The run button and the editors' controls stay large enough to tap.
  const run = await page.getByTestId("lab-run").boundingBox();
  expect(run!.height).toBeGreaterThanOrEqual(44);
  await page.getByTestId("lab-mode-blind").click();
  await expect(page.getByTestId("lab-blind-generate")).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.getByTestId("lab-mode-outdated").click();
  await expect(page.getByTestId("lab-variants")).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
});
