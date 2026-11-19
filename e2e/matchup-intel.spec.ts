import { AxeBuilder } from "@axe-core/playwright";
import sharp from "sharp";
import { expect, test, type Page } from "./test";
import { choiceIds, choose, cutOrSpilled, enemyAbilities, hydrated, localPictures, openMatchupIntel, openPicker, overflow, pickerCuts, pickerSpill, riotText, rosterIds } from "./matchup-intel";
import { untilStill } from "./modal-corner";
import { E2E_DDRAGON_VERSION } from "./ddragon-version";
import { patchFromVersion, publicPatchName } from "../src/domain/patch";

/*
  MATCHUP INTEL (docs/MATCHUP_INTEL.md), a sidebar entry of its own, on the in-memory demo, which stores Data
  Dragon's abilities for every champion at the pinned version (E2E_DDRAGON_VERSION, 16.22.1, the one
  the curated notes were checked on: playwright.config.ts) and curated notes for Ambessa vs
  Renekton, Gwen vs Ornn and Riven vs Mordekaiser. Pick your champion and the enemy (each in a
  picker window with a search), read the curated briefing where one exists, or the assembled
  reference (each champion's own facts, grouped by kind) where none does, beside the enemy's five
  ability tiles with their base cooldowns. The single-screen fit, a sweep of many pairs and the
  details windows are in e2e/matchup-intel-dashboard.spec.ts. The choice
  lives in the address; your own champion is remembered on this device and offered, never assumed.
  A static reference: its sources are links only, and nothing is requested from the League of
  Legends Wiki. Runs on the phone, tablet and desktop projects.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

/** The public name of the patch the demo's Data Dragon version belongs to ("26.22" for 16.22.1). */
const PINNED_PATCH = publicPatchName(patchFromVersion(E2E_DDRAGON_VERSION)!);

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
    // The icon from Data Dragon, or its key on a plain tile where it cannot load (these tests run offline):
    // one in sight (a narrow tile shows a smaller copy on its key's line instead).
    await expect(r.locator('img[src^="https://ddragon.leagueoflegends.com/cdn/"], [data-testid="ability-icon-standin"]').filter({ visible: true })).toHaveCount(1);
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
  // The unit is held to the last number by a no-break space, so a line never ends between them.
  await expect(row(page, "W").getByTestId("ability-cooldown-value")).toHaveText(/^\d+(\.\d+)?( \/ \d+(\.\d+)?){4}\u00a0s$/);
  // The passive's cooldown is never Data Dragon's to give: a number only where a source states one.
  // (\s: a space or a no-break space, so the check cannot pass on the space alone.)
  await expect(row(page, "P").getByTestId("ability-cooldown-value")).not.toHaveText(/^0\ss|^—$/);
});

