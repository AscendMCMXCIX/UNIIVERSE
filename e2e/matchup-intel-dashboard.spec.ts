import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "./test";
import { E2E_DDRAGON_VERSION } from "./ddragon-version";
import { changedAbilities, choose, enemyAbilities, hydrated, localPictures, notesAge, openMatchupIntel, riotChanged, riotText } from "./matchup-intel";
import { briefingState, matchupIntelVerdicts, readMatchupIntel } from "../scripts/matchup-intel-facts.mjs";
import { patchFromVersion, publicPatchName } from "../src/domain/patch";
import { notRecheckedWords } from "../src/components/matchup-intel/wording";

/*
  MATCHUP INTEL's lane plan layout (docs/MATCHUP_INTEL.md, "The lane plan"; the owner's redesign
  request of 23 Nov 2026, after the single-screen dashboard of 18 Nov), on the in-memory demo pinned
  to Data Dragon 16.22.1:
  - on a desktop the lane plan is whole on the first screen at 1440 by 900, 1920 by 1080, a maximised
    1920 by 950 window, 2560 by 1440 and 3440 by 1440, with the enemy's cooldown strip under it on that
    screen where each size promises it (PROMISES), for the curated pairs (the longest briefing among
    them), pairs with checked notes on both sides but no curated file, pairs assembled from facts, a
    pair where neither side has checked notes, the most complex kits and the tallest pages of the
    sweep; its text no smaller than the app's text-xs, the plan's words text-md, the cooldowns larger,
    nothing scrolling inside it;
  - every pair gives a meaningful reference, labelled for what it is (a sweep of many pairs);
  - switching is a navigation: deep links, reloads, Back and Forward keep the pair;
  - each chip opens what it rests on, each tile's details open in a window;
  - the facts from Riot's text on the real data: a qualifier under its chip (Gnar's W, "Mega Gnar"), the
    conditional marker, where Riot's texts differ (Yone's R), placeholders never resolved (Twisted
    Fate), a champion with few facts saying what has none (Kog'Maw).
  The text-size and phone guarantees of the page are in e2e/matchup-intel.spec.ts.
  Every test here reads the page with the facts from Riot's text on, as they were written: the
  layer ships switched off until the owner has pasted the new registration text in Riot's Developer
  Portal (src/server/matchup-intel/riot-text/switch.ts), and its off state is tested in
  e2e/matchup-intel.spec.ts.
*/

test.beforeEach(async ({ context, baseURL, page }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  await riotText(page, "on");
});

/** The desktop sizes measured at 100% zoom (a maximised 1920 by 1080 window leaves about 1920 by 950); what each promises is PROMISES. */
const SIZES: Array<[number, number]> = [
  [1920, 1080],
  [2560, 1440],
  [1920, 950],
  [3440, 1440],
  [1440, 900],
  [1280, 800],
];

/**
 * The tallest pages of the sweep of 19 Nov 2026 (every champion as the enemy against Riven, Gwen,
 * Ambessa, K'Sante and Briar, and the 30 pairs of the six champions with checked notes, at 1920 by
 * 1080, 1920 by 950, 2560 by 1440 and 1440 by 900; docs/MATCHUP_INTEL.md, "The dashboard"): the
 * longest sides from Riot's text (K'Sante's, Briar's) against Mordekaiser's and Ornn's checked notes
 * and level notes, each way round where it was measured, Ambessa against them, and the pairs of two
 * champions with level notes (Ambessa 2, Mordekaiser 3, Ornn 2), whose five notes the fold keeps to two.
 */
const TALLEST: Array<[string, string]> = [
  ["Briar", "Mordekaiser"],
  ["Mordekaiser", "Briar"],
  ["KSante", "Mordekaiser"],
  ["Mordekaiser", "KSante"],
  ["Briar", "Ornn"],
  ["KSante", "Ornn"],
  ["Ornn", "Ambessa"],
  ["Ambessa", "Ornn"],
  ["Ambessa", "Briar"],
  ["Ambessa", "KSante"],
  ["Ambessa", "Mordekaiser"],
  ["Mordekaiser", "Ornn"],
];

/**
 * The pairs measured: the three curated pairs (Riven vs Mordekaiser holds the longest briefing),
 * checked notes on both sides with no curated file (Riven vs Renekton), the curated pairs the other
 * way round (an assembled reference of two checked kits beside their level notes), assembled pairs,
 * the complex kits (two forms, a weapon wheel, a transformation, a dismount, five spells in one
 * slot, a recast with Riot's texts differing, placeholders), a pair where neither side has checked
 * notes (Garen vs Darius), the pairs with the most facts from Riot's text (K'Sante 18, Briar 14,
 * Shyvana 12; Hwei's 11 with five qualifiers), each way round, with the curated champions' links in
 * the header (Riven vs K'Sante), and the tallest pairs of the sweep of 19 Nov 2026 (TALLEST).
 */
const FIT_PAIRS: Array<[string, string]> = [
  ["Riven", "Mordekaiser"],
  ["Ambessa", "Renekton"],
  ["Gwen", "Ornn"],
  ["Riven", "Renekton"],
  ["Ornn", "Gwen"],
  ["Mordekaiser", "Riven"],
  ["Renekton", "Ambessa"],
  ["Riven", "Darius"],
  ["Ambessa", "Aatrox"],
  ["Riven", "Aphelios"],
  ["Gwen", "Nidalee"],
  ["Ambessa", "Jayce"],
  ["Riven", "Elise"],
  ["Gwen", "Gnar"],
  ["Ambessa", "Kayn"],
  ["Riven", "Hwei"],
  ["Gwen", "Udyr"],
  ["Ambessa", "Kled"],
  ["Riven", "Yone"],
  ["Gwen", "Camille"],
  ["Ambessa", "TwistedFate"],
  ["Garen", "Darius"],
  ["KSante", "Briar"],
  ["Briar", "KSante"],
  ["Riven", "KSante"],
  ["Shyvana", "KSante"],
  ["KSante", "Shyvana"],
  ["Hwei", "KSante"],
  ...TALLEST,
];

/** What the page needs, measured in the browser: the scroll, the parts' boxes, the text sizes, any box that scrolls. */
function measure(page: Page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const root = parseFloat(getComputedStyle(de).fontSize);
    const box = (sel: string) => {
      const e = document.querySelector(sel);
      if (!e || !e.getClientRects().length) return null;
      const r = e.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    };
    const sizes = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].filter((e) => e.getClientRects().length > 0).map((e) => parseFloat(getComputedStyle(e).fontSize) / root);
    const scrollers = [...document.querySelectorAll("main *")].filter((e) => {
      const s = getComputedStyle(e);
      return (/(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 1) || (/(auto|scroll)/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 1);
    });
    return {
      innerHeight,
      scrollHeight: de.scrollHeight,
      clientWidth: de.clientWidth,
      scrollWidth: de.scrollWidth,
      parts: {
        bar: box('[aria-label="Champions"]'),
        // The lane plan: the curated briefing's card, else the lane reference's.
        plan: box('[data-testid="matchup-briefing"]:not([data-expired])') ?? box('[data-testid="matchup-assembled"]'),
        tiles: box('[data-testid="matchup-enemy-abilities"]'),
        // The enemy's cooldown lines, P to R: the lowest one's box.
        cooldowns: (() => {
          const lines = [...document.querySelectorAll('[data-testid="matchup-enemy-abilities"] [data-testid="ability-cooldown"]')].filter((e) => e.getClientRects().length);
          return lines.length ? { top: Math.min(...lines.map((e) => e.getBoundingClientRect().top)), bottom: Math.max(...lines.map((e) => e.getBoundingClientRect().bottom)), left: 0, right: 0 } : null;
        })(),
        sources: box('[data-testid="matchup-sources-summary"]'),
      },
      // Running text, in rem of the page's own root: the curated words, the notes, the grouped facts' lines.
      body: sizes('[data-testid="briefing-headline"], [data-testid="briefing-rest"], [data-testid="fact-qualifier"], [data-testid="matchup-interaction"], [data-testid="matchup-level-note"] p, [data-testid="ability-name"], [data-testid="assembled-ability"], [data-testid="assembled-no-facts"], [data-testid="assembled-none"], [data-testid="ability-facts-none"], [data-testid^="fact-chip"] span, [data-testid^="assembled-chip"] span'),
      // The lane plan's own words, the curated text a player reads first: the 15px step (text-md) or larger.
      plan: sizes('[data-testid="briefing-headline"], [data-testid="briefing-rest"]'),
      // The key figures: each tile's cooldown numbers (a line with no number is words, said in text-sm).
      figures: sizes('[data-testid="ability-cooldown"] .tabular-nums'),
      scrollers: scrollers.map((e) => e.getAttribute("data-testid") ?? e.tagName.toLowerCase()),
    };
  });
}

