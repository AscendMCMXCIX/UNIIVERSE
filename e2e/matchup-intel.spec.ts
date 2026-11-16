import { expect, test, type Page } from "./test";
import { choiceIds, choose, cutOrSpilled, enemyAbilities, hydrated, localPictures, openMatchupIntel, openPicker, overflow, pickerCuts, pickerSpill, rosterIds } from "./matchup-intel";
import { untilStill } from "./modal-corner";

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
  // The row has the focus, so a screen reader lands there too.
  await expect(page.locator(`#${anchor}`)).toBeFocused();
  // The footer says where everything comes from, and what this is.
  const footer = page.getByTestId("matchup-footer");
  await expect(footer.getByTestId("matchup-footer-ddragon")).toHaveText(/^Ability names, icons and base cooldowns: Riot Data Dragon \d+\.\d+\.\d+ \(patch \d+\.\d+\)\.$/);
  await expect(footer.getByTestId("matchup-footer-checked")).toContainText(/checked on \d{1,2} [A-Z][a-z]{2} \d{4}/);
  // The wiki's credit: how its pages were used, who wrote them, the licence, and no endorsement.
  const wiki = footer.getByTestId("matchup-footer-wiki");
  await expect(wiki).toContainText("The curated notes are written in our own words from the League of Legends Wiki pages below.");
  await expect(wiki).toContainText("Their text is by League of Legends Wiki contributors, under CC BY-SA 3.0");
  await expect(wiki.getByTestId("matchup-footer-endorsement")).toHaveText("The wiki and its contributors do not endorse this page.");
  await expect(wiki).not.toContainText(/adapt/i);
  await expect(wiki.getByTestId("matchup-licence-link")).toHaveAttribute("href", "https://creativecommons.org/licenses/by-sa/3.0/");
  // Each page by its title, folded into one line until asked for, so a phone keeps the footer short.
  const pages = wiki.getByTestId("matchup-footer-wiki-pages");
  await expect(pages).not.toHaveAttribute("open", "");
  await expect(pages.getByTestId("matchup-source-link").first()).toBeHidden();
  await pages.locator(":scope > summary").click();
  await expect(pages).toHaveAttribute("open", "");
  await expect(pages.getByTestId("matchup-source-link").first()).toBeVisible();
  for (const a of await pages.getByTestId("matchup-source-link").all()) await expect(a).toHaveAttribute("href", /^https:\/\/wiki\.leagueoflegends\.com\/en-us\//);
  await expect(footer.getByTestId("matchup-footer-static")).toContainText("A static reference for preparation: no live tracking");
  await expect(footer.getByTestId("matchup-footer-riot")).toContainText("isn't endorsed by Riot Games");

  // The jump is an entry the router can restore: after another choice, Back shows this pair again,
  // never the later pair under this one's address.
  await choose(page, "enemy", "darius", "Darius");
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`\\?champion=Ambessa&vs=Renekton#${anchor}$`));
  await expect(page.getByTestId("matchup-pick-enemy")).toHaveAttribute("data-champion", "Renekton");
  await expect(page.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", "Renekton");
});