test("Ambessa vs Renekton: the curated briefing, its chips jumping to the abilities, and when it was checked", async ({ page }) => {
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
  // The pinned version, read from Data Dragon: not the newest, and not the committed offline copy.
  await expect(footer.getByTestId("matchup-footer-ddragon")).toHaveText(`Ability names, icons and base cooldowns: Riot Data Dragon ${E2E_DDRAGON_VERSION} (patch ${PINNED_PATCH}).`);
  await expect(footer.getByTestId("matchup-footer-checked")).toContainText(/checked on \d{1,2} [A-Z][a-z]{2} \d{4}/);
  // The wiki's credit: how its pages were used, who wrote them, the licence, and no endorsement.
  const wiki = footer.getByTestId("matchup-footer-wiki");
  await expect(wiki).toContainText("The curated notes are written in our own words from the League of Legends Wiki pages below.");
  await expect(wiki).toContainText("Their text is by League of Legends Wiki contributors, under CC BY-SA 3.0");
  await expect(wiki.getByTestId("matchup-footer-endorsement")).toHaveText("The wiki and its contributors do not endorse this page.");
  await expect(wiki).not.toContainText(/adapt/i);
  await expect(wiki.getByTestId("matchup-licence-link")).toHaveAttribute("href", "https://creativecommons.org/licenses/by-sa/3.0/");
  // The sources and notices sit behind one control at the foot whose summary line stays on screen.
  const sources = footer.getByTestId("matchup-sources");
  await expect(footer.getByTestId("matchup-sources-summary")).toBeVisible();
  await expect(footer.getByTestId("matchup-sources-summary")).toContainText("A static reference: no live tracking");
  await expect(footer.getByTestId("matchup-sources-summary")).toContainText("Not endorsed by Riot Games");
  expect(await sources.evaluate((d) => (d as HTMLDetailsElement).open)).toBe(false);
  await sources.locator(":scope > summary").click();
  await expect(footer.getByTestId("matchup-footer-riot")).toBeVisible();
  // Each page by its title, folded into one line until asked for, so a phone keeps the footer short.
  const pages = wiki.getByTestId("matchup-footer-wiki-pages");
  await expect(pages).not.toHaveAttribute("open", "");
  await expect(pages.getByTestId("matchup-source-link").first()).toBeHidden();
  await pages.locator(":scope > summary").click();
  await expect(pages).toHaveAttribute("open", "");
  await expect(pages.getByTestId("matchup-source-link").first()).toBeVisible();
  for (const a of await pages.getByTestId("matchup-source-link").all()) await expect(a).toHaveAttribute("href", /^https:\/\/wiki\.leagueoflegends\.com\/en-us\//);
  await expect(footer.getByTestId("matchup-footer-static")).toHaveText("A static reference: no live tracking, no timers, nothing read from a game in progress.");
  await expect(footer.getByTestId("matchup-footer-riot")).toContainText("isn't endorsed by Riot Games");

  // The jump is an entry of its own; another choice replaces it (a lineup is the page's state, like a
  // filter), so Back shows the pair as it was before the jump, never the later pair under its address.
  await choose(page, "enemy", "darius", "Darius");
  await page.goBack();
  await expect(page).toHaveURL(/\?champion=Ambessa&vs=Renekton$/);
  await expect(page.getByTestId("matchup-pick-enemy")).toHaveAttribute("data-champion", "Renekton");
  await expect(page.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", "Renekton");
});

test("a pair without a curated briefing (Garen vs Darius) says so, then the assembled reference, labelled as such every time", async ({ page }) => {
  // Written with the facts from Riot's text on the page: turned on for it while they ship off.
  await riotText(page, "on");
  await openMatchupIntel(page, "Garen", "Darius");
  const none = page.getByTestId("matchup-no-briefing");
  await expect(none).toContainText("No curated briefing for Garen vs Darius yet.");
  // Put together from each champion's facts, and no person has checked the pair: said on it, and in the bar.
  await expect(page.getByTestId("matchup-assembled-label")).toHaveText("Put together from each champion's own facts. No person has checked Garen vs Darius as a pair.");
  await expect(page.getByTestId("matchup-layer")).toHaveAttribute("data-layer", "assembled");
  await expect(page.getByTestId("matchup-description")).toHaveText("Garen vs Darius: the enemy's abilities and base cooldowns; no curated briefing yet, so each champion's own facts follow.");
  await expect(page.getByTestId("matchup-briefing")).toHaveCount(0);
  // The danger side is Darius's kit, the opportunity side Garen's: each lists its groups by kind, or
  // says that it has no reviewed facts at all, never an empty box.
  for (const [side, name] of [
    ["danger", "Darius"],
    ["opportunity", "Garen"],
  ] as const) {
    const part = page.getByTestId(`assembled-${side}`);
    await expect(part).toBeVisible();
    if ((await part.getAttribute("data-from")) === "none") await expect(part.getByTestId("assembled-no-facts")).toHaveText(`No reviewed facts for ${name} yet: crowd control, mobility, defence and sustain are not recorded.`);
    else await expect(part.getByTestId("assembled-group")).toHaveCount(5);
  }
  await expect(page.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", "Darius");
  await expect(enemyAbilities(page)).toHaveCount(5);
  // Nobody has checked Darius's numbers: Riot's data, not reviewed, said once for his tiles; a line
  // with no number says its own.
  await expect(page.getByTestId("abilities-cooldown-source")).toHaveText("Cooldowns: Riot's data, not reviewed");
  for (const r of await enemyAbilities(page).all()) {
    const own = r.getByTestId("ability-cooldown-source");
    if (await own.count()) await expect(own).toHaveText("Not reviewed");
  }
  // Each side names its layer under its subtitle, and says once that its numbers are Riot's; your
  // champion's summary says it too, as the enemy's panel does.
  for (const side of ["danger", "opportunity"]) {
    const part = page.getByTestId(`assembled-${side}`);
    await expect(part.getByTestId("assembled-riot-text-label")).toHaveText("From Riot's ability text, reviewed automatically (not by a person)");
    await expect(part.getByTestId("assembled-cooldowns-source")).toHaveText("Cooldowns: Riot's data, not reviewed");
  }
  await expect(page.getByTestId("your-cooldown-source")).toHaveText("Cooldowns: Riot's data, not reviewed");
  // For a champion with curated matchups, the assembled reference links to them; your checked notes'
  // side names them and when they were checked.
  await openMatchupIntel(page, "Riven", "Garen");
  await expect(page.getByTestId("matchup-no-briefing").getByTestId("matchup-curated-link")).toHaveText(["Riven vs Mordekaiser"]);
  await expect(page.getByTestId("assembled-opportunity").getByTestId("assembled-source")).toHaveText(`Curated notes: checked on patch ${PINNED_PATCH}`);
  await expect(page.getByTestId("your-cooldown-source")).toHaveCount(0);
});

test("no number where Riot's data cannot give one: charges, and two abilities in one slot", async ({ page }) => {
  // Riot's data alone, with nothing curated, at the pinned version (E2E_DDRAGON_VERSION). Abilities
  // whose shape is their kit's, so they hold on any version: Powder Keg and Missile Barrage hold
  // charges, Jayce's Q is two abilities. Numbers known to be wrong (Rengar's) are the unit tests' to check.
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

test("the picker's search band leaves the window header's divider drawn, wherever the centred window sits", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, "a centred window");
  // A centred window sits at a fractional position (its header is 80.5px tall), and the band, pulled
  // up to the header's 1px divider, was rounded into the divider's row and painted over it (the
  // window's top at 289.75 at 1440x900 after "kha"). Its background now starts 1px lower.
  let fractional = 0;
  for (const height of [900, 860]) {
    await page.setViewportSize({ width: 1440, height });
    await openMatchupIntel(page, "Riven");
    const win = await openPicker(page, "enemy");
    await untilStill(page);
    for (const q of ["", "kha", "riv", "z", "ga"]) {
      await win.getByTestId("matchup-picker-search").fill(q);
      if (q) await expect(win.getByTestId("matchup-picker-count")).toContainText(/found|matches/);
      await untilStill(page);
      const g = await page.evaluate(() => {
        const header = document.querySelector('[data-testid="matchup-picker-header"]')!;
        const band = document.querySelector('[data-testid="matchup-picker-band"]')!;
        const h = header.getBoundingClientRect();
        return {
          top: document.querySelector("dialog[open]")!.getBoundingClientRect().top,
          headerBottom: h.bottom,
          x: h.left + h.width / 2,
          // Where the band's background starts: its top, below its border.
          bandFill: band.getBoundingClientRect().top + parseFloat(getComputedStyle(band).borderTopWidth),
          divider: getComputedStyle(header).borderBottomColor,
          fill: getComputedStyle(band).backgroundColor,
        };
      });
      if (g.top % 1 !== 0) fractional += 1;
      expect(g.bandFill - g.headerBottom, `${height}, "${q}": the band's background clear of the divider`).toBeGreaterThanOrEqual(0.99);
      // The divider's colour is in the pixel rows around the header's bottom edge.
      const rgb = (css: string) => css.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number);
      const [line, fill] = [rgb(g.divider), rgb(g.fill)];
      const y = Math.floor(g.headerBottom) - 3;
      const { data, info } = await sharp(await page.screenshot({ clip: { x: Math.round(g.x), y, width: 1, height: 7 } })).raw().toBuffer({ resolveWithObject: true });
      const rows = Array.from({ length: info.height }, (_, r) => [0, 1, 2].map((c) => data[r * info.width * info.channels + c]!));
      const near = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + Math.abs(v - b[i]!), 0) <= 6;
      expect(near(line, fill), "the divider differs from the band").toBe(false);
      expect(rows.some((px) => near(px, line)), `${height}, "${q}", window top ${g.top}: the divider is drawn`).toBe(true);
    }
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
  }
  // The case that hid it was checked.
  expect(fractional).toBeGreaterThan(0);
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
  await expect(page).toHaveURL(/\/resources\/matchups\?role=top&champion=Riven$/);
  await expect(page.getByTestId("matchup-need-enemy")).toBeVisible();
  // The page's prompt opens the enemy's picker, which offers the curated matchups that exist for
  // your champion.
  await page.getByTestId("matchup-choose-enemy").click();
  const win = page.getByTestId("matchup-picker");
  await expect(win).toBeVisible();
  await expect.poll(() => choiceIds(win.getByTestId("matchup-picker-curated"))).toEqual(["Mordekaiser"]);
  await win.getByTestId("matchup-picker-curated").getByRole("button", { name: "Mordekaiser" }).click();
  await expect(win).toHaveCount(0);
  await expect(page).toHaveURL(/\/resources\/matchups\?role=top&champion=Riven&vs=Mordekaiser$/);
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
  await expect(page).toHaveURL(/\/resources\/matchups\?role=top&champion=Mordekaiser&vs=Riven$/);
  await expect(page.getByTestId("matchup-pick-you")).toHaveAttribute("data-champion", "Mordekaiser");
  await expect(page.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", "Riven");
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
  await expect(page).toHaveURL(/\?role=top&champion=Riven$/);
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

/** On a phone, Matchup Intel from the bar: a destination of its own (navigation N1), one tap from anywhere. */
async function intelFromBar(page: Page) {
  await page.getByTestId("phone-tabbar").getByTestId("tab-resources-matchups").click();
  await expect(page).toHaveURL(/\/resources\/matchups$/);
}

test("phone: Matchup Intel is a tab of its own, with no Back in the top bar; each pair replaces the entry, so the browser's Back leaves it in one step", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1000) >= 768, "the phone's top bar");
  await page.goto("/resources");
  await intelFromBar(page);
  await expect(page.getByRole("heading", { level: 1, name: "Matchup Intel" })).toBeVisible();
  // A destination is where you start: no Back, the team's mark instead, and its tab marked.
  await expect(page.getByTestId("mobile-back")).toHaveCount(0);
  await expect(page.getByTestId("phone-tabbar").getByTestId("tab-resources-matchups")).toHaveAttribute("aria-current", "page");
  await choose(page, "you", "riven", "Riven");
  await choose(page, "enemy", "morde", "Mordekaiser");
  await expect(page.getByTestId("mobile-back")).toHaveCount(0);
  // The lineup is the page's state, like a filter (the overhaul's S4a table): it replaces the entry,
  // with or without the Navigation API, so the browser's Back leaves for the Library at once.
  await page.goBack();
  await expect(page).toHaveURL(/\/resources$/);
});

test("phone: Matchup Intel opened by a link has no Back either: it is a destination of its own, never under Resources or Team", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1000) >= 768, "the phone's top bar");
  await page.goto("/resources/matchups?champion=Riven&vs=Mordekaiser");
  await expect(page.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", "Mordekaiser");
  await expect(page.getByTestId("mobile-back")).toHaveCount(0);
  await expect(page.getByTestId("mobile-brand")).toBeVisible();
  await expect(page.getByTestId("phone-tabbar").getByTestId("tab-resources-matchups")).toHaveAttribute("aria-current", "page");
});