/**
 * What each size promises (docs/MATCHUP_INTEL.md, "The lane plan"; the owner's request of 23 Nov 2026
 * and the UX review of Release 13): the lane plan whole on the first screen at every desktop size from
 * 1440 × 900 up, with every enemy cooldown line; at 1920 × 1080, 2560 × 1440 and 3440 × 1440 the
 * sources' summary too. 1280 × 800 (the sidebar open) is promised the bar and the plan's start in the
 * screen's top half. The full reference is one fold under the strip, so a page may scroll by its
 * line: no size promises "no page scroll". Measured 23 Nov 2026 (round 2): the lowest cooldown line
 * 830px at 1440 × 900 and 919px at 1920 × 950, the lowest summary 1027px at 1920 × 1080 (Mordekaiser vs Ornn).
 */
const PROMISES: Record<string, { plan: boolean; cooldowns: boolean; sources: boolean }> = {
  "1920x1080": { plan: true, cooldowns: true, sources: true },
  "2560x1440": { plan: true, cooldowns: true, sources: true },
  "1920x950": { plan: true, cooldowns: true, sources: false },
  "3440x1440": { plan: true, cooldowns: true, sources: true },
  "1440x900": { plan: true, cooldowns: true, sources: false },
  "1280x800": { plan: false, cooldowns: false, sources: false },
};

test("the lane plan is whole on the first screen at every desktop size from 1440×900 up, every test pair, with every enemy cooldown line; the sources' summary too from 1920×1080; text at least text-xs, the plan's words text-md, the cooldowns larger", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop sizes");
  test.setTimeout(900_000);
  await localPictures(page);
  // Each pair loaded once and measured at every size, the window resized as a person's would be.
  for (const [you, enemy] of FIT_PAIRS) {
    await page.setViewportSize({ width: SIZES[0]![0], height: SIZES[0]![1] });
    await openMatchupIntel(page, you, enemy);
    await hydrated(page);
    await expect(enemyAbilities(page)).toHaveCount(5);
    const pair = `${you} vs ${enemy}`;
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const m = await measure(page);
      const at = `${pair} at ${width}×${height}`;
      const promise = PROMISES[`${width}x${height}`]!;
      expect.soft(m.parts.bar?.bottom ?? Infinity, `${at}: the bar on the screen`).toBeLessThanOrEqual(m.innerHeight + 0.5);
      expect.soft(m.parts.plan, `${at}: the lane plan on the page`).not.toBeNull();
      if (promise.plan) expect.soft(m.parts.plan?.bottom ?? Infinity, `${at}: the lane plan whole on the first screen`).toBeLessThanOrEqual(m.innerHeight + 0.5);
      else expect.soft(m.parts.plan?.top ?? Infinity, `${at}: the lane plan starts in the screen's top half`).toBeLessThanOrEqual(m.innerHeight / 2);
      if (promise.cooldowns) expect.soft(m.parts.cooldowns?.bottom ?? Infinity, `${at}: every enemy cooldown line on the first screen`).toBeLessThanOrEqual(m.innerHeight + 0.5);
      if (promise.sources) expect.soft(m.parts.sources?.bottom ?? Infinity, `${at}: the sources' summary on the first screen`).toBeLessThanOrEqual(m.innerHeight + 0.5);
      expect.soft(m.scrollWidth, `${at}: no sideways page scroll`).toBeLessThanOrEqual(m.clientWidth);
      expect.soft(m.scrollers, `${at}: nothing scrolls inside the page`).toEqual([]);
      expect.soft(Math.min(...m.body), `${at}: running text at least text-xs (0.75rem)`).toBeGreaterThanOrEqual(0.75 - 0.001);
      if (m.plan.length) expect.soft(Math.min(...m.plan), `${at}: the lane plan's words at least text-md (0.9375rem)`).toBeGreaterThanOrEqual(0.9375 - 0.001);
      expect.soft(Math.min(...m.figures), `${at}: the cooldowns larger (text-md, 0.9375rem)`).toBeGreaterThanOrEqual(0.9375 - 0.001);
    }
  }
});

/**
 * The bot lane's lineups measured (ADC and Support, four champions each; the overhaul's S7 acceptance:
 * 10 per role here, 2 per role in CI): the kits with the most facts from Riot's text and the longest
 * lines, each lineup first for CI the tightest of the sweep of 20 Nov 2026 at 1440 × 900 and 1280 ×
 * 800 (Varus and Renata against Kalista and Senna; Renata and Jhin against Milio and Smolder) and at
 * 1920 × 950 (Yuumi and Ezreal against Seraphine and Draven, whose two sides are the longest).
 * [role, you, ally, enemy, enemy's partner].
 */
const DUO_FIT: Array<["adc" | "support", string, string, string, string]> = [
  ["adc", "Varus", "Renata", "Kalista", "Senna"],
  ["adc", "Samira", "Leona", "Nilah", "Bard"],
  ["adc", "Jinx", "Lulu", "Caitlyn", "Lux"],
  ["adc", "Aphelios", "Thresh", "Kaisa", "Nautilus"],
  ["adc", "Zeri", "Yuumi", "Jhin", "Pyke"],
  ["adc", "Ezreal", "Karma", "Xayah", "Rakan"],
  ["adc", "Draven", "Seraphine", "Smolder", "Milio"],
  ["adc", "MissFortune", "Brand", "Twitch", "Zyra"],
  ["adc", "Ashe", "Soraka", "Vayne", "Braum"],
  ["adc", "Lucian", "Nami", "Aphelios", "Thresh"],
  ["support", "Renata", "Jhin", "Milio", "Smolder"],
  ["support", "Yuumi", "Ezreal", "Seraphine", "Draven"],
  ["support", "Thresh", "Aphelios", "Nautilus", "Kaisa"],
  ["support", "Pyke", "Zeri", "Rakan", "Xayah"],
  ["support", "Bard", "Samira", "Senna", "Varus"],
  ["support", "Lux", "Jinx", "Leona", "Caitlyn"],
  ["support", "Zyra", "MissFortune", "Brand", "Twitch"],
  ["support", "Karma", "Lucian", "Nami", "Vayne"],
  ["support", "Braum", "Ashe", "Soraka", "Kalista"],
  ["support", "Nautilus", "Kaisa", "Pyke", "Aphelios"],
];
/** CI's subset: the first two lineups of each role (the plan's "2 per role in CI"). */
const DUO_FIT_RUN = process.env.CI ? (["adc", "support"] as const).flatMap((r) => DUO_FIT.filter((l) => l[0] === r).slice(0, 2)) : DUO_FIT;

/** What a 2v2 needs, measured in the browser: the lane plan, both enemies' strips and every cooldown line in them, the sources' summary, the text sizes. */
function measureDuo(page: Page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const root = parseFloat(getComputedStyle(de).fontSize);
    const bottom = (sel: string) => {
      const els = [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length);
      return els.length ? Math.max(...els.map((e) => e.getBoundingClientRect().bottom)) : null;
    };
    const kits = '[data-testid="matchup-enemy-abilities"], [data-testid="matchup-enemy2-abilities"]';
    const scrollers = [...document.querySelectorAll("main *")].filter((e) => {
      const st = getComputedStyle(e);
      return (/(auto|scroll)/.test(st.overflowY) && e.scrollHeight > e.clientHeight + 1) || (/(auto|scroll)/.test(st.overflowX) && e.scrollWidth > e.clientWidth + 1);
    });
    return {
      innerHeight,
      scrollHeight: de.scrollHeight,
      clientWidth: de.clientWidth,
      scrollWidth: de.scrollWidth,
      kits: document.querySelectorAll(kits).length,
      bar: bottom('[aria-label="Champions"]'),
      plan: bottom('[data-testid="matchup-assembled"], [data-testid="matchup-briefing"]'),
      dangerSides: document.querySelectorAll('[data-testid="matchup-assembled"] [data-testid="assembled-danger"]').length,
      cooldowns: bottom(`:is(${kits}) [data-testid="ability-cooldown"]`),
      firstCooldowns: bottom('[data-testid="matchup-enemy-abilities"] [data-testid="ability-cooldown"]'),
      secondStrip: bottom('[data-testid="matchup-enemy2-abilities-summary"]'),
      cooldownLines: document.querySelectorAll(`:is(${kits}) [data-testid="ability-cooldown"]`).length,
      sources: bottom('[data-testid="matchup-sources-summary"]'),
      small: [...document.querySelectorAll<HTMLElement>('[data-testid="matchup-dashboard"] :is(p, span, li, h2, h3, summary)')]
        .filter((e) => e.getClientRects().length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()))
        .map((e) => parseFloat(getComputedStyle(e).fontSize) / root)
        .reduce((a, b) => Math.min(a, b), Infinity),
      scrollers: scrollers.map((e) => e.getAttribute("data-testid") ?? e.tagName.toLowerCase()),
    };
  });
}