test("a pair without a curated briefing (Garen vs Darius) says so calmly, then the enemy's general reference", async ({ page }) => {
  await openMatchupIntel(page, "Garen", "Darius");
  const none = page.getByTestId("matchup-no-briefing");
  await expect(none).toContainText("No curated briefing for Garen vs Darius yet.");
  // The page's description promises nothing about the lane (it shows from md up).
  await expect(page.locator('[data-testid="matchup-intel"] > header h1 + p')).toHaveText("Garen vs Darius: the enemy's abilities and base cooldowns; no curated briefing yet.");
  await expect(none).toContainText("the general reference for Darius");
  await expect(page.getByTestId("matchup-briefing")).toHaveCount(0);
  await expect(page.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", "Darius");
  await expect(enemyAbilities(page)).toHaveCount(5);
  // Nobody has checked Darius: every line says it is Riot's data, not reviewed.
  for (const r of await enemyAbilities(page).all()) await expect(r.getByTestId("ability-cooldown-source")).toHaveText(/^(Riot's data, not reviewed|Not reviewed)$/);
  // For a champion with curated matchups, the fallback links to them.
  await openMatchupIntel(page, "Riven", "Garen");
  await expect(page.getByTestId("matchup-no-briefing").getByTestId("matchup-curated-link")).toHaveText(["Riven vs Mordekaiser"]);
});

test("no number where Riot's data cannot give one: charges, and two abilities in one slot", async ({ page }) => {
  // Riot's data alone, with nothing curated. CI's demo may read Data Dragon's current version, so
  // only abilities whose shape is their kit's are used: Powder Keg and Missile Barrage hold charges,
  // Jayce's Q is two abilities. Numbers known to be wrong (Rengar's) are the unit tests' to check.
  const cases: Array<[string, string, RegExp]> = [
    ["Gangplank", "E", /^Riot's data lists charges but not their recharge$/],
    ["Corki", "R", /^Riot's data lists charges but not their recharge$/],
    ["Jayce", "Q", /^Two abilities share this slot in Riot's data$/],
  ];
  for (const [champion, slot, words] of cases) {
    await openMatchupIntel(page, undefined, champion);
    await expect(row(page, slot).getByTestId("ability-cooldown-value"), `${champion} ${slot}`).toHaveText(words);
    await expect(row(page, slot).getByTestId("ability-cooldown-source"), `${champion} ${slot}`).toHaveText("Not reviewed");
  }
});

test("the picker's search: 16px, as you type, by name with case, accents and spaces ignored", async ({ page }) => {
  await openMatchupIntel(page);
  const win = await openPicker(page, "enemy");
  const search = win.getByTestId("matchup-picker-search");
  // 16px: a phone never zooms into it.
  expect(await search.evaluate((el) => getComputedStyle(el).fontSize)).toBe("16px");
  // The count's live region is there before anything is typed, so its first words are read.
  await expect(win.getByTestId("matchup-picker-count")).toHaveCount(1);
  await expect(win.getByTestId("matchup-picker-count")).toHaveAttribute("aria-live", "polite");
  await expect(win.getByTestId("matchup-picker-count")).toHaveText("");
  // The search band stays pinned at the window body's top edge, over its padding: no strip of
  // portraits shows above it while the roster scrolls.
  await expect(win.getByTestId("matchup-picker-grid").locator("button[data-champion]").first()).toBeVisible();
  const above = await win.evaluate(async (d) => {
    const band = d.querySelector('[data-testid="matchup-picker-search"]')!.closest(".sticky")!;
    let scroller = band.parentElement;
    while (scroller && !(scroller.scrollHeight > scroller.clientHeight + 5 && /(auto|scroll)/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
    if (!scroller) return null;
    scroller.scrollTop = 600;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const gap = band.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTop = 0;
    return gap;
  });
  expect(above, "the band's distance from the window body's top edge, scrolled").not.toBeNull();
  expect(Math.abs(above!)).toBeLessThanOrEqual(1);
  // Players' initials and nicknames find a champion, after every name match.
  await search.fill("tf");
  await expect.poll(async () => (await rosterIds(win))[0]).toBe("TwistedFate");
  await search.fill("j4");
  await expect.poll(() => rosterIds(win)).toEqual(["JarvanIV"]);
  await search.fill("kha");
  await expect.poll(() => rosterIds(win)).toEqual(["Khazix"]);
  // Each button is named once, by the name under its portrait: the portrait is hidden from
  // assistive technology ("Kha'Zix", not "Kha'Zix Kha'Zix").
  await expect(win.getByTestId("matchup-picker-grid").locator('button[data-champion="Khazix"]')).toHaveAccessibleName("Kha'Zix");
  // The field keeps its own name once something is typed (the clear button is beside its label, not
  // in it), and the clear button is a 44px target, measured once the window's opening motion (which
  // scales it from 97%) is over: typed into at once, it is still moving.
  await expect(search).toHaveAccessibleName("Search for the enemy by name");
  await untilStill(page);
  const clear = (await win.getByTestId("matchup-picker-clear").boundingBox())!;
  expect(Math.min(clear.width, clear.height)).toBeGreaterThanOrEqual(44);
  // ArrowDown goes to the portraits, ArrowUp from the first of them back to the search.
  await search.press("ArrowDown");
  await expect(win.getByTestId("matchup-picker-grid").locator('button[data-champion="Khazix"]')).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(search).toBeFocused();
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
  // The page's prompt opens the enemy's picker, which offers the curated matchups that exist for
  // your champion.
  await page.getByTestId("matchup-choose-enemy").click();
  const win = page.getByTestId("matchup-picker");
  await expect(win).toBeVisible();
  await expect.poll(() => choiceIds(win.getByTestId("matchup-picker-curated"))).toEqual(["Mordekaiser"]);
  await win.getByTestId("matchup-picker-curated").getByRole("button", { name: "Mordekaiser" }).click();
  await expect(win).toHaveCount(0);
  await expect(page).toHaveURL(/\/resources\/matchups\?champion=Riven&vs=Mordekaiser$/);
  await expect(page.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", "Mordekaiser");
  await expect(page.getByTestId("matchup-briefing")).toBeVisible();
  // The prompt went with the choice: focus is back on the enemy's slot, not lost to the page.
  await expect(page.getByTestId("matchup-pick-enemy")).toBeFocused();
  // Recent: what was chosen on that side lately.
  const again = await openPicker(page, "enemy");
  await expect.poll(() => choiceIds(again.getByTestId("matchup-picker-recent"))).toEqual(["Mordekaiser"]);
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
  // From sm the buttons follow the words, not the far end of the line.
  if ((page.viewportSize()?.width ?? 0) >= 640) {
    const gap = await line.evaluate((l) => l.querySelector("button")!.getBoundingClientRect().left - l.querySelector(":scope > span")!.getBoundingClientRect().right);
    expect(gap).toBeLessThanOrEqual(24);
  }
  await expect(page.getByTestId("matchup-pick-you-name")).toHaveText("Choose your champion");
  await expect(page.getByTestId("matchup-pick-you")).not.toHaveAttribute("data-champion", /./);
  await line.getByTestId("matchup-use-remembered").click();
  await expect(page).toHaveURL(/\?champion=Riven$/);
  // Use went with the offer: focus moved to the slot it filled, not off the page.
  await expect(page.getByTestId("matchup-pick-you")).toBeFocused();

  // Changed: another champion chosen as yours is remembered instead.
  await choose(page, "you", "garen", "Garen");
  await page.reload();
  await expect(line).toHaveAttribute("data-state", "remembered");
  await page.goto("/resources/matchups");
  await expect(line).toContainText("Remembered on this device: Garen");
  // Forgotten: nothing is offered, now or after a reload.
  await line.getByTestId("matchup-forget").click();
  await expect(line).toHaveAttribute("data-state", "none");
  await expect(page.getByTestId("matchup-pick-you")).toBeFocused();
  await page.reload();
  await expect(line).toHaveAttribute("data-state", "none");
  // A champion that came from a link is not remembered until asked. Remember and Forget are one
  // button whose words change, so focus stays on it.
  await openMatchupIntel(page, "Ambessa", "Renekton");
  await expect(line).toHaveAttribute("data-state", "other");
  // A button that looks like one: its own border, on a phone too.
  expect(await line.getByTestId("matchup-remember").evaluate((b) => getComputedStyle(b).borderTopWidth)).toBe("1px");
  await line.getByTestId("matchup-remember").click();
  await expect(line).toHaveAttribute("data-state", "remembered");
  await expect(line.getByTestId("matchup-forget")).toBeFocused();
  await line.getByTestId("matchup-forget").click();
  await expect(line).toHaveAttribute("data-state", "other");
  await expect(line.getByTestId("matchup-remember")).toBeFocused();
});

test("phone: the remembered line is one row in every state, the height it keeps before the page reads this device", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1000) >= 768, "a phone's widths");
  const line = page.getByTestId("matchup-remembered");
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 700 });
    await openMatchupIntel(page);
    // This device's memory, under whichever account's key (uniiverse.matchup-intel.v1, then the account's marker).
    await page.evaluate(() => Object.keys(window.localStorage).filter((k) => k.startsWith("uniiverse.matchup-intel.v1")).forEach((k) => window.localStorage.removeItem(k)));
    await page.reload();
    const steps: Array<[string, () => Promise<void>]> = [
      ["none", async () => undefined],
      ["remembered", () => choose(page, "you", "riven", "Riven")],
      ["offer", () => openMatchupIntel(page)],
      ["other", () => openMatchupIntel(page, "Ambessa", "Renekton")],
    ];
    for (const [state, step] of steps) {
      await step();
      await expect(line).toHaveAttribute("data-state", state);
      // The server's copy holds one 44px row while this device's storage is unknown: no state grows
      // past it, so nothing under the line moves once the storage has been read.
      expect(await line.evaluate((e) => e.getBoundingClientRect().height), `${state} at ${width}`).toBeLessThanOrEqual(45);
    }
  }
});

test("phone: Back in the top bar leads to Resources, as it is named, past the pairs chosen here", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1000) >= 768, "the phone's top bar");
  // A member's phone has no Resources tab: Resources, then its Matchup Intel tab.
  await page.goto("/resources");
  await page.getByTestId("resources-tab-matchups").click();
  await expect(page.getByRole("heading", { level: 1, name: "Matchup Intel" })).toBeVisible();
  await choose(page, "you", "riven", "Riven");
  await choose(page, "enemy", "morde", "Mordekaiser");
  const back = page.getByTestId("mobile-back");
  await expect(back).toContainText("Resources");
  await back.click();
  await expect(page).toHaveURL(/\/resources$/);
  // The browser's own Back still steps through the pairs (the swap test above).
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

test("no sideways scrolling at 320, 375, 430 (a large phone) and 768 wide, the picker window included", async ({ page }) => {
  for (const [width, height] of [
    [320, 640],
    [375, 667],
    [430, 932],
    [768, 1024],
  ] as const) {
    await page.setViewportSize({ width, height });
    for (const [you, enemy] of [["Ambessa", "Renekton"], ["Garen", "Darius"], [undefined, undefined]] as const) {
      await openMatchupIntel(page, you, enemy);
      expect(await overflow(page), `${you ?? "nothing"} vs ${enemy ?? "nothing"} at ${width}`).toBeLessThanOrEqual(1);
    }
    // The window's own content, measured once it is there (its loading tiles come first): with
    // nothing typed (the Recent row too, from the width before), then with results.
    const win = await openPicker(page, "you");
    if (width !== 320) await expect(win.getByTestId("matchup-picker-recent")).toBeVisible();
    expect(await pickerSpill(win), `the picker window at ${width}, nothing typed`).toBeLessThanOrEqual(1);
    await win.getByTestId("matchup-picker-search").fill("a");
    await expect(win.getByTestId("matchup-picker-count")).toBeVisible();
    expect(await pickerSpill(win), `the picker window at ${width}, with results`).toBeLessThanOrEqual(1);
    // A choice, so the next width's window has a Recent row.
    await win.getByTestId("matchup-picker-grid").locator("button[data-champion]").first().click();
    await expect(win).toHaveCount(0);
    await expect(page).toHaveURL(/[?&]champion=/);
  }
});

test("phone at 200% text: nothing is cut or spills sideways in the pickers, the briefing, the ability lists (every details part open) or the notes", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1000) >= 768, "a phone");
  // A 390px phone with its text at 200%, as the other large-text tests set it (html's font size: the
  // page's sizes are in rem, so everything but the screen grows). The three validation pairs: the
  // most a page holds, with a briefing, two curated champions and their level notes. Pictures drawn,
  // not their stand-ins.
  await localPictures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [you, enemy] of CURATED) {
    await openMatchupIntel(page, you, enemy);
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe("32px");
    // Every details part open (your champion's abilities, each ability's notes and sources), and
    // measured at rest: a chevron turns as its details opens, and a turning square is wider.
    await page.getByTestId("matchup-intel").evaluate(async (m) => {
      for (const d of m.querySelectorAll("details")) d.open = true;
      await document.fonts.ready;
      const finite = document.getAnimations().filter((a) => a.effect?.getComputedTiming().endTime !== Infinity);
      await Promise.all(finite.map((a) => a.finished.catch(() => undefined)));
    });
    expect(await overflow(page), `${you} vs ${enemy}: the page`).toBeLessThanOrEqual(1);
    for (const part of ["matchup-pickers", "matchup-briefing", "matchup-enemy-abilities", "matchup-your-abilities", "matchup-interactions", "matchup-level-notes"]) {
      await expect(page.getByTestId(part), `${you} vs ${enemy}: ${part}`).toBeVisible();
      expect.soft(await cutOrSpilled(page.getByTestId(part)), `${you} vs ${enemy}: ${part}`).toEqual([]);
    }
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

test("a repeated parameter reads its first value, as a link's own would, never a champion the roster does not know", async ({ page }) => {
  await page.goto("/resources/matchups?champion=Riven&champion=Riven&vs=Garen&vs=Darius");
  await expect(page.getByTestId("matchup-pick-you-name")).toHaveText("Riven");
  await expect(page.getByTestId("matchup-pick-enemy-name")).toHaveText("Garen");
  await expect(page.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", "Garen");
  await expect(page.getByTestId("matchup-unknown")).toHaveCount(0);
});

test("phone at 200% and 150% text: the states with one side or none chosen, and the picker window, are cut nowhere", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1000) >= 768, "a phone");
  await localPictures(page);
  const states: Array<[string, string, string]> = [
    ["nothing chosen", "", "matchup-empty"],
    ["only the enemy", "?vs=Mordekaiser", "matchup-need-you"],
    ["only yours", "?champion=Riven", "matchup-need-enemy"],
    ["an unknown champion", "?champion=Zzyzx&vs=Mordekaiser", "matchup-need-you"],
  ];
  for (const [width, percent] of [
    [390, 200],
    [320, 200],
    [320, 150],
  ] as const) {
    await page.setViewportSize({ width, height: 844 });
    for (const [name, query, part] of states) {
      await page.goto(`/resources/matchups${query}`);
      await expect(page.getByTestId(part)).toBeVisible();
      await page.addStyleTag({ content: `html { font-size: ${percent}% !important; }` });
      await page.evaluate(() => document.fonts.ready);
      const at = `${name} at ${width}px, ${percent}%`;
      expect(await overflow(page), `${at}: the page`).toBeLessThanOrEqual(1);
      for (const p of ["matchup-pickers", part]) expect.soft(await cutOrSpilled(page.getByTestId(p)), `${at}: ${p}`).toEqual([]);
    }
    // The picker window, with nothing typed and with results: whole portraits, whole names.
    const win = await openPicker(page, "you");
    await untilStill(page);
    expect(await pickerCuts(win), `the picker at ${width}px, ${percent}%, nothing typed`).toEqual([]);
    expect(await pickerSpill(win)).toBeLessThanOrEqual(1);
    await win.getByTestId("matchup-picker-search").fill("a");
    await expect(win.getByTestId("matchup-picker-count")).toBeVisible();
    expect(await pickerCuts(win), `the picker at ${width}px, ${percent}%, with results`).toEqual([]);
    await win.getByTestId("matchup-picker-close").click();
    await expect(win).toHaveCount(0);
  }
});