test("Matchup Intel is a destination of its own: the address and its pair open as they always did, with no tabs, marked as the page shown and Resources not", async ({ page }, info) => {
  // The old address and every deep link keep working, and nothing redirects.
  const response = await page.goto("/resources/matchups?champion=Riven&vs=Mordekaiser");
  expect(response?.status()).toBe(200);
  expect(response?.request().redirectedFrom()).toBeNull();
  await expect(page).toHaveURL(/\/resources\/matchups\?champion=Riven&vs=Mordekaiser$/);
  await expect(page.getByTestId("matchup-pick-you")).toHaveAttribute("data-champion", "Riven");
  await expect(page.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", "Mordekaiser");
  await expect(page.getByRole("heading", { level: 1, name: "Matchup Intel" })).toBeVisible();
  // No Library | Matchup Intel tabs on either page: each is one destination, never two.
  await expect(page.getByTestId("resources-tabs")).toHaveCount(0);
  await expect(page.locator("main a[href='/resources']")).toHaveCount(0);
  // Marked as the page shown where the frame lists it: the sidebar, a tablet's top bar, the phone's tab bar.
  const marks = async () => {
    if (info.project.name === "desktop") {
      const nav = page.locator("aside").getByRole("navigation", { name: "Main" });
      return { intel: nav.getByRole("link", { name: "Matchup Intel" }), resources: nav.getByRole("link", { name: "Resources" }) };
    }
    if (info.project.name === "tablet") {
      const nav = page.getByRole("navigation", { name: "Primary" });
      return { intel: nav.getByRole("link", { name: "Matchup Intel" }), resources: nav.getByRole("link", { name: "Resources" }) };
    }
    const bar = page.getByTestId("phone-tabbar");
    return { intel: bar.getByTestId("tab-resources-matchups"), resources: bar.getByTestId("tab-resources") };
  };
  let m = await marks();
  await expect(m.intel).toHaveAttribute("aria-current", "page");
  await expect(m.intel).toHaveAttribute("href", "/resources/matchups");
  await expect(m.resources).not.toHaveAttribute("aria-current", "page");
  // The Library: Resources marked, Matchup Intel not, and no tabs there either.
  await page.goto("/resources");
  await expect(page.getByTestId("resources-list")).toBeVisible();
  await expect(page.getByTestId("resources-tabs")).toHaveCount(0);
  await expect(page.locator("main a[href^='/resources/matchups']")).toHaveCount(0);
  m = await marks();
  await expect(m.resources).toHaveAttribute("aria-current", "page");
  await expect(m.intel).not.toHaveAttribute("aria-current", "page");
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
  // Playwright's request events for the whole context: the page's, and the service worker's.
  const hosts = new Set<string>();
  page.context().on("request", (r) => hosts.add(new URL(r.url()).hostname));
  // Playwright never reports a request whose URL ends in /favicon.ico (and aborts it once a route is
  // installed: resources.spec.ts). On 16 Nov 2026 the Library's favicons loaded unreported. So the
  // page's own record of the requests its documents start is read too, through Chromium's DevTools
  // protocol (every project this spec runs in is Chromium): on each page the test opens, each
  // redirect hop by its own address, and loads still in flight when the test ends.
  const started = new Set<string>();
  const cdp = await page.context().newCDPSession(page);
  cdp.on("Network.requestWillBeSent", (e: { request: { url: string } }) => started.add(new URL(e.request.url).hostname));
  await cdp.send("Network.enable");
  // A curated champion's ability: its details window holds each fact with its source, linked.
  await openMatchupIntel(page, "Ambessa", "Renekton");
  await hydrated(page);
  const button = row(page, "W").getByTestId("ability-details");
  await expect(button).toHaveAccessibleName(/^Details: Ruthless Predator, W$/);
  await button.click();
  const body = page.getByTestId("ability-details-body");
  await expect(body).toBeVisible();
  await expect(body.getByTestId("matchup-source-link").first()).toBeVisible();
  await expect(body).toContainText("Riot's description");
  const links = page.locator('[data-testid="matchup-intel"] a[href^="http"], dialog[open] a[href^="http"]');
  expect(await links.count()).toBeGreaterThan(0);
  for (const a of await links.all()) {
    expect(await a.getAttribute("href")).toMatch(/^https:\/\/(wiki\.leagueoflegends\.com|ddragon\.leagueoflegends\.com|developer\.riotgames\.com|creativecommons\.org)\//);
    await expect(a).toHaveAttribute("target", "_blank");
    await expect(a).toHaveAttribute("rel", /noopener/);
    await expect(a).toHaveAttribute("rel", /noreferrer/);
    await expect(a).toContainText("(opens in a new tab)");
  }
  // Escape closes the window, and the focus goes back to the button that opened it.
  await page.keyboard.press("Escape");
  await expect(body).toBeHidden();
  await expect(button).toBeFocused();
  await page.waitForLoadState("networkidle");
  const isWiki = (h: string) => h === "wiki.leagueoflegends.com" || h.endsWith(".wiki.leagueoflegends.com");
  expect([...hosts].filter(isWiki)).toEqual([]);
  expect(started.size, "the page's record of requests was read").toBeGreaterThan(0);
  expect([...started].filter(isWiki)).toEqual([]);
  // The page's own resource timing, which lists every load that has ended on this page; its own
  // scripts are in it, so an empty list would mean it was not read.
  const loaded = await page.evaluate(() => performance.getEntriesByType("resource").map((e) => new URL(e.name).hostname));
  expect(loaded.length, "the page's resource timing lists its loads").toBeGreaterThan(0);
  expect(loaded.filter(isWiki)).toEqual([]);
  // And whatever on the page names the wiki, loaded or not (a lazy picture far below the fold, or an
  // element not drawn, would not have started): every attribute of every element, inside shadow
  // roots too, except a link's own address (sources are links), and every rule of the page's style
  // sheets. The rendered text, and the script that carries the page's data, are not attributes.
  const named = await page.evaluate(() => {
    const isWikiText = (v: string) => /wiki\.leagueoflegends\.com/i.test(v);
    const out: string[] = [];
    const walk = (root: Document | ShadowRoot) => {
      for (const el of root.querySelectorAll("*")) {
        for (const attr of el.attributes) {
          if ((el.localName === "a" || el.localName === "area") && attr.name === "href") continue;
          if (isWikiText(attr.value)) out.push(`<${el.localName} ${attr.name}>`);
        }
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    };
    walk(document);
    for (const sheet of document.styleSheets) for (const rule of sheet.cssRules) if (isWikiText(rule.cssText)) out.push(`style rule: ${rule.cssText.slice(0, 60)}`);
    return out;
  });
  expect(named, "nothing on the page names the wiki, except as a link").toEqual([]);
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

test("phone at 200% text: nothing is cut or spills sideways in the bar, the briefing or assembled reference, the ability tiles, the notes or the sources (every details part open), at 390 and 320 wide, each pair swapped too", async ({ page }) => {
  // Written with the facts from Riot's text on the page: turned on for it while they ship off.
  await riotText(page, "on");
  test.skip((page.viewportSize()?.width ?? 1000) >= 768, "a phone");
  // A phone with its text at 200%, as the other large-text tests set it (html's font size: the
  // page's sizes are in rem, so everything but the screen grows). The three validation pairs: the
  // most a page holds, with a briefing, two curated champions and their level notes. Each swapped
  // too: no briefing then, and the remembered line offers to remember the longer names (Remember
  // Mordekaiser was wider than a 320 or 375px phone). Measured once the page has read this device,
  // so the line is in its real state, not its placeholder. Pictures drawn, not their stand-ins.
  await localPictures(page);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [you, enemy, curated] of CURATED.flatMap(([a, b]) => [[a, b, true], [b, a, false]] as const)) {
      await openMatchupIntel(page, you, enemy);
      await hydrated(page);
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
      const at = `${you} vs ${enemy} at ${width}px`;
      expect(await overflow(page), `${at}: the page`).toBeLessThanOrEqual(1);
      const parts = [curated ? "matchup-briefing" : "matchup-assembled", "matchup-pickers", "matchup-remembered", "matchup-patch-state", "matchup-enemy-abilities", "matchup-your-abilities", "matchup-interactions", "matchup-level-notes", "matchup-footer"];
      for (const part of parts) {
        await expect(page.getByTestId(part), `${at}: ${part}`).toBeVisible();
        expect.soft(await cutOrSpilled(page.getByTestId(part)), `${at}: ${part}`).toEqual([]);
      }
    }
  }
});

/**
 * The pairs with facts from Riot's text that ask the most of a phone: the most facts on both sides
 * (Briar vs K'Sante: K'Sante's four conditional facts, Briar's long qualifier), where Riot's two texts
 * differ beside an ability with no reviewed fact (Riven vs Yone), and the longest qualifier (Gwen vs
 * Caitlyn: "a trap that, when sprung, reveals and immobilizes the enemy champion").
 */
const RIOT_TEXT_PAIRS: Array<[string, string]> = [
  ["Briar", "KSante"],
  ["Riven", "Yone"],
  ["Gwen", "Caitlyn"],
];

test("phone at 100%, 150% and 200% text, with facts from Riot's text: nothing cut, spilled or scrolling inside, at 320, 375 and 393 wide and held sideways (852 by 393); running text never under text-xs", async ({ page }) => {
  // Written with the facts from Riot's text on the page: turned on for it while they ship off.
  await riotText(page, "on");
  test.skip((page.viewportSize()?.width ?? 1000) >= 768, "a phone");
  test.setTimeout(300_000);
  await localPictures(page);
  for (const [width, height] of [
    [320, 640],
    [375, 667],
    [393, 852],
    [852, 393],
  ] as const) {
    await page.setViewportSize({ width, height });
    for (const [you, enemy] of RIOT_TEXT_PAIRS) {
      await openMatchupIntel(page, you, enemy);
      await hydrated(page);
      for (const scale of [100, 150, 200]) {
        await page.addStyleTag({ content: `html { font-size: ${scale}% !important; }` });
        // Every details part open (your champion's abilities, the folds), measured at rest.
        await page.getByTestId("matchup-intel").evaluate(async (m) => {
          for (const d of m.querySelectorAll("details")) d.open = true;
          await document.fonts.ready;
          const finite = document.getAnimations().filter((a) => a.effect?.getComputedTiming().endTime !== Infinity);
          await Promise.all(finite.map((a) => a.finished.catch(() => undefined)));
        });
        const at = `${you} vs ${enemy} at ${width}×${height}, ${scale}% text`;
        expect.soft(await overflow(page), `${at}: the page`).toBeLessThanOrEqual(1);
        for (const part of ["matchup-assembled", "matchup-enemy-abilities", "matchup-your-abilities", "matchup-footer"]) {
          expect.soft(await cutOrSpilled(page.getByTestId(part)), `${at}: ${part}`).toEqual([]);
        }
        const m = await page.evaluate(() => {
          const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
          const text = [...document.querySelectorAll<HTMLElement>('[data-testid="fact-chip"] span, [data-testid="fact-chip-differ"] span, [data-testid="assembled-chip"] span, [data-testid="ability-facts-conditional"], [data-testid="assembled-conditional"], [data-testid="ability-facts-none"], [data-testid="assembled-none"]')].filter((e) => e.getClientRects().length > 0 && !e.classList.contains("sr-only"));
          const scrollers = [...document.querySelectorAll("main *")].filter((e) => {
            const st = getComputedStyle(e);
            return (/(auto|scroll)/.test(st.overflowY) && e.scrollHeight > e.clientHeight + 1) || (/(auto|scroll)/.test(st.overflowX) && e.scrollWidth > e.clientWidth + 1);
          });
          return { smallest: Math.min(...text.map((e) => parseFloat(getComputedStyle(e).fontSize) / root)), scrollers: scrollers.map((e) => e.getAttribute("data-testid") ?? e.tagName.toLowerCase()) };
        });
        expect.soft(m.smallest, `${at}: chips and markers at least text-xs`).toBeGreaterThanOrEqual(0.75 - 0.001);
        expect.soft(m.scrollers, `${at}: nothing scrolls inside the page`).toEqual([]);
      }
    }
  }
});

/**
 * The pairs whose controls stand closest on a touch screen (the review of 19 Nov 2026): Mordekaiser's
 * passive chips three rows deep, the assembled keys and chips of two checked kits, the longest
 * interaction folds, and an assembled pair with facts from Riot's text.
 */
const TOUCH_PAIRS: Array<[string, string]> = [
  ["Riven", "Mordekaiser"],
  ["Riven", "Darius"],
  ["Ornn", "Gwen"],
  ["Ambessa", "Aatrox"],
];

test("touch screens: every chip, key, fold and source tip reaches 44px, no one's area covers another's box, and axe's WCAG 2.2 target size finds nothing (every fold open)", async ({ page }, info) => {
  // Written with the facts from Riot's text on the page: turned on for it while they ship off.
  await riotText(page, "on");
  test.skip(info.project.name === "desktop", "touch screens: the phone and the tablet");
  test.setTimeout(180_000);
  await localPictures(page);
  for (const [you, enemy] of TOUCH_PAIRS) {
    await openMatchupIntel(page, you, enemy);
    await hydrated(page);
    const at = `${you} vs ${enemy} at ${info.project.name}`;
    await page.getByTestId("matchup-intel").evaluate(async (m) => {
      for (const d of m.querySelectorAll("details")) d.open = true;
      await document.fonts.ready;
      const finite = document.getAnimations().filter((a) => a.effect?.getComputedTiming().endTime !== Infinity);
      await Promise.all(finite.map((a) => a.finished.catch(() => undefined)));
    });
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), `${at}: a coarse pointer`).toBe(true);
    // axe at the WCAG 2.2 AA level (target size, 2.5.8), as the review ran it, from the page's top
    // (scrolled, the top bar would cover what lies under it, which axe counts against its target).
    await page.evaluate(() => window.scrollTo(0, 0));
    const axe = await new AxeBuilder({ page }).include('[data-testid="matchup-intel"]').withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    const blocking = axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect.soft(blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")})`), `${at}: axe, WCAG 2.2 AA`).toEqual([]);
    // Each control's own box, sampled every 2px: a tap anywhere on it reaches it, not a neighbour
    // whose 44px area (touch-target) reaches over it. Each brought to the screen's middle first, clear
    // of the bars.
    const found = await page.getByTestId("matchup-dashboard").evaluate(async (dash) => {
      const ctrl = (el: Element | null) => el?.closest("a[href], button, summary") ?? null;
      const name = (el: Element) => `${el.closest("[data-testid]")?.getAttribute("data-testid") ?? el.tagName.toLowerCase()} "${(el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 32)}"`;
      const controls = [...dash.querySelectorAll("a[href], button, summary")].filter((el) => el.getClientRects().length > 0 && !el.closest(".sr-only"));
      const covered: string[] = [];
      const small: string[] = [];
      for (const el of controls) {
        el.scrollIntoView({ block: "center" });
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        const b = el.getBoundingClientRect();
        // 44px: its own height, or its finger-sized area (touch-target's ::after, on it or its badge).
        const areas = [el, ...el.querySelectorAll(".touch-target")].map((e) => parseFloat(getComputedStyle(e, "::after").height) || 0);
        if (b.height < 43.5 && Math.max(...areas) < 44) small.push(`${name(el)} (${b.height.toFixed(0)}px, no 44px area)`);
        const others = new Map<string, number>();
        for (let y = b.top + 1; y <= b.bottom - 1; y += 2) {
          for (let x = b.left + 1; x <= b.right - 1; x += 2) {
            const hit = ctrl(document.elementFromPoint(x, y));
            if (hit && hit !== el && !el.contains(hit) && dash.contains(hit)) others.set(name(hit), (others.get(name(hit)) ?? 0) + 1);
          }
        }
        for (const [other, n] of others) covered.push(`${name(el)}: ${n} points reach ${other}`);
      }
      return { controls: controls.length, covered, small };
    });
    expect(found.controls, `${at}: controls on the page`).toBeGreaterThan(10);
    expect.soft(found.covered, `${at}: no control's box reaches another`).toEqual([]);
    expect.soft(found.small, `${at}: every control a 44px target`).toEqual([]);
  }
});

/**
 * Ten pairs with tight cooldowns on their assembled sides, the review's included (Gwen's Q and E
 * beside Nidalee, Ornn's E and W, Renekton's E), each way round where both have checked notes.
 */
const COOLDOWN_PAIRS: Array<[string, string]> = [
  ["Gwen", "Nidalee"],
  ["Darius", "Ornn"],
  ["Riven", "Renekton"],
  ["Ornn", "Gwen"],
  ["KSante", "Mordekaiser"],
  ["Riven", "Darius"],
  ["Ambessa", "Aatrox"],
  ["Briar", "KSante"],
  ["Mordekaiser", "Riven"],
  ["Renekton", "Ambessa"],
];

test("phone at 200% text: a cooldown breaks only after a slash or a space, never inside a number, on every numbered line of ten pairs at 320, 375 and 393 wide", async ({ page }) => {
  // Written with the facts from Riot's text on the page: turned on for it while they ship off.
  await riotText(page, "on");
  test.skip((page.viewportSize()?.width ?? 1000) >= 768, "a phone");
  test.setTimeout(180_000);
  await localPictures(page);
  for (const [you, enemy] of COOLDOWN_PAIRS) {
    await openMatchupIntel(page, you, enemy);
    await hydrated(page);
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    for (const [width, height] of [
      [320, 640],
      [375, 667],
      [393, 852],
    ] as const) {
      await page.setViewportSize({ width, height });
      const found = await page.getByTestId("matchup-dashboard").evaluate(async (dash) => {
        await document.fonts.ready;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
        const lines = [...dash.querySelectorAll('[data-testid="assembled-cooldown"], [data-testid="ability-cooldown-value"], [data-testid="ability-cooldown-form"]')].filter((e) => e.getClientRects().length > 0);
        const breaks: string[] = [];
        for (const line of lines) {
          // The numbers' characters, in order, each with the top of the line it is drawn on (the
          // source words after a number, which wrap as words do, left out).
          const chars: Array<{ c: string; top: number }> = [];
          const walk = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
          for (let t = walk.nextNode(); t; t = walk.nextNode()) {
            if (t.parentElement?.closest('[data-testid="assembled-cooldown-source"]')) continue;
            for (let i = 0; i < t.textContent!.length; i++) {
              const r = document.createRange();
              r.setStart(t, i);
              r.setEnd(t, i + 1);
              const rect = r.getClientRects()[0];
              if (rect) chars.push({ c: t.textContent![i]!, top: rect.top });
            }
          }
          for (let i = 1; i < chars.length; i++) {
            const prev = chars[i - 1]!;
            const here = chars[i]!;
            if (here.top > prev.top + 2 && prev.c !== "/" && prev.c !== " " && here.c !== " ") breaks.push(`"${chars.map((x) => x.c).join("")}" breaks between "${prev.c}" and "${here.c}"`);
          }
        }
        return { lines: lines.length, breaks };
      });
      const at = `${you} vs ${enemy} at ${width}px, 200% text`;
      expect(found.lines, `${at}: numbered lines`).toBeGreaterThan(3);
      expect.soft(found.breaks, at).toEqual([]);
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
      // The remembered line in its real state (Remember Riven, with only yours), not its placeholder.
      await hydrated(page);
      await page.addStyleTag({ content: `html { font-size: ${percent}% !important; }` });
      await page.evaluate(() => document.fonts.ready);
      const at = `${name} at ${width}px, ${percent}%`;
      expect(await overflow(page), `${at}: the page`).toBeLessThanOrEqual(1);
      for (const p of ["matchup-pickers", "matchup-remembered", part]) expect.soft(await cutOrSpilled(page.getByTestId(p)), `${at}: ${p}`).toEqual([]);
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
  // The picker's short rows keep long one-word names inside the window too: Recent (a long name
  // picked before) and your champion's curated matchups (Riven's: Mordekaiser), at 320px and 200%.
  await page.setViewportSize({ width: 320, height: 844 });
  await openMatchupIntel(page, "Riven");
  await hydrated(page);
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await choose(page, "enemy", "heimer", "Heimerdinger");
  const rows = await openPicker(page, "enemy");
  await untilStill(page);
  await expect(rows.getByTestId("matchup-picker-recent").locator('button[data-champion="Heimerdinger"]')).toBeVisible();
  await expect(rows.getByTestId("matchup-picker-curated").locator('button[data-champion="Mordekaiser"]')).toBeVisible();
  expect(await pickerSpill(rows), "the picker's rows at 320px, 200%: past the window's edge").toBeLessThanOrEqual(1);
  for (const r of ["matchup-picker-recent", "matchup-picker-curated"]) expect.soft(await cutOrSpilled(rows.getByTestId(r)), `the picker at 320px, 200%: ${r}`).toEqual([]);
});

test("phone: the briefing's threat is on the first screen, above the tab bar: whole at 390 by 664, its first line at 320 by 568; an assembled pair's Danger side likewise", async ({ page }) => {
  // Written with the facts from Riot's text on the page: turned on for it while they ship off.
  await riotText(page, "on");
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
        const threat = document.querySelector('[data-testid="briefing-threat"] > div > span')!;
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
    // Any other pair: the assembled reference's Danger side starts on the first screen, its label and
    // the line under it (whose kit it is) above the tab bar, and at 390 by 664 the first line of what it
    // holds too; for an enemy with no facts recorded, the whole side at 390 by 664. At 320 by 568 the
    // lines under the subtitle that say where the side's facts and numbers come from (the review's
    // fixes of 19 Nov 2026: "From Riot's ability text, reviewed automatically (not by a person)" and
    // "Cooldowns: Riot's data, not reviewed", two lines each there) put its first group just under
    // the tab bar, 38px, behind Riven's curated pair's link (docs/MATCHUP_INTEL.md, "On a phone").
    await openMatchupIntel(page, "Riven", "Darius");
    await hydrated(page);
    const d = await page.evaluate(() => {
      const bar = document.querySelector('[data-testid="phone-tabbar"]')!.getBoundingClientRect().top;
      const side = document.querySelector('[data-testid="assembled-danger"]')!;
      const first = side.querySelector('[data-testid="assembled-no-facts"], [data-testid="assembled-group"]')!;
      const range = document.createRange();
      range.selectNodeContents(first);
      const subtitle = document.createRange();
      subtitle.selectNodeContents(side.querySelector("h3 + p > span")!);
      return { bar, scrollY: window.scrollY, noFacts: side.getAttribute("data-from") === "none", label: side.querySelector("h3")!.getBoundingClientRect().bottom, subtitle: subtitle.getClientRects()[0]!.bottom, firstLine: range.getClientRects()[0]!.bottom, last: side.getBoundingClientRect().bottom };
    });
    const at = `Riven vs Darius at ${width} by ${height}`;
    expect(d.scrollY, at).toBe(0);
    expect(d.label, `${at}: the Danger side's label`).toBeLessThanOrEqual(d.bar);
    expect(d.subtitle, `${at}: whose kit it is`).toBeLessThanOrEqual(d.bar);
    if (whole) expect(d.firstLine, `${at}: the first line it holds`).toBeLessThanOrEqual(d.bar);
    if (whole && d.noFacts) expect(d.last, `${at}: the whole Danger side`).toBeLessThanOrEqual(d.bar);
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

test.describe("a choice on its way", () => {
  // The service worker is blocked here, as in mobile-nav.spec.ts. Once it controls the page (it
  // claims open pages as it activates, shortly after the first load), a browser navigation to the
  // next pair is answered through it, past page.route, so the hold below would not apply to it:
  // measured on the demo, such a navigation was held 0 times of 2 with the worker, 2 of 2 without.
  // The router's own request for the pair was held either way. With the worker blocked, a fall
  // back to a browser navigation is held too, and fails the announcement below instead.
  test.use({ serviceWorkers: "block" });

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
    await expect(page).toHaveURL(/\?role=top&champion=Riven&vs=Mordekaiser$/);
    await expect(page.getByTestId("matchup-briefing")).toBeVisible();
    await expect(page.getByTestId("matchup-status")).toHaveText(/^Riven vs Mordekaiser: curated briefing, checked on patch \d+\.\d+\. Mordekaiser's abilities follow\.$/);
    expect(await content.evaluate((e) => (e as HTMLElement).inert)).toBe(false);
    await expect(page.getByTestId("matchup-loading")).toHaveCount(0);
    // A pick says what came the same way.
    await choose(page, "enemy", "darius", "Darius");
    await expect(page.getByTestId("matchup-status")).toHaveText("No curated briefing for Riven vs Darius yet: an assembled reference from each champion's own facts, which no person has checked as a pair. Darius's abilities follow.");
  });

  test("the status line changes only once a picker window has gone, so a screen reader hears it; a window closed without a pick says nothing", async ({ page }) => {
    await openMatchupIntel(page, "Riven", "Garen");
    await hydrated(page);
    // Every change of the status line's words, and whether a window was open as it happened: while
    // a modal window is open the page under it is inert, out of a screen reader's reach, and a live
    // region speaks only what is added to it once it is back in reach.
    type Change = { text: string; windowOpen: boolean };
    await page.getByTestId("matchup-status").evaluate((el) => {
      const log: Change[] = [];
      (window as unknown as { statusChanges: Change[] }).statusChanges = log;
      new MutationObserver(() => log.push({ text: el.textContent ?? "", windowOpen: !!document.querySelector("dialog[open]") })).observe(el, { childList: true, characterData: true, subtree: true });
    });
    const changes = () => page.evaluate(() => (window as unknown as { statusChanges: Change[] }).statusChanges);
    // Opened and closed without a pick: nothing new, so the line does not change. Waited past the
    // window's closing motion and the moment after it, when a change would be made.
    const win = await openPicker(page, "enemy");
    await win.getByTestId("matchup-picker-close").click();
    await expect(win).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(await changes(), "a window closed without a pick").toEqual([]);
    // A pick: the line says what came, and its words change only once the window has gone.
    await choose(page, "enemy", "darius", "Darius");
    await expect(page.getByTestId("matchup-status")).toHaveText("No curated briefing for Riven vs Darius yet: an assembled reference from each champion's own facts, which no person has checked as a pair. Darius's abilities follow.");
    const made = await changes();
    expect(made.length, "the line changed").toBeGreaterThan(0);
    expect(made.filter((c) => c.windowOpen), "changes made while the window was open").toEqual([]);
  });
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

test("phone: an ability tile's icon stands beside its key, name and cooldown, its chips under them; its details open in a window", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1000) >= 768, "a phone");
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 740 });
    await openMatchupIntel(page, "Ambessa", "Renekton");
    await hydrated(page);
    for (const slot of ["Q", "W", "E"]) {
      const r = row(page, slot);
      const m = await r.evaluate((li) => {
        const box = (id: string) => li.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect() ?? null;
        const icon = (li.firstElementChild as HTMLElement).getBoundingClientRect();
        return { iconRight: icon.right, name: box("ability-name")!, cooldown: box("ability-cooldown")!, facts: box("ability-facts"), right: li.getBoundingClientRect().right };
      });
      const at = `Renekton ${slot} at ${width}`;
      expect(m.name.left, `${at}: the name beside the icon`).toBeGreaterThan(m.iconRight);
      expect(m.cooldown.left, `${at}: the cooldown beside the icon`).toBeGreaterThan(m.iconRight);
      expect(m.cooldown.top, `${at}: the cooldown under the name or beside it`).toBeGreaterThanOrEqual(m.name.top - 1);
      if (m.facts) expect(m.facts.top, `${at}: the chips under the cooldown`).toBeGreaterThanOrEqual(m.cooldown.bottom - 1);
      expect(m.cooldown.right, `${at}: inside the tile`).toBeLessThanOrEqual(m.right + 1);
    }
    // The details window takes the phone's whole screen, and its sources are links.
    await row(page, "W").getByTestId("ability-details").click();
    const body = page.getByTestId("ability-details-body");
    await expect(body).toBeVisible();
    await expect(body.getByTestId("ability-description")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(body).toBeHidden();
  }
});

test("on a wide screen, two columns: the main panel with the notes under it on the left; the enemy's tiles, P to R one under another, and your champion on the right", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1280, "a wide screen");
  await openMatchupIntel(page, "Ambessa", "Renekton");
  const box = async (id: string) => (await page.getByTestId(id).boundingBox())!;
  const main = await box("matchup-briefing");
  const interactions = await box("matchup-interactions");
  const levels = await box("matchup-level-notes");
  const tiles = await box("matchup-enemy-abilities");
  const yours = await box("matchup-your-abilities");
  expect(interactions.y).toBeGreaterThanOrEqual(main.y + main.height);
  expect(Math.abs(levels.y - interactions.y)).toBeLessThanOrEqual(1);
  expect(tiles.x).toBeGreaterThanOrEqual(main.x + main.width);
  expect(Math.abs(tiles.y - main.y)).toBeLessThanOrEqual(1);
  expect(yours.y).toBeGreaterThanOrEqual(tiles.y + tiles.height);
  const slots = await enemyAbilities(page).evaluateAll((els) => els.map((e) => ({ slot: e.getAttribute("data-slot"), top: e.getBoundingClientRect().top })));
  expect(slots.map((s) => s.slot)).toEqual(["P", "Q", "W", "E", "R"]);
  for (let i = 1; i < slots.length; i++) expect(slots[i]!.top).toBeGreaterThan(slots[i - 1]!.top);
});