test("the bot lane: one lane plan naming all four and leading with both enemies' dangers, whole on the first screen at 1440×900, 1920×1080, 1920×950 and 2560×1440; the first enemy's cooldowns under it there too, the second enemy's strip one press away; every other tool one press away; with the facts from Riot's text on (and Riot's change labels) and off", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop sizes");
  test.setTimeout(600_000);
  await localPictures(page);
  for (const layer of ["on", "off"] as const) {
    await riotText(page, layer);
    for (const [role, you, ally, enemy, enemy2] of DUO_FIT_RUN) {
      // With the facts from Riot's text on, every champion of the lineup also reads as changed by Riot
      // on this patch ("Riot changed this on 26.xx", R11b), as production can show it: the heaviest page.
      await riotChanged(page, layer === "on" ? [you, ally, enemy, enemy2].map((c) => `champion:${c}`) : []);
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto(`/resources/matchups?role=${role}&champion=${you}&ally=${ally}&vs=${enemy}&vs2=${enemy2}`);
      await hydrated(page);
      await expect(page.getByTestId("matchup-enemy2-abilities").getByTestId("ability-row")).toHaveCount(5);
      await expect(page.getByTestId("matchup-ally-abilities")).toBeAttached();
      for (const [width, height] of [[1920, 1080], [1920, 950], [2560, 1440], [1440, 900], [1280, 800]] as const) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const m = await measureDuo(page);
        const at = `${role}: ${you} and ${ally} vs ${enemy} and ${enemy2}, Riot's text ${layer}, at ${width}×${height}`;
        expect.soft(m.kits, `${at}: both enemies' strips`).toBe(2);
        // The second enemy's strip is one press away (the UX review of Release 13): its fold's line on the first screen from 1920 × 1080.
        if (width >= 1920 && height >= 1080) expect.soft(m.secondStrip ?? Infinity, `${at}: the second enemy's strip, folded, on the first screen`).toBeLessThanOrEqual(m.innerHeight + 0.5);
        expect.soft(m.dangerSides, `${at}: the lane plan leads with both enemies' kits`).toBe(2);
        expect.soft(m.cooldownLines, `${at}: ten cooldown lines on the page`).toBeGreaterThanOrEqual(10);
        expect.soft(m.bar ?? Infinity, `${at}: the bar on the screen`).toBeLessThanOrEqual(m.innerHeight + 0.5);
        if (width !== 1280) {
          expect.soft(m.plan ?? Infinity, `${at}: the lane plan whole on the first screen`).toBeLessThanOrEqual(m.innerHeight + 0.5);
          expect.soft(m.firstCooldowns ?? Infinity, `${at}: the first enemy's cooldown lines on the first screen`).toBeLessThanOrEqual(m.innerHeight + 0.5);
        }
        expect.soft(m.scrollWidth, `${at}: no sideways page scroll`).toBeLessThanOrEqual(m.clientWidth);
        expect.soft(m.scrollers, `${at}: nothing scrolls inside the page`).toEqual([]);
        expect.soft(m.small, `${at}: no text under the 2xs size (0.6875rem)`).toBeGreaterThanOrEqual(0.6875 - 0.001);
      }
    }
  }
  // What the layout put one step away is there, not cut: each strip's sources in its fold, your duo's
  // tools in the lane plan's fold, your duo's kits in the full reference (the last lineup's page, with
  // Riot's text off). Each sources fold's name says whose sources they are, the two one under the other.
  const kit = page.getByTestId("matchup-enemy-abilities");
  const lastEnemy = DUO_FIT_RUN.at(-1)![3];
  await expect(kit.getByTestId("abilities-source")).toBeHidden();
  await expect(kit.getByTestId("matchup-enemy-abilities-sources").locator(":scope > summary")).toHaveAccessibleName(`Riot's data · Sources for ${lastEnemy}'s abilities`);
  await kit.getByTestId("matchup-enemy-abilities-sources").locator(":scope > summary").click();
  await expect(kit.getByTestId("abilities-source-folded")).toBeVisible();
  await expect(kit.getByTestId("abilities-source-folded")).toContainText("Base cooldowns, without ability haste");
  // The second strip: closed, named, and the one haste above applies to its lines too.
  const second = page.getByTestId("matchup-enemy2-abilities-fold");
  await expect(second).not.toHaveAttribute("open", "");
  await expect(page.getByTestId("matchup-enemy2-abilities")).toContainText("the haste chosen above applies here too");
  await page.getByTestId("matchup-enemy2-abilities-summary").click();
  await expect(page.getByTestId("matchup-enemy2-abilities").getByTestId("ability-row").first()).toBeVisible();
  await expect(page.getByTestId("matchup-enemy2-abilities-sources").locator(":scope > summary")).toHaveAccessibleName(/^Riot's data · Sources for \w+'s abilities$/);
  // Every champion's other tools, the enemies' own and your duo's, one press away under the dangers.
  const tools = page.getByTestId("assembled-other-tools");
  await expect(tools.getByTestId("assembled-yours")).toHaveCount(2);
  await expect(tools.getByTestId("assembled-yours").first()).toBeHidden();
  await tools.locator(":scope > summary").click();
  await expect(tools.getByTestId("assembled-yours").first()).toBeVisible();
  await page.getByTestId("matchup-full-reference-summary").click();
  await page.getByTestId("matchup-ally-abilities").locator(":scope > summary").click();
  await expect(page.getByTestId("matchup-ally-abilities").getByTestId("your-abilities-source-inside")).toBeVisible();
  await expect(page.getByTestId("matchup-ally-abilities").getByTestId("your-abilities-source-inside")).toContainText("Abilities and base cooldowns");
});

test("the header's details hold (design review of 20 Nov 2026, G2): the slots' words level, an empty slot's words on one line, the chosen lane and haste marked by more than colour, the haste field's placeholder whole, the remembered line in small type, a cooldown's source kept whole", async ({ page }, info) => {
  const slots = () =>
    page.evaluate(() => {
      const box = (id: string) => document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const remembered = document.querySelector('[data-testid="matchup-remembered"]');
      return { you: box("matchup-pick-you-name"), enemy: box("matchup-pick-enemy-name"), youLabel: box("matchup-pick-you-label"), enemyLabel: box("matchup-pick-enemy-label"), remembered: remembered ? parseFloat(getComputedStyle(remembered).fontSize) / root : null };
    });
  // Nothing chosen, then a pair: the two names share a line, and the labels end level (G2-4, G2-5).
  for (const url of ["/resources/matchups?role=top", "/resources/matchups?role=top&champion=Riven&vs=Mordekaiser"]) {
    await page.goto(url);
    await hydrated(page);
    const m = await slots();
    // On a phone a label wraps: the words sit at the slot's foot, names and labels ending level. From a
    // tablet a name may wrap: the words sit at its top, labels and names starting level.
    const edge = info.project.name === "phone" ? "bottom" : "top";
    expect.soft(Math.abs(m.you[edge] - m.enemy[edge]), `${url}: the names level (${edge})`).toBeLessThanOrEqual(1);
    expect.soft(Math.abs(m.youLabel[edge] - m.enemyLabel[edge]), `${url}: the labels level (${edge})`).toBeLessThanOrEqual(1);
    if (info.project.name === "desktop") expect.soft(Math.abs(m.you.height - m.enemy.height), `${url}: "Choose your champion" on one line, as the enemy's`).toBeLessThanOrEqual(1);
    // The remembered line in the patch line's small type (G2-13).
    if (m.remembered !== null) expect.soft(m.remembered, `${url}: the remembered line at text-xs`).toBeLessThanOrEqual(0.75 + 0.001);
  }
  // The chosen lane and haste: fill, ring and weight, not colour alone (G2-10).
  const marks = await page.evaluate(() =>
    ['[data-testid="matchup-role"] button', '[data-testid="matchup-haste"] [role="group"] button'].map((sel) =>
      [...document.querySelectorAll<HTMLElement>(sel)].map((b) => ({ on: b.getAttribute("aria-pressed") === "true", ring: getComputedStyle(b).boxShadow.includes("inset"), weight: getComputedStyle(b).fontWeight })),
    ),
  );
  for (const group of marks) {
    expect.soft(group.filter((b) => b.on).map((b) => [b.ring, b.weight])).toEqual([[true, "600"]]);
    expect.soft(group.filter((b) => !b.on).every((b) => !b.ring && b.weight === "500"), "the idle segments: no ring, medium weight").toBe(true);
  }
  // The haste field's placeholder whole, at 16px on a touch screen (G2-1).
  const field = await page.getByTestId("matchup-haste").locator("input").evaluate((i: HTMLInputElement) => {
    const cs = getComputedStyle(i);
    const probe = document.createElement("span");
    Object.assign(probe.style, { position: "absolute", whiteSpace: "pre", fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight, letterSpacing: cs.letterSpacing });
    probe.textContent = i.placeholder;
    document.body.append(probe);
    const text = probe.getBoundingClientRect().width;
    probe.remove();
    return { text, room: i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) };
  });
  expect.soft(field.text, "the haste field's placeholder fits").toBeLessThanOrEqual(field.room);
  // A cooldown's source never split over two lines (G2-12): Darius's tiles.
  await page.goto("/resources/matchups?role=top&champion=Garen&vs=Darius");
  await hydrated(page);
  const split = await page.evaluate(() => [...document.querySelectorAll('[data-testid="ability-cooldown-source"]')].filter((e) => e.getClientRects().length > 1).map((e) => e.textContent));
  expect.soft(split, "each cooldown's source on one line").toEqual([]);
});