test("phone: the briefing's threat is on the first screen, above the tab bar: whole at 390 by 664, its first line at 320 by 568", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1000) >= 768, "a phone");
  for (const [width, height, whole] of [
    [390, 664, true],
    [320, 568, false],
  ] as const) {
    await page.setViewportSize({ width, height });
    for (const [you, enemy] of CURATED) {
      await openMatchupIntel(page, you, enemy);
      await hydrated(page);
      const m = await page.evaluate(() => {
        const bar = document.querySelector('[data-testid="phone-tabbar"]')!.getBoundingClientRect().top;
        const threat = document.querySelector('[data-testid="briefing-threat"] p')!;
        const range = document.createRange();
        range.selectNodeContents(threat);
        const lines = [...range.getClientRects()];
        const height = (side: string) => document.querySelector(`[data-testid="matchup-pick-${side}"]`)!.getBoundingClientRect().height;
        return { bar, scrollY: window.scrollY, firstLine: lines[0]!.bottom, last: threat.getBoundingClientRect().bottom, you: height("you"), enemy: height("enemy") };
      });
      const at = `${you} vs ${enemy} at ${width} by ${height}`;
      expect(m.scrollY, at).toBe(0);
      if (whole) expect(m.last, `${at}: the whole threat`).toBeLessThanOrEqual(m.bar);
      expect(m.firstLine, `${at}: the threat's first line`).toBeLessThanOrEqual(m.bar);
      // The two sides are as tall as each other, whichever name wraps.
      expect(Math.abs(m.you - m.enemy), `${at}: the sides' heights`).toBeLessThanOrEqual(1);
    }
  }
});

