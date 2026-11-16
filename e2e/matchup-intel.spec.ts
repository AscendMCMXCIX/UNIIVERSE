import { expect, test, type Page } from "./test";
import { choose, enemyAbilities, openMatchupIntel, openPicker, overflow, rosterIds } from "./matchup-intel";

/*
  RESOURCES → MATCHUP INTEL (docs/MATCHUP_INTEL.md) on the in-memory demo, which stores Data
  Dragon's abilities for every champion (16.22.1) and curated notes for Ambessa vs Renekton, Gwen vs
  Ornn and Riven vs Mordekaiser. Pick your champion and the enemy (each in a picker window with a
  search), read the briefing where one exists, or the enemy's general reference where none does,
  then the enemy's five abilities with their base cooldowns. The choice lives in the address; your
  own champion is remembered on this device and offered, never assumed. A static reference: its
  sources are links only, and nothing is requested from the League of Legends Wiki. Runs on the
  phone, tablet and desktop projects.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

/** The pairs the demo has curated notes for. */
const CURATED: Array<[string, string]> = [
  ["Ambessa", "Renekton"],
  ["Gwen", "Ornn"],
  ["Riven", "Mordekaiser"],
];

const row = (page: Page, slot: string) => page.locator(`[data-testid="matchup-enemy-abilities"] [data-testid="ability-row"][data-slot="${slot}"]`);

