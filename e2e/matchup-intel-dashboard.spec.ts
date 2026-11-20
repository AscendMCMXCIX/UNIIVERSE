import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "./test";
import { E2E_DDRAGON_VERSION } from "./ddragon-version";
import { changedAbilities, choose, enemyAbilities, hydrated, localPictures, notesAge, openMatchupIntel, riotText } from "./matchup-intel";
import { briefingState, matchupIntelVerdicts, readMatchupIntel } from "../scripts/matchup-intel-facts.mjs";
import { patchFromVersion, publicPatchName } from "../src/domain/patch";
import { notRecheckedWords } from "../src/components/matchup-intel/wording";

/*
  MATCHUP INTEL as a single-screen dashboard (docs/MATCHUP_INTEL.md, "The dashboard"; the owner's
  request of 18 Nov 2026), on the in-memory demo pinned to Data Dragon 16.22.1:
  - on a desktop the whole overview fits one viewport, with no page scroll either way, at 1920 by
    1080, 2560 by 1440, a maximised 1920 by 950 window, 3440 by 1440 and 1440 by 900, for the
    curated pairs (the longest briefing among them), pairs with checked notes on both sides but no
    curated file, pairs assembled from facts, a pair where neither side has checked notes, the
    most complex kits and the tallest pages of the sweep (at 1440 by 900 and 1280 by 800, sizes not
    promised, the essentials on the first screen: ESSENTIALS_ONLY); its text no smaller
    than the app's text-xs, the cooldowns larger, nothing scrolling inside it;
  - every pair gives a meaningful reference, labelled for what it is (a sweep of many pairs);
  - switching is a navigation: deep links, reloads, Back and Forward keep the pair;
  - each chip opens what it rests on, each tile's details open in a window;
  - the facts from Riot's text on the real data: a qualifier on its chip (Gnar's W, "Mega Gnar"), the
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

/** The desktop sizes the overview must fit at 100% zoom (a maximised 1920 by 1080 window leaves about 1920 by 950), and the two where only its essentials must be on the first screen (ESSENTIALS_ONLY). */
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
      if (!e) return null;
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
        main: box('[data-testid="matchup-briefing"]') ?? box('[data-testid="matchup-assembled"]'),
        tiles: box('[data-testid="matchup-enemy-abilities"]'),
        // The enemy's cooldown lines, P to R: the lowest one's box.
        cooldowns: (() => {
          const lines = [...document.querySelectorAll('[data-testid="matchup-enemy-abilities"] [data-testid="ability-cooldown"]')].filter((e) => e.getClientRects().length);
          return lines.length ? { top: Math.min(...lines.map((e) => e.getBoundingClientRect().top)), bottom: Math.max(...lines.map((e) => e.getBoundingClientRect().bottom)), left: 0, right: 0 } : null;
        })(),
        interactions: box('[data-testid="matchup-interactions"]'),
        levels: box('[data-testid="matchup-level-notes"]'),
        yours: box('[data-testid="matchup-your-abilities"]'),
        sources: box('[data-testid="matchup-sources-summary"]'),
      },
      // Running text, in rem of the page's own root: the curated words, the notes, the grouped facts' lines.
      body: sizes('[data-testid="briefing-threat"] > div > span, [data-testid="briefing-opportunity"] > div > span, [data-testid="briefing-lane-point"], [data-testid="matchup-interaction"], [data-testid="matchup-level-note"] p, [data-testid="assembled-cooldown"], [data-testid="ability-name"], [data-testid="assembled-no-facts"], [data-testid="assembled-none"], [data-testid="fact-chip-markers"], [data-testid="ability-facts-none"], [data-testid^="fact-chip"] span, [data-testid^="assembled-chip"] span'),
      // The key figures: each tile's cooldown numbers (a line with no number is words, said in text-sm).
      figures: sizes('[data-testid="ability-cooldown"] .tabular-nums'),
      scrollers: scrollers.map((e) => e.getAttribute("data-testid") ?? e.tagName.toLowerCase()),
    };
  });
}

/**
 * 1440 by 900 and 1280 by 800 (the sidebar open, as it opens) are no sizes the overview is promised
 * to fit (docs/MATCHUP_INTEL.md, "The dashboard"; the overhaul's S7 acceptance): there the
 * essentials must be on the first screen, the bar with the slots, the lane and the haste, the
 * enemy's five tiles with their cooldowns (at 1280 their cooldown lines: R's had gone under the
 * fold there behind a header three lines tall, R6 review BX5), and the start of the main panel,
 * with nothing cut or scrolling inside the page; the rest may follow under the fold.
 */