test("phone: a cooldown's dot and a source's comma never start a line, and a link's icon stays with its last word", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1000) >= 768, "a phone");
  for (const width of [320, 393]) {
    await page.setViewportSize({ width, height: 800 });
    for (const [you, enemy] of CURATED) {
      await openMatchupIntel(page, you, enemy);
      const problems = await page.getByTestId("matchup-intel").evaluate((root) => {
        for (const d of root.querySelectorAll("details")) d.open = true;
        const out: string[] = [];
        const charRect = (node: Node, i: number) => {
          const r = document.createRange();
          r.setStart(node, i);
          r.setEnd(node, i + 1);
          return r.getClientRects()[0] ?? r.getBoundingClientRect();
        };
        const lastText = (el: Element) => {
          let last: Text | null = null;
          const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          for (let t = walk.nextNode(); t; t = walk.nextNode()) if (t.textContent!.trim()) last = t as Text;
          return last;
        };
        for (const a of root.querySelectorAll('a[data-testid="matchup-source-link"]')) {
          const svg = a.querySelector("svg")!.getBoundingClientRect();
          const word = lastText(a.querySelector(".whitespace-nowrap")!);
          const end = word ? charRect(word, word.textContent!.trimEnd().length - 1) : null;
          if (!end || Math.abs(svg.top + svg.height / 2 - (end.top + end.height / 2)) > end.height / 2 || svg.left - end.right > 8) out.push(`the icon apart from "${a.textContent!.slice(0, 30)}"`);
          const next = a.nextSibling;
          if (next?.nodeType === Node.TEXT_NODE && /^\u2060?,/.test(next.textContent!) && charRect(next, next.textContent!.indexOf(",")).top > svg.bottom) out.push(`a comma starts a line after "${a.textContent!.slice(0, 30)}"`);
        }
        for (const p of root.querySelectorAll('[data-testid="ability-cooldown"], [data-testid="ability-checked-cooldown"]')) {
          let prev: Text | null = null;
          const walk = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
          for (let t = walk.nextNode() as Text | null; t; t = walk.nextNode() as Text | null) {
            const at = t.textContent!.indexOf("\u00a0·");
            if (at >= 0 && prev && charRect(t, at + 1).top > charRect(prev, prev.textContent!.trimEnd().length - 1).bottom - 2) out.push(`a dot starts a line in "${p.textContent!.slice(0, 40)}"`);
            if (t.textContent!.trim()) prev = t;
          }
        }
        return out;
      });
      expect(problems, `${you} vs ${enemy} at ${width}`).toEqual([]);
    }
  }
});