/**
 * The pages a later patch adds most to: the three curated pairs, whose bar, briefing, kits' lines and
 * notes panels each say "Not re-checked for …" then, and the other way round (two checked kits, put
 * together), whose kits' lines and notes panels say it.
 */
const LATER_PATCH_PAIRS: Array<[string, string]> = [
  ["Riven", "Mordekaiser"],
  ["Ambessa", "Renekton"],
  ["Gwen", "Ornn"],
  ["Mordekaiser", "Riven"],
  ["Renekton", "Ambessa"],
  ["Ornn", "Gwen"],
];

/** The demo's patch (26.22): a patch after the notes' check, they are "Not re-checked for 26.22". */
const DEMO_PATCH = publicPatchName(patchFromVersion(E2E_DDRAGON_VERSION)!);

test("a patch after the curated notes' check, as production is until they are re-checked (Release 6's Production check): each check says it is not re-checked, and the Production check's fit facts hold at 1440×900 and 1920×1080 on the curated pairs (their reverse: the lane plan whole, the strip starting on the screen); the lane plan whole at 1920×950 and starting in the top half at 1280×800", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop sizes");
  test.setTimeout(300_000);
  await localPictures(page);
  // As production runs: the facts from Riot's text off, as they ship (none would show here: checked notes win).
  await riotText(page, "off");
  // The demo is pinned to the version the notes were checked on: they read as checked a patch before it.
  await notesAge(page, 1);
  const frames = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  for (const [you, enemy] of LATER_PATCH_PAIRS) {
    const pair = `${you} vs ${enemy}`;
    // As the Production check reads its pair: opened at 1440 x 900, then the window made 1920 x 1080.
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMatchupIntel(page, you, enemy);
    await hydrated(page);
    await expect(enemyAbilities(page), pair).toHaveCount(5);
    // The state: every checked part beside its check, "Not re-checked for 26.22" (production's "… for 26.23").
    const notices = page.getByTestId("matchup-intel").getByTestId("matchup-not-rechecked");
    await expect(notices.first(), pair).toHaveText(notRecheckedWords(DEMO_PATCH));
    await expect(page.getByTestId("matchup-curated-checked").first(), pair).toContainText(notRecheckedWords(DEMO_PATCH));
    await frames();
    const at = await page.evaluate(readMatchupIntel);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await frames();
    const wide = await page.evaluate(readMatchupIntel);
    expect(briefingState(at), pair).toBe("shown");
    if (at.layer === "curated") expect(at.notRechecked, `${pair}: the bar and the briefing say it`).toBe(true);
    // The Production check's own fit facts (scripts/matchup-intel-facts.mjs), judged as it judges them,
    // on the curated pairs (the check reads Riven vs Mordekaiser). Their reverse is a lane reference of
    // two checked kits over a strip of a checked kit, the tallest state the redesign measured
    // (Mordekaiser vs Riven's sources' summary 907px, Ornn vs Gwen's 971px at 1440 × 900): there the
    // lane plan is whole on the first screen and the strip starts on it (docs/MATCHUP_INTEL.md, "The lane plan").
    const fits = matchupIntelVerdicts({ kind: "desktop", pair, enemy, at, wide, wiki: [] }).filter((v) => /^desktop: (1920 × 1080|1440 × 900): /.test(v.name));
    expect(fits, pair).toHaveLength(2);
    if (at.layer === "curated") for (const v of fits) expect.soft(v.status, `${pair}: ${v.name} ${JSON.stringify(v.detail)}`).toBe("PASS");
    else {
      expect.soft(at.planBottom ?? Infinity, `${pair} at 1440×900: the lane plan whole`).toBeLessThanOrEqual(at.innerHeight);
      expect.soft(wide.planBottom ?? Infinity, `${pair} at 1920×1080: the lane plan whole`).toBeLessThanOrEqual(wide.innerHeight);
      const stripTop = await page.getByTestId("matchup-enemy-abilities").evaluate((e) => e.getBoundingClientRect().top);
      expect.soft(stripTop, `${pair} at 1920×1080: the strip starts on the first screen`).toBeLessThanOrEqual(wide.innerHeight);
    }
    // 1280 x 800 (the sidebar open), as PROMISES: the bar, and the lane plan starting in the screen's top half.
    await page.setViewportSize({ width: 1280, height: 800 });
    await frames();
    const small = await measure(page);
    expect.soft(small.parts.bar?.bottom ?? Infinity, `${pair} at 1280×800: the bar on the screen`).toBeLessThanOrEqual(small.innerHeight + 0.5);
    expect.soft(small.parts.plan?.top ?? Infinity, `${pair} at 1280×800: the lane plan starts in the top half`).toBeLessThanOrEqual(small.innerHeight / 2);
    // A maximised 1920 x 1080 window: the lane plan whole.
    await page.setViewportSize({ width: 1920, height: 950 });
    await frames();
    const maximised = await measure(page);
    expect.soft(maximised.parts.plan?.bottom ?? Infinity, `${pair} at 1920×950: the lane plan whole on the first screen`).toBeLessThanOrEqual(maximised.innerHeight + 0.5);
  }
});

/**
 * Riot changed one of the Production check's pair's abilities after the curated check (Release 8's
 * verifier: the one state of the pair CI could not reach; the warnings' extra lines put its sources'
 * summary 7px under the fold at 1440 x 900). One patch on, as a change comes with a patch. The
 * player's own abilities (Riven's: the bar's warning where a briefing point rests on one, the folded
 * champion's warning) and, apart, the enemy's (its tile flagged), where only the tiles and the
 * 1920 x 1080 screen hold (docs/MATCHUP_INTEL.md, "What the browser tests pin").
 */
const CHANGED_OWN = ["Riven.Q", "Riven.W", "Riven.E", "Riven.R"];