const ESSENTIALS_ONLY: Record<number, "tiles" | "cooldowns"> = { 1440: "tiles", 1280: "cooldowns" };

test("the whole overview fits one desktop screen, with no page scroll, at 1920×1080, 2560×1440, 1920×950 and 3440×1440, every test pair, and at 1440×900 and 1280×800 the essentials on the first screen; text at least text-xs, the cooldowns larger", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop sizes");
  test.setTimeout(900_000);
  await localPictures(page);
  // Each pair loaded once and measured at every size, the window resized as a person's would be.
  for (const [you, enemy] of FIT_PAIRS) {
    await page.setViewportSize({ width: SIZES[0]![0], height: SIZES[0]![1] });
    await openMatchupIntel(page, you, enemy);
    await hydrated(page);
    await expect(enemyAbilities(page)).toHaveCount(5);
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const m = await measure(page);
      const at = `${you} vs ${enemy} at ${width}×${height}`;
      const essentials = ESSENTIALS_ONLY[width];
      if (essentials) {
        expect.soft(m.parts.bar?.bottom ?? Infinity, `${at}: the bar on the screen`).toBeLessThanOrEqual(m.innerHeight + 0.5);
        if (essentials === "tiles") expect.soft(m.parts.tiles?.bottom ?? Infinity, `${at}: the five tiles on the screen`).toBeLessThanOrEqual(m.innerHeight + 0.5);
        else expect.soft(m.parts.cooldowns?.bottom ?? Infinity, `${at}: every enemy cooldown line on the screen`).toBeLessThanOrEqual(m.innerHeight + 0.5);
        expect.soft(m.parts.main?.top ?? Infinity, `${at}: the main panel starts on the screen`).toBeLessThanOrEqual(m.innerHeight / 2);
      } else {
        expect.soft(m.scrollHeight, `${at}: no vertical page scroll`).toBeLessThanOrEqual(m.innerHeight);
        for (const [part, b] of Object.entries(m.parts)) {
          expect.soft(b, `${at}: ${part} is on the page`).not.toBeNull();
          if (b) expect.soft(b.bottom, `${at}: ${part} inside the screen`).toBeLessThanOrEqual(m.innerHeight + 0.5);
        }
      }
      expect.soft(m.scrollWidth, `${at}: no sideways page scroll`).toBeLessThanOrEqual(m.clientWidth);
      expect.soft(m.scrollers, `${at}: nothing scrolls inside the page`).toEqual([]);
      expect.soft(Math.min(...m.body), `${at}: running text at least text-xs (0.75rem)`).toBeGreaterThanOrEqual(0.75 - 0.001);
      expect.soft(Math.min(...m.figures), `${at}: the cooldowns larger (text-md, 0.9375rem)`).toBeGreaterThanOrEqual(0.9375 - 0.001);
    }
  }
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