test("Interactions: the matchup's own in full; the enemy's, already chips on its tiles, folded and counted, one tap away", async ({ page }) => {
  await openMatchupIntel(page, "Ambessa", "Renekton");
  const panel = page.getByTestId("matchup-interactions");
  await expect(panel.getByTestId("matchup-interaction").first()).toBeVisible();
  const fold = panel.getByTestId("enemy-interactions");
  expect(await fold.evaluate((d) => (d as HTMLDetailsElement).open)).toBe(false);
  const count = Number(/^Renekton's interactions and exceptions · (\d+)/.exec((await fold.locator("summary").innerText()).replace(/\s+/g, " ").trim())?.[1]);
  expect(count).toBeGreaterThan(0);
  await expect(fold.getByTestId("fact-chip")).toHaveCount(count);
  await expect(fold.getByTestId("enemy-interaction").first()).toBeHidden();
  await fold.locator("summary").click();
  await expect(fold.getByTestId("enemy-interaction").first()).toBeVisible();
});

/*
  As the page ships: the facts from Riot's text (L3) are in the code but switched off until the
  owner has pasted the new registration text in Riot's Developer Portal
  (src/server/matchup-intel/riot-text/switch.ts; docs/RIOT_COMPLIANCE.md, "Proposed description").
  Off, a champion without checked notes reads as one with no reviewed facts: the same pairs that
  carry the layer's most telling facts when it is on (Gnar's W "Mega Gnar", Yone's R where Riot's
  texts differ, Twisted Fate's placeholders) show none of it, in the page or in a details window,
  and each such side says so in one line. The cookie pins the state, so this holds whatever the
  switch says.
*/
test("as it ships, with the facts from Riot's text switched off: none of them anywhere for Gnar, Yone and Twisted Fate, and a side without checked notes says so in one line", async ({ page }) => {
  await riotText(page, "off");
  const pairs: Array<{ you: string; enemy: string; none: Array<["danger" | "opportunity", string]> }> = [
    { you: "Riven", enemy: "Gnar", none: [["danger", "Gnar"]] },
    { you: "Yone", enemy: "TwistedFate", none: [["danger", "Twisted Fate"], ["opportunity", "Yone"]] },
    { you: "TwistedFate", enemy: "Yone", none: [["danger", "Yone"], ["opportunity", "Twisted Fate"]] },
  ];
  // What only the layer draws: its labels, its chips for disagreements and qualifiers, its markers, its hidden-facts lines.
  const LAYER = '[data-testid*="riot-text"], [data-from="riot-text"], [data-testid="fact-chip-differ"], [data-testid="fact-chip-markers"], [data-testid$="-conditional"], [data-testid="ability-facts-hidden"], [data-testid="assembled-hidden"]';
  const WORDS = ["Riot's text", "Riot's ability text", "Riot's texts differ", "reviewed automatically", "No reviewed facts for this ability", "No reviewed facts of this kind"];
  for (const { you, enemy, none } of pairs) {
    const where = `${you} vs ${enemy}`;
    await openMatchupIntel(page, you, enemy);
    await expect(page.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", enemy);
    await expect(page.getByTestId("matchup-assembled")).toBeVisible();
    await expect(page.locator(LAYER), where).toHaveCount(0);
    // Its words nowhere, the closed parts (the sources, your champion's folded tiles) included.
    const words = (await page.getByTestId("matchup-intel").textContent()) ?? "";
    for (const w of WORDS) expect(words, `${where}: "${w}"`).not.toContain(w);
    // Each side without checked notes: one line in place of its groups, and no chip.
    for (const [side, name] of none) {
      const s = page.getByTestId(`assembled-${side}`);
      await expect(s, `${where}: ${side}`).toHaveAttribute("data-from", "none");
      await expect(s.getByTestId("assembled-group"), `${where}: ${side}`).toHaveCount(0);
      await expect(s.locator('[data-testid^="fact-chip"]'), `${where}: ${side}`).toHaveCount(0);
      await expect(s.getByTestId("assembled-no-facts"), `${where}: ${side}`).toHaveText(`No reviewed facts for ${name} yet: crowd control, mobility, defence and sustain are not recorded.`);
    }
    // The enemy's five tiles keep their names and cooldowns, with no chip; their panel says it once.
    const tiles = page.getByTestId("matchup-enemy-abilities");
    await expect(tiles.getByTestId("ability-row")).toHaveCount(5);
    await expect(tiles.locator('[data-testid^="fact-chip"], [data-testid="ability-facts"], [data-testid="ability-facts-none"]'), where).toHaveCount(0);
    await expect(tiles.getByTestId("matchup-no-facts"), where).toHaveCount(1);
    // Nothing wider than the screen.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), where).toBeLessThanOrEqual(1);
  }
  // A details window says nothing of it either (Yone's R, where Riot's texts differ when the layer is on).
  await hydrated(page);
  await row(page, "R").getByTestId("ability-details").click();
  const body = page.getByTestId("ability-details-body");
  await expect(body).toBeVisible();
  await expect(body.getByTestId("ability-details-riot-text")).toHaveCount(0);
  for (const w of WORDS) expect((await body.textContent()) ?? "", `Yone's R details: "${w}"`).not.toContain(w);
  await page.keyboard.press("Escape");
  await expect(body).toHaveCount(0);
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(result.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => v.id)).toEqual([]);

  // The same pair with the layer on shows it: the switch is what hides it.
  await riotText(page, "on");
  await openMatchupIntel(page, "Riven", "Gnar");
  await expect(row(page, "W").getByTestId("fact-chip-markers").first()).toContainText("Mega Gnar");
  await expect(page.getByTestId("assembled-danger")).toHaveAttribute("data-from", "riot-text");
});