test("an ability Riot changed after the curated check, on the Production check's pair: its fit facts hold at 1440×900 and 1920×1080 (judged as when nothing is hidden), the lane plan starting in the top half at 1280×800; an enemy ability changed: the lane plan and its tiles on the screen at 1440×900, the 1920×1080 fact, its flagged notes in its Peek", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop sizes");
  test.setTimeout(300_000);
  await localPictures(page);
  await riotText(page, "off");
  await notesAge(page, 1);
  const [you, enemy] = ["Riven", "Mordekaiser"];
  const frames = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  // And Riot's per-version diff saying so: "Riot changed this on 26.22" on both champions' rows (PLAN S7b), so every fit below holds with the labels.
  await riotChanged(page, [`champion:${you}`, `champion:${enemy}`]);
  for (const ref of [...CHANGED_OWN, "Mordekaiser.Q"]) {
    const pair = `${you} vs ${enemy} (${ref} changed)`;
    const own = ref.startsWith(`${you}.`);
    await changedAbilities(page, [ref]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMatchupIntel(page, you, enemy);
    await hydrated(page);
    await expect(enemyAbilities(page), pair).toHaveCount(5);
    // The state: the ability flagged where its tile is (the folded champion's, or the enemy's).
    const tiles = page.getByTestId(own ? "matchup-your-abilities" : "matchup-enemy-abilities").getByTestId("ability-row");
    await expect(tiles.and(page.locator(`[data-slot="${ref.split(".")[1]}"]`)), pair).toHaveAttribute("data-freshness", "changed-since");
    // The labels: the enemy's continuing its panel's "Riot's data" tier words, yours on its folded summary's line, the same words, quiet (no larger than text-2xs).
    const patch = publicPatchName(patchFromVersion(E2E_DDRAGON_VERSION)!);
    const label = page.getByTestId("matchup-enemy-abilities").getByTestId("riot-changed");
    await expect(label, pair).toHaveText(`changed on ${patch}`);
    await expect(page.getByTestId("matchup-your-abilities").getByTestId("riot-changed"), pair).toHaveText(`changed on ${patch}`);
    const row = await label.evaluate((el) => {
      const tier = el.parentElement!.querySelector('[data-testid="evidence-tier"]')!.getBoundingClientRect();
      // Every fragment of the label on the tier's line: a label that wraps fails.
      const rects = [...el.getClientRects()];
      return { sameRow: rects.length > 0 && rects.every((r) => Math.abs(r.bottom - tier.bottom) < 6), size: parseFloat(getComputedStyle(el).fontSize) };
    });
    expect.soft(row.sameRow, `${pair}: the label on the tier's row at 1440×900`).toBe(true);
    expect.soft(row.size, `${pair}: the label in small type`).toBeLessThanOrEqual(12);
    await frames();
    const at = await page.evaluate(readMatchupIntel);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await frames();
    const wide = await page.evaluate(readMatchupIntel);
    // The Production check judges the fit only while nothing is hidden: judged here as then, for the
    // player's ability and the enemy's alike (Release 10: an enemy ability's flagged notes are in its
    // Details window, its badge on the tile, so the enemy's column fits as the player's does).
    // The enemy's own ability changed (its tile flagged, a briefing point hidden: a state the check does not
    // judge) is held to the lane plan whole and its five tiles at 1440 × 900, and the 1920 × 1080 fact.
    const fits = matchupIntelVerdicts({ kind: "desktop", pair, enemy, at: { ...at, hiddenParts: 0 }, wide: { ...wide, hiddenParts: 0 }, wiki: [] }).filter((v) => /^desktop: (1920 × 1080|1440 × 900): /.test(v.name));
    expect(fits, pair).toHaveLength(2);
    for (const v of fits) if (own || v.name.startsWith("desktop: 1920 × 1080")) expect.soft(v.status, `${pair}: ${v.name} ${JSON.stringify(v.detail)}`).toBe("PASS");
    expect.soft(at.planBottom ?? Infinity, `${pair} at 1440×900: the lane plan whole`).toBeLessThanOrEqual(at.innerHeight);
    expect.soft(at.tilesBottom, `${pair} at 1440×900: the enemy's five tiles on the screen`).toBeLessThanOrEqual(at.innerHeight);
    if (!own) {
      // The flagged notes one step away: the badge on the tile, the notes in its Details window.
      const tile = tiles.and(page.locator(`[data-slot="${ref.split(".")[1]}"]`));
      await expect(tile.getByTestId("ability-changed-badge"), pair).toBeVisible();
      await expect(tile.getByText(/^Notes from patch/), pair).toBeHidden();
      await tile.getByTestId("ability-details").click();
      await expect(page.getByTestId("ability-details-body").getByTestId("ability-flagged-notes"), pair).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("ability-details-body"), pair).toHaveCount(0);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await frames();
    const small = await measure(page);
    expect.soft(small.parts.plan?.top ?? Infinity, `${pair} at 1280×800: the lane plan starts in the top half`).toBeLessThanOrEqual(small.innerHeight / 2);
  }
  // The same state at 320 x 568 and twice the text size: the hidden point's chip keeps whole (its icon
  // steps aside), a badge that starts a line of the curated notes' line is not indented, nothing wider.
  await page.setViewportSize({ width: 320, height: 568 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: 32, fixed: 26 } });
  await openMatchupIntel(page, you, enemy);
  await hydrated(page);
  const narrow = await page.evaluate(() => {
    const broken: string[] = [];
    for (const root of document.querySelectorAll('[data-testid$="-hidden"]')) {
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode())
        for (const m of (n.textContent ?? "").matchAll(/\S+/g)) {
          const r = document.createRange();
          r.setStart(n, m.index!);
          r.setEnd(n, m.index! + m[0].length);
          if (new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size > 1) broken.push(m[0]);
        }
    }
    // A badge first on its line sits at the line's start: no more to its left than the line's own words.
    const indented = [...document.querySelectorAll('[data-testid="matchup-curated-checked"]')].flatMap((line) => {
      const start = Math.min(...[...line.getClientRects()].map((r) => r.left));
      return [...line.querySelectorAll(":scope > span.inline-flex")].map((b) => b.getBoundingClientRect().left - start).filter((d) => d > 0.5 && d < 24);
    });
    return { broken, indented, sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  expect.soft(narrow.broken, "320 at 200%: no word of a hidden point's note broken").toEqual([]);
  expect.soft(narrow.indented, "320 at 200%: no badge indented at a line's start").toEqual([]);
  expect.soft(narrow.sideways, "320 at 200%: nothing wider than the phone").toBeLessThanOrEqual(0);
});

/** Pairs across the roster, fixed so a failure names the same ones every run: priority champions, other lanes, mirrors, odd kits. */
const CHOSEN: Array<[string, string]> = [
  ["Riven", "Teemo"],
  ["Gwen", "Yasuo"],
  ["Ambessa", "Fiora"],
  ["Ornn", "Gwen"],
  ["Mordekaiser", "Riven"],
  ["Renekton", "Ambessa"],
  ["Ahri", "Zed"],
  ["Thresh", "Leona"],
  ["Jinx", "Caitlyn"],
  ["Lux", "Xerath"],
  ["Lillia", "Kindred"],
  ["Zoe", "Syndra"],
  ["Rengar", "KhaZix"],
  ["Azir", "Sylas"],
  ["Aphelios", "Senna"],
  ["Kled", "Yorick"],
  ["Riven", "Riven"],
  ["MonkeyKing", "Belveth"],
  ["Hwei", "Zeri"],
  ["Mel", "Smolder"],
];

/** The roster the demo serves (Data Dragon 16.22.1's 173 champions, the same ids as the committed copy). */
const ROSTER: string[] = (JSON.parse(readFileSync(path.join(__dirname, "../src/server/riot/fixtures/champions.fixture.json"), "utf8")) as { champions: Array<{ id: string }> }).champions.map((c) => c.id);

/** Pairs drawn at random from the whole roster by a seeded generator: random, yet the same every run, so a failure names its pair. */
function drawnPairs(n: number, seed: number): Array<[string, string]> {
  let s = seed;
  const next = () => (s = (s * 1103515245 + 12345) % 2147483648) % ROSTER.length;
  return Array.from({ length: n }, () => [ROSTER[next()]!, ROSTER[next()]!] as [string, string]);
}

/** The sweep: the chosen pairs, then 20 drawn from the roster. */
const SWEEP: Array<[string, string]> = [...CHOSEN, ...drawnPairs(20, 20261119)];

test("every pair gives a meaningful reference, labelled for what it is: a sweep across the roster, chosen pairs and 20 drawn at random", async ({ page }, info) => {
  test.skip(info.project.name === "tablet", "the sweep runs on the phone and the desktop");
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [you, enemy] of SWEEP) {
    await openMatchupIntel(page, you, enemy);
    const at = `${you} vs ${enemy}`;
    const dashboard = page.getByTestId("matchup-dashboard");
    const layer = await dashboard.getAttribute("data-layer");
    expect(layer, at).toMatch(/^(curated|assembled)$/);
    if (layer === "curated") {
      await expect(page.getByTestId("matchup-briefing"), at).toBeVisible();
      await expect(page.getByTestId("matchup-layer"), at).toContainText("Curated briefing");
    } else {
      await expect(page.getByTestId("matchup-assembled-label"), at).toHaveText(new RegExp(`^Put together from each champion's own facts\\. No person has checked .+ vs .+ as a pair\\.$`));
      await expect(page.getByTestId("matchup-layer"), at).toContainText("Assembled reference");
      for (const side of await page.locator('[data-testid^="assembled-"][data-from]').all()) {
        if ((await side.getAttribute("data-from")) === "none") await expect(side.getByTestId("assembled-no-facts"), at).toBeVisible();
        else {
          // Every kind said: a group of its own where it holds facts, else named once in the empty groups' line.
          const words = (await side.textContent()) ?? "";
          const side_ = (await side.getAttribute("data-testid")) ?? "";
          const kinds = side_ === "assembled-danger" ? ["Crowd control"] : side_ === "assembled-tools" ? ["Mobility", "Defence", "Sustain", "Empowerments"] : ["Crowd control", "Burst and power", "Mobility", "Defence", "Sustain"];
          for (const kind of kinds) expect(words, `${at}: ${kind}`).toContain(kind);
          expect((await side.getByTestId("assembled-group").count()) + (await side.getByTestId("assembled-none").count()), at).toBeGreaterThan(0);
        }
      }
    }
    await expect(enemyAbilities(page), at).toHaveCount(5);
    for (const tile of await enemyAbilities(page).all()) {
      await expect(tile.getByTestId("ability-name"), at).not.toBeEmpty();
      await expect(tile.getByTestId("ability-cooldown-value"), at).not.toBeEmpty();
    }
    await expect(page.getByTestId("matchup-dashboard"), at).not.toContainText(/\bverified\b/i);
    // Facts from Riot's text: every chip of the enemy's labelled; a tile with none says so in words,
    // never "none" (read in one go: a tile with no chips has no list to wait for).
    await expect(page.getByTestId("matchup-dashboard"), at).not.toContainText("None recorded in Riot's text");
    const riot = await page.getByTestId("matchup-enemy-abilities").evaluate((panel) => ({
      label: !!panel.querySelector('[data-testid="matchup-riot-text-label"]'),
      descriptions: [...panel.querySelectorAll('[data-testid="ability-facts"][data-from="riot-text"] :is([data-testid="fact-chip"], [data-testid="fact-chip-differ"])')].map((b) => document.getElementById(b.getAttribute("aria-describedby") ?? "")?.textContent ?? ""),
      none: [...panel.querySelectorAll('[data-testid="ability-facts-none"]')].map((e) => e.textContent?.trim() ?? ""),
    }));
    for (const d of riot.descriptions) expect(d, at).toMatch(/From Riot's ability text, reviewed automatically \(not by a person\)\.$/);
    // The abilities with no reviewed fact, said once under the strip.
    if (riot.label) {
      expect(riot.none.length, at).toBeLessThanOrEqual(1);
      for (const n of riot.none) expect(n, at).toMatch(/^No reviewed facts for (Passive|[QWER])(, [QWER])*( and [QWER])?$/);
    }
  }
  expect(errors).toEqual([]);
});

test("switching keeps the lineup in the address: a deep link and a reload keep it, and after three changes Back leaves Matchup Intel", async ({ page }) => {
  await page.goto("/resources");
  await openMatchupIntel(page, "Riven", "Mordekaiser");
  await hydrated(page);
  await expect(page.getByTestId("matchup-dashboard")).toHaveAttribute("data-layer", "curated");
  await choose(page, "enemy", "darius", "Darius");
  await expect(page).toHaveURL(/\?role=top&champion=Riven&vs=Darius$/);
  await expect(page.getByTestId("matchup-dashboard")).toHaveAttribute("data-layer", "assembled");
  await expect(page.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", "Darius");
  // The swap trades the sides, in the address too.
  await page.getByTestId("matchup-swap").click();
  await expect(page).toHaveURL(/\?role=top&champion=Darius&vs=Riven$/);
  await expect(page.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", "Riven");
  // The lane, a third change: Mid keeps the pair.
  await page.getByTestId("matchup-role").getByRole("button", { name: "Mid" }).click();
  await expect(page).toHaveURL(/\?role=mid&champion=Darius&vs=Riven$/);
  await expect(page.getByTestId("matchup-role").getByRole("button", { name: "Mid" })).toHaveAttribute("aria-pressed", "true");
  // A reload keeps the lineup the address names.
  await page.reload();
  await expect(page.getByTestId("matchup-pick-you")).toHaveAttribute("data-champion", "Darius");
  await expect(page.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", "Riven");
  await expect(page.getByTestId("matchup-role").getByRole("button", { name: "Mid" })).toHaveAttribute("aria-pressed", "true");
  // Each change replaced the entry: Back leaves for the page before, in one step.
  await page.goBack();
  await expect(page).toHaveURL(/\/resources$/);
  await page.goForward();
  // A deep link opens its pair at once, by id or by name.
  await page.goto("/resources/matchups?champion=gwen&vs=ornn");
  await expect(page.getByTestId("matchup-pick-you")).toHaveAttribute("data-champion", "Gwen");
  await expect(page.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", "Ornn");
  await expect(page.getByTestId("matchup-dashboard")).toHaveAttribute("data-layer", "curated");
});

test("each chip opens what it rests on, and says it to a screen reader; a checked fact names its source, a fact from Riot's text quotes it", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "a mouse");
  await openMatchupIntel(page, "Ambessa", "Renekton");
  await hydrated(page);
  // A checked fact (Renekton's W stun): its own words and its source page.
  const chip = page.locator('[data-testid="matchup-enemy-abilities"] [data-testid="ability-row"][data-slot="W"] [data-testid="fact-chip"]').first();
  await expect(chip).toHaveAccessibleDescription(/Checked notes \(drafted and audited by AI agents, not by a person\) · from League of Legends Wiki: /);
  await chip.hover();
  await expect(page.getByTestId("fact-chip-bubble")).toBeVisible();
  await expect(page.getByTestId("fact-chip-bubble")).toContainText("from League of Legends Wiki:");
  // Wherever facts from Riot's text are shown, each chip quotes the clause and says how it was reviewed.
  await openMatchupIntel(page, "Riven", "Darius");
  await hydrated(page);
  const riotText = page.locator('[data-testid="ability-facts"][data-from="riot-text"] [data-testid="fact-chip"]');
  expect(await riotText.count()).toBeGreaterThan(0);
  await expect(riotText.first()).toHaveAccessibleDescription(/^“.+” \(Riot's (tooltip|description) (for|of) [^)]+\)( (Riot adds|Cuts the cooldown of) “[^”]+”( \(Riot's [^)]+\))?)?( Conditional: see Riot's text\.)? From Riot's ability text, reviewed automatically \(not by a person\)\.$/);
  await riotText.first().hover();
  await expect(page.getByTestId("fact-chip-bubble")).toContainText("From Riot's ability text, reviewed automatically (not by a person).");
});

/** An enemy ability's tile, by slot. */
const tileOf = (page: Page, slot: string) => page.locator(`[data-testid="matchup-enemy-abilities"] [data-testid="ability-row"][data-slot="${slot}"]`);

test("the facts from Riot's text, as the review recorded them: a qualifier with its fact, the conditional marker, Riot's texts differing, placeholders unresolved, few facts said as such", async ({ page }, info) => {
  test.skip(info.project.name === "tablet", "the phone and the desktop");
  // Gnar's W: the stun holds for Mega Gnar only, and the chip says so, in Riot's words.
  await openMatchupIntel(page, "Riven", "Gnar");
  await hydrated(page);
  const gnarW = tileOf(page, "W").getByTestId("fact-chip");
  await expect(gnarW).toHaveCount(1);
  // The chip names its kind; Riot's addition is said under the chips, never as the chip's quote.
  await expect(gnarW).toHaveText(/^Crowd control: ?Stun$/);
  await expect(tileOf(page, "W").getByTestId("fact-qualifier")).toHaveText("Stun: Riot adds “Mega Gnar”");
  await expect(gnarW).toHaveAccessibleDescription("“stunning enemies in an area.” (Riot's description of Hyper / Wallop) Riot adds “Mega Gnar” From Riot's ability text, reviewed automatically (not by a person).");
  // The assembled reference shows the same chip in its group.
  await expect(page.getByTestId("assembled-danger").getByTestId("fact-qualifier").filter({ hasText: "Stun: Riot adds “Mega Gnar”" }).first()).toBeVisible();
  // Annie's passive: the stun holds only under a condition Riot's text names with a number, so the
  // owner's marker is under the chips, naming it, and in its tip with the quote, one tap away.
  await openMatchupIntel(page, "Riven", "Annie");
  await hydrated(page);
  const annieP = tileOf(page, "P").getByTestId("fact-chip").filter({ hasText: "Stun" });
  await expect(tileOf(page, "P").getByTestId("ability-facts-conditional")).toHaveText("Conditional: see Riot's text (Stun)");
  await expect(page.getByTestId("assembled-danger").getByTestId("assembled-conditional")).toContainText(["Conditional: see Riot's text (Stun)"]);
  await annieP.click();
  await expect(page.getByTestId("fact-chip-bubble")).toContainText("“Annie's next offensive spell will stun the target.” (Riot's description of Pyromania)");
  await expect(page.getByTestId("fact-chip-bubble")).toContainText("Conditional: see Riot's text.");
  // Yone's R: Riot's description says a pull, the tooltip a knock-up. One neutral chip says the texts differ and opens both; no chip of either kind.
  await openMatchupIntel(page, "Riven", "Yone");
  await hydrated(page);
  const yoneR = tileOf(page, "R");
  await expect(yoneR.getByTestId("fact-chip-differ")).toHaveText("Riot's texts differ");
  await expect(yoneR.getByTestId("fact-chip")).toHaveText(["Mobility: Teleport"]);
  await yoneR.getByTestId("fact-chip-differ").click();
  const bubble = page.getByTestId("fact-chip-differ-bubble");
  await expect(bubble).toContainText("Pull, in Riot's description of Fate Sealed: “Yone blinks behind the last champion in a line with a slash so powerful it pulls all enemies hit towards him.”");
  await expect(bubble).toContainText("Knock-up, in Riot's tooltip for Fate Sealed: “teleporting behind the last champion hit and Knocking Up victims towards Yone.”");
  await expect(bubble).toContainText("Neither is shown as a fact.");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("assembled-danger").locator('[data-group="crowd-control"]').getByTestId("assembled-chip-differ")).toHaveCount(1);
  await yoneR.getByTestId("ability-details").click();
  const details = page.getByTestId("ability-details-body");
  await expect(details.getByTestId("ability-details-differ")).toContainText("Riot's texts differ");
  await expect(details.getByTestId("ability-details-differ")).toContainText("Neither is shown as a fact.");
  // Yone's R teleport, which Riot's description calls a blink: said here, never a chip of its own.
  await expect(details.getByTestId("ability-details-also")).toHaveText("Riot's description calls it blink: “Yone blinks behind the last champion in a line”");
  await page.keyboard.press("Escape");
  await expect(details).toHaveCount(0);
  // Twisted Fate: Riot's placeholders stay unresolved (his W's {{ e3 }} is a number in Riot's effectBurn, never shown).
  await openMatchupIntel(page, "Riven", "TwistedFate");
  await hydrated(page);
  const stun = tileOf(page, "W").getByTestId("fact-chip").filter({ hasText: "Stun" });
  await expect(stun).toHaveAccessibleDescription(/^“The Gold Card deals \[…\] and Stuns for \[…\] seconds\.” \(Riot's tooltip for Pick a Card\)/);
  const tfR = tileOf(page, "R").getByTestId("fact-chip").filter({ hasText: "Teleport" });
  await expect(tfR).toHaveAccessibleDescription(/“Recast: Twisted Fate teleports up to \[…\] units away\.”/);
  for (const chip of await page.getByTestId("matchup-enemy-abilities").getByTestId("fact-chip").all()) {
    expect(await chip.evaluate((b) => document.getElementById(b.getAttribute("aria-describedby")!)!.textContent)).not.toMatch(/\d|\{\{/);
  }
  // Karma's passive refunds Mantra's cooldown, and the chip names it.
  await openMatchupIntel(page, "Riven", "Karma");
  await expect(tileOf(page, "P").getByTestId("fact-qualifier")).toHaveText("Cooldown refund: cuts the cooldown of “Mantra”");
  // Kog'Maw, one fact: every other ability says it has no reviewed fact, every empty group the same, never "none".
  await openMatchupIntel(page, "Riven", "KogMaw");
  await hydrated(page);
  await expect(page.getByTestId("matchup-enemy-abilities").getByTestId("fact-chip")).toHaveCount(1);
  await expect(page.getByTestId("matchup-enemy-abilities").getByTestId("ability-facts-none")).toHaveText(/^No reviewed facts for (Passive|[QWER])(, [QWER])* and [QWER]$/);
  // His danger and his other tools: one group holding his fact, every other kind named once in fixed words, never "none".
  const sides = page.getByTestId("matchup-assembled").locator('[data-testid="assembled-danger"], [data-testid="assembled-tools"]');
  await expect(sides.getByTestId("assembled-group")).toHaveCount(1);
  for (const line of await sides.getByTestId("assembled-none").allTextContents()) expect(line).toMatch(/^No reviewed facts of (this kind|these kinds): [A-Z][a-z ]+((, [A-Z][a-z ]+)* and [A-Z][a-z ]+)?\.$/);
  // How they were reviewed, in the sources, from the review's record; never "verified".
  await page.getByTestId("matchup-sources").locator(":scope > summary").click();
  await expect(page.getByTestId("matchup-footer-riot-text")).toContainText("Reviewed by two independent automated reviewers and an adjudicator, then a consistency pass checked by two more independent automated checkers; no person has checked them. No number in that text is used for these facts.");
  await expect(page.getByTestId("matchup-dashboard")).not.toContainText(/\bverified\b/i);
});

test("the five roles: a solo lane sets two slots, the bot lane four; an empty slot names what it wants and filling it moves nothing; the haste, Riot's tips and the link", async ({ page, context }, info) => {
  await openMatchupIntel(page);
  await hydrated(page);
  const role = (name: string) => page.getByTestId("matchup-role").getByRole("button", { name, exact: true });
  const pickers = page.getByTestId("matchup-pickers");
  // Top, Jungle and Mid: you against one enemy, and nothing else asked for.
  for (const r of ["Top", "Jungle", "Mid"]) {
    await role(r).click();
    await expect(role(r)).toHaveAttribute("aria-pressed", "true");
    await expect(pickers).toHaveAttribute("data-slots", "2");
    await expect(page.getByTestId("matchup-pick-ally")).toHaveCount(0);
    await expect(page.getByTestId("matchup-pick-enemy2")).toHaveCount(0);
  }
  // ADC: your ADC and support against theirs, each empty slot saying what it wants.
  await role("ADC").click();
  await expect(page).toHaveURL(/\?role=adc$/);
  await expect(pickers).toHaveAttribute("data-slots", "4");
  await expect(page.getByTestId("matchup-pick-you-name")).toHaveText("Choose your ADC");
  await expect(page.getByTestId("matchup-pick-ally-name")).toHaveText("Choose your support");
  await expect(page.getByTestId("matchup-pick-enemy-name")).toHaveText("Choose the enemy ADC");
  await expect(page.getByTestId("matchup-pick-enemy2-name")).toHaveText("Choose the enemy support");
  // Filling one slot moves no other element (±1px): every slot keeps its place.
  const boxes = () => Promise.all(["you", "ally", "enemy", "enemy2", "swap"].map((s) => page.getByTestId(s === "swap" ? "matchup-swap" : `matchup-pick-${s}`).boundingBox()));
  const before = await boxes();
  await choose(page, "enemy2", "lux", "Lux");
  const after = await boxes();
  for (const [i, b] of before.entries()) {
    if (i === 3) continue;
    expect(Math.abs(after[i]!.x - b!.x), `slot ${i} x`).toBeLessThanOrEqual(1);
    expect(Math.abs(after[i]!.y - b!.y), `slot ${i} y`).toBeLessThanOrEqual(1);
  }
  await choose(page, "enemy", "caitlyn", "Caitlyn");
  await choose(page, "you", "jinx", "Jinx");
  await choose(page, "ally", "lulu", "Lulu");
  await expect(page).toHaveURL(/\?role=adc&champion=Jinx&ally=Lulu&vs=Caitlyn&vs2=Lux$/);
  // Both enemies' kits, your duo folded, Riot's tips quoted and attributed, the evidence not collected said as such.
  await expect(page.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", "Caitlyn");
  await expect(page.getByTestId("matchup-enemy2-abilities")).toHaveAttribute("data-champion", "Lux");
  await expect(page.getByTestId("matchup-full-reference")).not.toHaveAttribute("open", "");
  await expect(page.getByTestId("matchup-your-abilities")).not.toHaveAttribute("open", "");
  await expect(page.getByTestId("matchup-ally-abilities")).not.toHaveAttribute("open", "");
  // The lane plan quotes Riot's first tip against each enemy, attributed; the rest are in the full reference.
  await expect(page.getByTestId("assembled-riot-tip")).toHaveCount(2);
  await expect(page.getByTestId("assembled-riot-tip").first().getByTestId("riot-tips-label")).toHaveText("Riot's tip (may predate later changes)");
  await page.getByTestId("matchup-full-reference-summary").click();
  const tips = page.getByTestId("matchup-riot-tips");
  await expect(tips.getByTestId("riot-tips-label")).toHaveText("Riot's tip (may predate later changes)");
  await tips.getByTestId("matchup-riot-tips-summary").click();
  await expect(tips.getByTestId("riot-tips-enemy").first()).toContainText("Against Caitlyn");
  await expect(tips.getByTestId("riot-tip-text").first()).toHaveText("Keep behind allied minions if Caitlyn is harassing you with Piltover Peacemaker (it deals less damage with each subsequent target).");
  // The evidence from the team's games (S7b), in the tips' fold: its tiers in the fold's line, each section's honest line
  // (the demo's games are on earlier patches than the current one, so nothing is counted), the
  // pairwise slots all chosen, then what the page has not collected.
  const evidence = tips.getByTestId("matchup-evidence-panel");
  await expect(tips.getByTestId("matchup-evidence-tiers")).toHaveText(/^In your games(: no player profile| \(n = \d+\)) · In the team's games( \(n = \d+\)|: not part of this access)$/);
  await expect(evidence.getByTestId("evidence-team").getByTestId("evidence-empty")).toHaveText("In the team's games: none as Jinx with Lulu against Caitlyn and Lux on patch 26.22.");
  await expect(evidence.getByTestId("evidence-ignored")).toHaveCount(0);
  await expect(evidence.getByTestId("matchup-uncertain")).toHaveText("Matchup uncertain: no curated notes and no counted games for this pair, so each champion's own facts follow");
  await expect(evidence.getByTestId("matchup-evidence-high-elo")).toHaveText("Runes, items and skill order: No high-elo evidence (not collected)");
  await expect(evidence.getByTestId("matchup-evidence-duo")).toHaveText("No curated notes for this 2v2");
  // The plan's honest fallbacks (PLAN §4), beside the high-elo line and nowhere else on the page:
  // power spikes not measured yet, and no wave guidance (Riot's records hold no wave state).
  await expect(evidence.getByTestId("matchup-evidence").locator(":scope > li")).toHaveText([
    "Runes, items and skill order: No high-elo evidence (not collected)",
    "Power spikes: Not measured yet",
    "No wave guidance for this matchup",
    "No curated notes for this 2v2",
  ]);
  await expect(page.getByText(/power spike|wave/i)).toHaveCount(2);
  // Every row states its tier: Riot's data on each strip.
  await expect(page.getByTestId("matchup-enemy-abilities").getByTestId("evidence-tier").locator("visible=true")).toHaveText("Riot's data");
  // Where each strip's abilities come from: one step away in a fold at every width (the line, two or
  // three lines of small type over the strip, is the noise the redesign took away), its tier in view.
  // The second enemy's strip is folded (the UX review of Release 13): opened, the same.
  await page.getByTestId("matchup-enemy2-abilities-summary").click();
  for (const k of ["matchup-enemy-abilities", "matchup-enemy2-abilities"]) {
    await expect(page.getByTestId(k).getByTestId("abilities-source")).toBeHidden();
    await expect(page.getByTestId(`${k}-sources`)).toBeVisible();
  }
  await expect(page.getByTestId("matchup-ally-abilities").getByTestId("your-abilities-source"))[info.project.name === "desktop" ? "toBeHidden" : "toBeVisible"]();
  // Support: seen from the support's side; the swap trades both duos.
  await role("Support").click();
  await expect(page).toHaveURL(/\?role=support&champion=Jinx&ally=Lulu&vs=Caitlyn&vs2=Lux$/);
  await expect(page.getByTestId("matchup-pick-you-label")).toHaveText("Your support");
  await page.getByTestId("matchup-swap").click();
  await expect(page).toHaveURL(/\?role=support&champion=Caitlyn&ally=Lux&vs=Jinx&vs2=Lulu$/);

  // The haste: Riot's general rule on a Riot number (Darius's Q, 9 s at rank 1, at 20 haste: 7.5 s),
  // a checked open question kept at its base (Death's Grasp), and nothing at 0.
  await page.goto("/resources/matchups?role=top&champion=Riven&vs=Darius");
  await hydrated(page);
  await page.getByTestId("matchup-full-reference-summary").click();
  // A solo lane: the same two fallbacks, in the same list, and nowhere else.
  await expect(page.getByTestId("matchup-evidence").locator(":scope > li")).toHaveText(["Runes, items and skill order: No high-elo evidence (not collected)", "Power spikes: Not measured yet", "No wave guidance for this matchup"]);
  await expect(page.getByText(/power spike|wave/i)).toHaveCount(2);
  const q = page.getByTestId("matchup-enemy-abilities").locator('[data-testid="ability-row"][data-slot="Q"]');
  await expect(q.getByTestId("ability-haste")).toHaveCount(0);
  await page.getByTestId("matchup-haste").getByRole("button", { name: "20", exact: true }).click();
  await expect(q.getByTestId("ability-haste-value")).toHaveText(/^7\.5 \/ /);
  await expect(q.getByTestId("ability-haste-mark")).toHaveText(" · Riot's general rule");
  await expect(page.getByTestId("matchup-enemy-abilities").locator('[data-slot="R"]').getByTestId("ability-haste-mark")).toHaveText(" · Riot's general rule · ability haste only");
  await page.goto("/resources/matchups?role=top&champion=Riven&vs=Mordekaiser");
  const e = page.getByTestId("matchup-enemy-abilities").locator('[data-testid="ability-row"][data-slot="E"]');
  // The haste chosen is remembered on this device.
  await expect(e.getByTestId("ability-haste")).toHaveAttribute("data-mark", "unknown");
  await expect(e.getByTestId("ability-haste-value")).toHaveText("16 / 14 / 12 / 10 / 8 s");
  await expect(e.getByTestId("ability-haste-mark")).toHaveText(" · Whether haste shortens it isn't known");
  // Never a timer: no "ready at" anywhere.
  await expect(page.getByTestId("matchup-dashboard")).not.toContainText(/ready at|ready in/i);

  // An old link with no role opens in the lane this device used last (Support, above).
  await page.goto("/resources/matchups?champion=Jinx&vs=Caitlyn");
  await expect(page).toHaveURL(/\?role=support&champion=Jinx&vs=Caitlyn$/);

  // Copy link: the address with the lineup (the clipboard, where there is no share sheet).
  if (info.project.name === "desktop") {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByTestId("matchup-copy-link").click();
    await expect(page.getByTestId("matchup-copy-link")).toHaveAccessibleName("Link copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/resources\/matchups\?role=support&champion=Jinx&vs=Caitlyn$/);
  }
});

test("the parts in the order they are read and tabbed through, as seen: the lane plan, the enemy's strip, the sources and notices, then the full reference", async ({ page }) => {
  await openMatchupIntel(page, "Riven", "Mordekaiser");
  await hydrated(page);
  const order = await page.evaluate(() => {
    const parts = ["matchup-briefing", "matchup-enemy-abilities", "matchup-footer", "matchup-full-reference"].map((id) => document.querySelector(`[data-testid="${id}"]`)!);
    const dom = [...parts].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)).map((e) => e.getAttribute("data-testid"));
    const seen = [...parts].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map((e) => e.getAttribute("data-testid"));
    return { dom, seen };
  });
  expect(order.seen).toEqual(["matchup-briefing", "matchup-enemy-abilities", "matchup-footer", "matchup-full-reference"]);
  expect(order.dom).toEqual(order.seen);
});

test("checked three patches ago: the briefing hidden and said, the lane reference in its place and whole on the screen at 1440×900, the strip starting there", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop sizes");
  await localPictures(page);
  await riotText(page, "off");
  await notesAge(page, 3);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openMatchupIntel(page, "Riven", "Mordekaiser");
  await hydrated(page);
  await expect(page.getByTestId("briefing-expired")).toContainText("three patches ago");
  await expect(page.getByTestId("matchup-dashboard")).toHaveAttribute("data-layer", "assembled");
  await expect(enemyAbilities(page)).toHaveCount(5);
  const at = await page.evaluate(readMatchupIntel);
  expect(at.expired).toBe(true);
  expect(at.planBottom ?? Infinity, "the lane reference whole on the screen").toBeLessThanOrEqual(at.innerHeight);
  const stripTop = await page.getByTestId("matchup-enemy-abilities").evaluate((e) => e.getBoundingClientRect().top);
  expect(stripTop, "the strip starts on the screen").toBeLessThanOrEqual(at.innerHeight);
});