test("a patch after the curated notes' check, as production is until they are re-checked (Release 6's Production check): each check says it is not re-checked, and the Production check's fit facts hold, the essentials on the first screen at 1440×900 and 1280×800, no page scroll at 1920×1080 and 1920×950", async ({ page }, info) => {
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
    // The Production check's own fit facts (scripts/matchup-intel-facts.mjs), judged as it judges them.
    const fits = matchupIntelVerdicts({ kind: "desktop", pair, enemy, at, wide, wiki: [] }).filter((v) => /^desktop: (1920 × 1080|1440 × 900): /.test(v.name));
    expect(fits, pair).toHaveLength(2);
    for (const v of fits) expect.soft(v.status, `${pair}: ${v.name} ${JSON.stringify(v.detail)}`).toBe("PASS");
    // 1280 x 800 (the sidebar open), as ESSENTIALS_ONLY: the bar, every enemy cooldown line, the main panel's start.
    await page.setViewportSize({ width: 1280, height: 800 });
    await frames();
    const small = await measure(page);
    expect.soft(small.parts.bar?.bottom ?? Infinity, `${pair} at 1280×800: the bar on the screen`).toBeLessThanOrEqual(small.innerHeight + 0.5);
    expect.soft(small.parts.cooldowns?.bottom ?? Infinity, `${pair} at 1280×800: every enemy cooldown line on the screen`).toBeLessThanOrEqual(small.innerHeight + 0.5);
    expect.soft(small.parts.main?.top ?? Infinity, `${pair} at 1280×800: the main panel starts on the screen`).toBeLessThanOrEqual(small.innerHeight / 2);
    // A maximised 1920 x 1080 window: still one screen.
    await page.setViewportSize({ width: 1920, height: 950 });
    await frames();
    const maximised = await measure(page);
    expect.soft(maximised.scrollHeight, `${pair} at 1920×950: no vertical page scroll`).toBeLessThanOrEqual(maximised.innerHeight);
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

test("an ability Riot changed after the curated check, on the Production check's pair: its fit facts hold at 1440×900 (judged as when nothing is hidden), every enemy cooldown line on the screen at 1280×800, no page scroll at 1920×1080; an enemy ability changed: its tiles on the screen at 1440×900, no page scroll at 1920×1080", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop sizes");
  test.setTimeout(300_000);
  await localPictures(page);
  await riotText(page, "off");
  await notesAge(page, 1);
  const [you, enemy] = ["Riven", "Mordekaiser"];
  const frames = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
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
    await frames();
    const at = await page.evaluate(readMatchupIntel);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await frames();
    const wide = await page.evaluate(readMatchupIntel);
    if (own) {
      // The Production check judges the fit only while nothing is hidden: judged here as then.
      const fits = matchupIntelVerdicts({ kind: "desktop", pair, enemy, at: { ...at, hiddenParts: 0 }, wide: { ...wide, hiddenParts: 0 }, wiki: [] }).filter((v) => /^desktop: (1920 × 1080|1440 × 900): /.test(v.name));
      expect(fits, pair).toHaveLength(2);
      for (const v of fits) expect.soft(v.status, `${pair}: ${v.name} ${JSON.stringify(v.detail)}`).toBe("PASS");
      await page.setViewportSize({ width: 1280, height: 800 });
      await frames();
      const small = await measure(page);
      expect.soft(small.parts.cooldowns?.bottom ?? Infinity, `${pair} at 1280×800: every enemy cooldown line on the screen`).toBeLessThanOrEqual(small.innerHeight + 0.5);
      expect.soft(small.parts.main?.top ?? Infinity, `${pair} at 1280×800: the main panel starts on the screen`).toBeLessThanOrEqual(small.innerHeight / 2);
    } else {
      expect.soft(at.tilesBottom, `${pair} at 1440×900: the enemy's five tiles on the screen`).toBeLessThanOrEqual(at.innerHeight);
      expect.soft(wide.scrollHeight, `${pair} at 1920×1080: no page scroll`).toBeLessThanOrEqual(wide.innerHeight);
    }
  }
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
        else await expect(side.getByTestId("assembled-group"), at).toHaveCount(5);
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
    if (riot.label) for (const n of riot.none) expect(n, at).toBe("No reviewed facts for this ability");
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
  await expect(gnarW).toContainText("Stun · “Mega Gnar”");
  await expect(gnarW).toHaveAccessibleDescription("“stunning enemies in an area.” (Riot's description of Hyper / Wallop) Riot adds “Mega Gnar” From Riot's ability text, reviewed automatically (not by a person).");
  // The assembled reference shows the same chip in its group.
  await expect(page.getByTestId("assembled-danger").getByTestId("assembled-chip").filter({ hasText: "Mega Gnar" })).toHaveCount(2);
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
  await expect(tileOf(page, "P").getByTestId("fact-chip")).toContainText("Cooldown refund of “Mantra”");
  // Kog'Maw, one fact: every other ability says it has no reviewed fact, every empty group the same, never "none".
  await openMatchupIntel(page, "Riven", "KogMaw");
  await hydrated(page);
  await expect(page.getByTestId("matchup-enemy-abilities").getByTestId("fact-chip")).toHaveCount(1);
  await expect(page.getByTestId("matchup-enemy-abilities").getByTestId("ability-facts-none")).toHaveText(Array(4).fill("No reviewed facts for this ability"));
  await expect(page.getByTestId("assembled-danger").getByTestId("assembled-none")).toHaveText(Array(4).fill("· No reviewed facts of this kind"));
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
  await expect(page.getByTestId("matchup-your-abilities")).not.toHaveAttribute("open", "");
  await expect(page.getByTestId("matchup-ally-abilities")).not.toHaveAttribute("open", "");
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
  // Every row states its tier: Riot's data on each kit.
  await expect(page.getByTestId("matchup-enemy-abilities").getByTestId("evidence-tier")).toHaveText("Riot's data");
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