test("while a choice loads, the slots show it, a line says what is loading, the page under them is out of reach; then what came is announced", async ({ page }) => {
  await openMatchupIntel(page, "Riven", "Garen");
  await hydrated(page);
  // Hold the server's page for the next pair, as a slow connection or a cold start would.
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(
    (url) => url.pathname === "/resources/matchups" && url.searchParams.get("vs") === "Mordekaiser",
    async (route) => {
      await held;
      await route.continue();
    },
  );
  // A curated pair's link goes through the pickers' frame, as a pick does.
  await page.getByTestId("matchup-no-briefing").getByTestId("matchup-curated-link").click();
  await expect(page.getByTestId("matchup-pick-enemy")).toHaveAttribute("data-champion", "Mordekaiser");
  await expect(page.getByTestId("matchup-loading")).toHaveText("Loading Riven vs Mordekaiser…");
  await expect(page.getByTestId("matchup-status")).toHaveText("Loading Riven vs Mordekaiser…");
  const content = page.getByTestId("matchup-intel-content");
  await expect(content).toHaveAttribute("aria-busy", "true");
  expect(await content.evaluate((e) => (e as HTMLElement).inert)).toBe(true);
  // The focus is on the enemy's slot, out of the page that dims.
  await expect(page.getByTestId("matchup-pick-enemy")).toBeFocused();
  release();
  await expect(page).toHaveURL(/\?champion=Riven&vs=Mordekaiser$/);
  await expect(page.getByTestId("matchup-briefing")).toBeVisible();
  await expect(page.getByTestId("matchup-status")).toHaveText(/^Riven vs Mordekaiser: curated briefing, checked on patch \d+\.\d+\. Mordekaiser's abilities follow\.$/);
  expect(await content.evaluate((e) => (e as HTMLElement).inert)).toBe(false);
  await expect(page.getByTestId("matchup-loading")).toHaveCount(0);
  // A pick says what came the same way.
  await choose(page, "enemy", "darius", "Darius");
  await expect(page.getByTestId("matchup-status")).toHaveText("No curated briefing for Riven vs Darius yet. Darius's abilities follow.");
});

test("a tap on a side's slot before the page's code has run opens its picker once the code runs", async ({ page }) => {
  // The page's code held back: the page is drawn and can be tapped before it runs.
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(/\/_next\/static\/chunks\/.*\.js(\?|$)/, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/resources/matchups?champion=Riven", { waitUntil: "domcontentloaded" });
  const slot = page.getByTestId("matchup-pick-enemy");
  await slot.click();
  // Kept, and shown pressed, while the code is not there.
  await expect(slot).toHaveAttribute("aria-busy", "true");
  await expect(page.getByTestId("matchup-picker")).toHaveCount(0);
  release();
  await expect(page.getByTestId("matchup-picker")).toBeVisible();
  await expect(slot).not.toHaveAttribute("aria-busy", "true");
  // Once: it stays open.
  await page.waitForTimeout(500);
  await expect(page.getByTestId("matchup-picker")).toBeVisible();
});