test("a link to a pair opens it: both champions in their slots, the enemy's five abilities with their base cooldowns", async ({ page }) => {
  await openMatchupIntel(page, "Riven", "Mordekaiser");
  await expect(page.getByTestId("matchup-pick-you")).toHaveAttribute("data-champion", "Riven");
  await expect(page.getByTestId("matchup-pick-enemy")).toHaveAttribute("data-champion", "Mordekaiser");
  await expect(page.getByTestId("matchup-pick-enemy-name")).toHaveText("Mordekaiser");
  const rows = enemyAbilities(page);
  await expect(rows).toHaveCount(5);
  expect(await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-slot")))).toEqual(["P", "Q", "W", "E", "R"]);
  // "Base, without ability haste" is said once, for the list.
  await expect(page.getByTestId("matchup-enemy-abilities")).toContainText("Base cooldowns, without ability haste");
  for (const r of await rows.all()) {
    await expect(r.getByTestId("ability-name")).not.toBeEmpty();
    await expect(r.getByTestId("ability-cooldown-value")).not.toBeEmpty();
    // The icon from Data Dragon, or its key on a plain tile where it cannot load (these tests run offline).
    await expect(r.locator('img[src^="https://ddragon.leagueoflegends.com/cdn/"], [data-testid="ability-icon-standin"]')).toHaveCount(1);
  }
  // Your own champion's abilities are there too, folded away until asked for.
  const yours = page.getByTestId("matchup-your-abilities");
  await expect(yours).not.toHaveAttribute("open", "");
  await expect(yours.getByTestId("ability-row").first()).toBeHidden();
  await yours.locator(":scope > summary").click();
  await expect(yours).toHaveAttribute("open", "");
  await expect(yours.getByTestId("ability-row")).toHaveCount(5);
  await expect(yours.getByTestId("ability-row").first()).toBeVisible();

  // Cooldowns as Data Dragon gives them: one value at every rank said once, the others per rank.
  await openMatchupIntel(page, undefined, "Riven");
  await expect(row(page, "Q").getByTestId("ability-cooldown-value")).toHaveText("13 s at every rank");
  await openMatchupIntel(page, undefined, "Renekton");
  await expect(row(page, "W").getByTestId("ability-cooldown-value")).toHaveText(/^\d+(\.\d+)?( \/ \d+(\.\d+)?){4} s$/);
  // The passive's cooldown is never Data Dragon's to give: a number only where a source states one.
  await expect(row(page, "P").getByTestId("ability-cooldown-value")).not.toHaveText(/^0 s|^—$/);
});

test("Ambessa vs Renekton: the ten-second briefing, its chips jumping to the abilities, and when it was checked", async ({ page }) => {
  await openMatchupIntel(page, "Ambessa", "Renekton");
  const briefing = page.getByTestId("matchup-briefing");
  await expect(briefing).toBeVisible();
  await expect(briefing).toContainText("Ambessa vs Renekton");
  await expect(briefing.getByTestId("briefing-threat")).not.toBeEmpty();
  await expect(briefing.getByTestId("briefing-opportunity")).not.toBeEmpty();
  await expect(briefing.getByTestId("matchup-briefing-checked")).toContainText(/Checked on patch \d+\.\d+/);
  await expect(page.getByTestId("matchup-no-briefing")).toHaveCount(0);
  // A chip names the ability ("Renekton W") and jumps to its row.
  const chip = briefing.locator('[data-testid="briefing-ability"][data-anchor^="ability-Renekton-"]').first();
  await expect(chip).toHaveText(/^Renekton (passive|[QWER])$/);
  const anchor = (await chip.getAttribute("data-anchor"))!;
  await chip.click();
  await expect(page).toHaveURL(new RegExp(`#${anchor}$`));
  await expect(page.locator(`#${anchor}`)).toBeInViewport();
  // The footer says where everything comes from, and what this is.
  const footer = page.getByTestId("matchup-footer");
  await expect(footer.getByTestId("matchup-footer-ddragon")).toHaveText(/^Ability names, icons and base cooldowns: Riot Data Dragon \d+\.\d+\.\d+ \(patch \d+\.\d+\)\.$/);
  await expect(footer.getByTestId("matchup-footer-sources").first()).toContainText(/checked on \d{1,2} [A-Z][a-z]{2} \d{4}/);
  await expect(footer).toContainText("League of Legends Wiki, CC BY-SA 3.0");
  await expect(footer.getByTestId("matchup-footer-static")).toContainText("A static reference for preparation: no live tracking");
  await expect(footer).toContainText("isn't endorsed by Riot Games");
});

test("a pair without a curated briefing (Garen vs Darius) says so calmly, then the enemy's general reference", async ({ page }) => {
  await openMatchupIntel(page, "Garen", "Darius");
  const none = page.getByTestId("matchup-no-briefing");
  await expect(none).toContainText("No curated briefing for Garen vs Darius yet.");
  await expect(none).toContainText("the general reference for Darius");
  await expect(page.getByTestId("matchup-briefing")).toHaveCount(0);
  await expect(page.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", "Darius");
  await expect(enemyAbilities(page)).toHaveCount(5);
  // For a champion with curated matchups, the fallback links to them.
  await openMatchupIntel(page, "Riven", "Garen");
  await expect(page.getByTestId("matchup-no-briefing").getByTestId("matchup-curated-link")).toHaveText(["Riven vs Mordekaiser"]);
});

test("the picker's search: 16px, as you type, by name with case, accents and spaces ignored", async ({ page }) => {
  await openMatchupIntel(page);
  const win = await openPicker(page, "enemy");
  const search = win.getByTestId("matchup-picker-search");
  // 16px: a phone never zooms into it.
  expect(await search.evaluate((el) => getComputedStyle(el).fontSize)).toBe("16px");
  await search.fill("kha");
  await expect.poll(() => rosterIds(win)).toEqual(["Khazix"]);
  await search.fill("wu");
  await expect.poll(async () => (await rosterIds(win))[0]).toBe("MonkeyKing");
  await search.fill("dr m");
  await expect.poll(async () => (await rosterIds(win))[0]).toBe("DrMundo");
  await search.fill("zzzz");
  await expect(win.getByTestId("matchup-picker-count")).toHaveText("No champion matches “zzzz”.");
  // Escape clears what was typed, and only then closes the window.
  await search.press("Escape");
  await expect(search).toHaveValue("");
  await expect(win).toBeVisible();
  // Nothing typed: the whole roster.
  expect((await rosterIds(win)).length).toBeGreaterThan(100);
  await search.press("Escape");
  await expect(win).toHaveCount(0);
});

test("choosing both champions puts them in the address; the swap trades sides", async ({ page }) => {
  await openMatchupIntel(page);
  await expect(page.getByTestId("matchup-empty")).toBeVisible();
  await choose(page, "you", "riven", "Riven");
  await expect(page).toHaveURL(/\/resources\/matchups\?champion=Riven$/);
  await expect(page.getByTestId("matchup-need-enemy")).toBeVisible();
  // The enemy's picker offers the curated matchups that exist for your champion.
  const win = await openPicker(page, "enemy");
  await expect(win.getByTestId("matchup-picker-curated").locator("button[data-champion]")).toHaveText(["Mordekaiser"]);
  await win.getByTestId("matchup-picker-curated").getByRole("button", { name: "Mordekaiser" }).click();
  await expect(win).toHaveCount(0);
  await expect(page).toHaveURL(/\/resources\/matchups\?champion=Riven&vs=Mordekaiser$/);
  await expect(page.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", "Mordekaiser");
  await expect(page.getByTestId("matchup-briefing")).toBeVisible();
  // Recent: what was chosen on that side lately.
  const again = await openPicker(page, "enemy");
  await expect(again.getByTestId("matchup-picker-recent").locator("button[data-champion]")).toHaveText(["Mordekaiser"]);
  await again.getByTestId("matchup-picker-close").click();
  await expect(again).toHaveCount(0);

  await page.getByTestId("matchup-swap").click();
  await expect(page).toHaveURL(/\/resources\/matchups\?champion=Mordekaiser&vs=Riven$/);
  await expect(page.getByTestId("matchup-pick-you")).toHaveAttribute("data-champion", "Mordekaiser");
  await expect(page.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", "Riven");
  // Back returns to the pair before.
  await page.goBack();
  await expect(page).toHaveURL(/\?champion=Riven&vs=Mordekaiser$/);
  await expect(page.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", "Mordekaiser");
});

test("your champion is remembered on this device and offered after a reload, never assumed; it can be changed and forgotten", async ({ page }) => {
  await openMatchupIntel(page);
  const line = page.getByTestId("matchup-remembered");
  await expect(line).toHaveAttribute("data-state", "none");
  await choose(page, "you", "riven", "Riven");
  await expect(line).toHaveAttribute("data-state", "remembered");
  await expect(line).toContainText("Riven is remembered on this device");

  // No champion in the address: offered, not assumed.
  await page.goto("/resources/matchups");
  await expect(line).toHaveAttribute("data-state", "offer");
  await expect(line).toContainText("Remembered on this device: Riven");
  await expect(page.getByTestId("matchup-pick-you-name")).toHaveText("Choose your champion");
  await expect(page.getByTestId("matchup-pick-you")).not.toHaveAttribute("data-champion", /./);
  await line.getByTestId("matchup-use-remembered").click();
  await expect(page).toHaveURL(/\?champion=Riven$/);

  // Changed: another champion chosen as yours is remembered instead.
  await choose(page, "you", "garen", "Garen");
  await page.reload();
  await expect(line).toHaveAttribute("data-state", "remembered");
  await page.goto("/resources/matchups");
  await expect(line).toContainText("Remembered on this device: Garen");
  // Forgotten: nothing is offered, now or after a reload.
  await line.getByTestId("matchup-forget").click();
  await expect(line).toHaveAttribute("data-state", "none");
  await page.reload();
  await expect(line).toHaveAttribute("data-state", "none");
  // A champion that came from a link is not remembered until asked.
  await openMatchupIntel(page, "Ambessa", "Renekton");
  await expect(line).toHaveAttribute("data-state", "other");
  await line.getByTestId("matchup-remember").click();
  await expect(line).toHaveAttribute("data-state", "remembered");
});

test("the champion window links to Matchup Intel with its champion chosen", async ({ page }) => {
  await page.goto("/team");
  const id = await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id");
  await page.goto(`/players/${id}/champions`);
  const first = page.getByTestId("top-champion").first();
  const champion = (await first.getAttribute("data-champion"))!;
  const win = page.getByTestId("champion-detail");
  await expect(async () => {
    if (!(await win.isVisible())) await first.getByTestId("open-champion").click({ timeout: 2_000 });
    await expect(win).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  const link = page.getByTestId("champion-matchup-intel");
  await expect(link).toHaveAttribute("href", `/resources/matchups?champion=${champion}`);
  // With a lane opponent chosen in Matchups (the player's own games), the link names that pair.
  await page.getByTestId("champion-tab-matchups").click();
  const picker = page.getByTestId("opponent-picker-button");
  await expect(picker.or(page.getByTestId("matchups-empty"))).toBeVisible();
  if (await picker.isVisible()) await expect(link).toHaveAttribute("href", new RegExp(`^/resources/matchups\\?champion=${champion}&vs=[A-Za-z0-9]+$`));
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/resources/matchups\\?champion=${champion}(&vs=[A-Za-z0-9]+)?$`));
  await expect(page.getByTestId("matchup-pick-you")).toHaveAttribute("data-champion", champion);
});

test("sources are links that open in a new tab, cut off from the page; details expand; nothing is requested from the wiki", async ({ page }) => {
  const hosts = new Set<string>();
  page.on("request", (r) => hosts.add(new URL(r.url()).hostname));
  // A curated champion's ability with details, in the enemy's list (either side of a curated pair).
  const enemyDetails = page.getByTestId("matchup-enemy-abilities").getByTestId("ability-details");
  let found = false;
  for (const [you, enemy] of CURATED.flatMap(([a, b]) => [[a, b], [b, a]])) {
    await openMatchupIntel(page, you, enemy);
    if ((await enemyDetails.count()) > 0) {
      found = true;
      break;
    }
  }
  expect(found, "a curated champion has an ability with details").toBe(true);
  const details = enemyDetails.first();
  await details.scrollIntoViewIfNeeded();
  await expect(details.getByTestId("ability-details-body")).toBeHidden();
  await details.locator(":scope > summary").click();
  await expect(details).toHaveAttribute("open", "");
  await expect(details.getByTestId("ability-details-body")).toBeVisible();

  const links = page.locator('[data-testid="matchup-intel"] a[href^="http"]');
  expect(await links.count()).toBeGreaterThan(0);
  for (const a of await links.all()) {
    expect(await a.getAttribute("href")).toMatch(/^https:\/\/(wiki\.leagueoflegends\.com|ddragon\.leagueoflegends\.com|developer\.riotgames\.com|creativecommons\.org)\//);
    await expect(a).toHaveAttribute("target", "_blank");
    await expect(a).toHaveAttribute("rel", /noopener/);
    await expect(a).toHaveAttribute("rel", /noreferrer/);
    await expect(a).toContainText("(opens in a new tab)");
  }
  await page.waitForLoadState("networkidle");
  expect([...hosts].filter((h) => h === "wiki.leagueoflegends.com" || h.endsWith(".wiki.leagueoflegends.com"))).toEqual([]);
});

test("no sideways scrolling at 320, 375 and 768 wide, the picker window included", async ({ page }) => {
  for (const width of [320, 375, 768]) {
    await page.setViewportSize({ width, height: 800 });
    for (const [you, enemy] of [["Ambessa", "Renekton"], ["Garen", "Darius"], [undefined, undefined]] as const) {
      await openMatchupIntel(page, you, enemy);
      expect(await overflow(page), `${you ?? "nothing"} vs ${enemy ?? "nothing"} at ${width}`).toBeLessThanOrEqual(1);
    }
    const win = await openPicker(page, "you");
    await win.getByTestId("matchup-picker-search").fill("a");
    const spill = await win.evaluate((d) => {
      const box = d.getBoundingClientRect();
      return Math.max(0, ...[...d.querySelectorAll("*")].map((e) => e.getBoundingClientRect().right - box.right));
    });
    expect(spill, `the picker window at ${width}`).toBeLessThanOrEqual(1);
    await win.getByTestId("matchup-picker-close").click();
    await expect(win).toHaveCount(0);
  }
});

test("a champion the roster does not know is left out of the page, said so and never repeated back", async ({ page }) => {
  await page.goto("/resources/matchups?champion=Zzyzx%3Cb%3E&vs=Mordekaiser");
  await expect(page.getByTestId("matchup-unknown")).toBeVisible();
  await expect(page.getByTestId("matchup-pick-you-name")).toHaveText("Choose your champion");
  await expect(page.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", "Mordekaiser");
  // Not in the page's words, and not in any link or attribute it draws.
  await expect(page.locator("main")).not.toContainText("Zzyzx");
  expect(await page.locator("main").evaluate((m) => [...m.querySelectorAll("*")].flatMap((el) => [...el.attributes].map((a) => a.value)).filter((v) => v.includes("Zzyzx")))).toEqual([]);
});
