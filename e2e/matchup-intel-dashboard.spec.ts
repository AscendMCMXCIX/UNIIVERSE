import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "./test";
import { choose, enemyAbilities, hydrated, localPictures, openMatchupIntel } from "./matchup-intel";

/*
  MATCHUP INTEL as a single-screen dashboard (docs/MATCHUP_INTEL.md, "The dashboard"; the owner's
  request of 18 Nov 2026), on the in-memory demo pinned to Data Dragon 16.22.1:
  - on a desktop the whole overview fits one viewport, with no page scroll either way, at 1920 by
    1080, 2560 by 1440, a maximised 1920 by 950 window, 3440 by 1440 and 1440 by 900, for the
    curated pairs (the longest briefing among them), pairs with checked notes on both sides but no
    curated file, pairs assembled from facts, a pair where neither side has checked notes, and the
    most complex kits; its text no smaller than the app's text-xs, the cooldowns larger, nothing
    scrolling inside it;
  - every pair gives a meaningful reference, labelled for what it is (a sweep of many pairs);
  - switching is a navigation: deep links, reloads, Back and Forward keep the pair;
  - each chip opens what it rests on, each tile's details open in a window.
  The text-size and phone guarantees of the page are in e2e/matchup-intel.spec.ts.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

/** The desktop sizes the overview must fit at 100% zoom (a maximised 1920 by 1080 window leaves about 1920 by 950). */
const SIZES: Array<[number, number]> = [
  [1920, 1080],
  [2560, 1440],
  [1920, 950],
  [3440, 1440],
  [1440, 900],
];

/**
 * The pairs measured: the three curated pairs (Riven vs Mordekaiser holds the longest briefing),
 * checked notes on both sides with no curated file (Riven vs Renekton), the curated pairs the other
 * way round (an assembled reference of two checked kits beside their level notes: Ornn vs Gwen is
 * the tallest), assembled pairs, the complex kits (two forms, a weapon wheel, a transformation, a
 * dismount, five spells in one slot), and a pair where neither side has checked notes (Garen vs Darius).
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
  ["Garen", "Darius"],
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
        interactions: box('[data-testid="matchup-interactions"]'),
        levels: box('[data-testid="matchup-level-notes"]'),
        yours: box('[data-testid="matchup-your-abilities"]'),
        sources: box('[data-testid="matchup-sources-summary"]'),
      },
      // Running text, in rem of the page's own root: the curated words, the notes, the grouped facts' lines.
      body: sizes('[data-testid="briefing-threat"] > div > span, [data-testid="briefing-opportunity"] > div > span, [data-testid="briefing-lane-point"], [data-testid="matchup-interaction"], [data-testid="matchup-level-note"] p, [data-testid="assembled-cooldown"], [data-testid="ability-name"], [data-testid="assembled-no-facts"], [data-testid="assembled-none"]'),
      // The key figures: each tile's cooldown numbers (a line with no number is words, said in text-sm).
      figures: sizes('[data-testid="ability-cooldown"] .tabular-nums'),
      scrollers: scrollers.map((e) => e.getAttribute("data-testid") ?? e.tagName.toLowerCase()),
    };
  });
}

test("the whole overview fits one desktop screen, with no page scroll, at 1920×1080, 2560×1440, 1920×950, 3440×1440 and 1440×900, every test pair; text at least text-xs, the cooldowns larger", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop sizes");
  test.setTimeout(600_000);
  await localPictures(page);
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    for (const [you, enemy] of FIT_PAIRS) {
      await openMatchupIntel(page, you, enemy);
      await hydrated(page);
      await expect(enemyAbilities(page)).toHaveCount(5);
      const m = await measure(page);
      const at = `${you} vs ${enemy} at ${width}×${height}`;
      expect.soft(m.scrollHeight, `${at}: no vertical page scroll`).toBeLessThanOrEqual(m.innerHeight);
      expect.soft(m.scrollWidth, `${at}: no sideways page scroll`).toBeLessThanOrEqual(m.clientWidth);
      for (const [part, b] of Object.entries(m.parts)) {
        expect.soft(b, `${at}: ${part} is on the page`).not.toBeNull();
        if (b) expect.soft(b.bottom, `${at}: ${part} inside the screen`).toBeLessThanOrEqual(m.innerHeight + 0.5);
      }
      expect.soft(m.scrollers, `${at}: nothing scrolls inside the page`).toEqual([]);
      expect.soft(Math.min(...m.body), `${at}: running text at least text-xs (0.75rem)`).toBeGreaterThanOrEqual(0.75 - 0.001);
      expect.soft(Math.min(...m.figures), `${at}: the cooldowns larger (text-md, 0.9375rem)`).toBeGreaterThanOrEqual(0.9375 - 0.001);
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
  }
  expect(errors).toEqual([]);
});

test("switching is a navigation: the pair is in the address, a deep link and a reload keep it, Back and Forward step through the pairs", async ({ page }) => {
  await openMatchupIntel(page, "Riven", "Mordekaiser");
  await hydrated(page);
  await expect(page.getByTestId("matchup-dashboard")).toHaveAttribute("data-layer", "curated");
  await choose(page, "enemy", "darius", "Darius");
  await expect(page).toHaveURL(/\?champion=Riven&vs=Darius$/);
  await expect(page.getByTestId("matchup-dashboard")).toHaveAttribute("data-layer", "assembled");
  await expect(page.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", "Darius");
  // The swap trades the sides, in the address too.
  await page.getByTestId("matchup-swap").click();
  await expect(page).toHaveURL(/\?champion=Darius&vs=Riven$/);
  await expect(page.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", "Riven");
  // A reload keeps the pair the address names.
  await page.reload();
  await expect(page.getByTestId("matchup-pick-you")).toHaveAttribute("data-champion", "Darius");
  await expect(page.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", "Riven");
  // Back and Forward, where the browser keeps each pair as an entry (the Navigation API; without it
  // each pair replaces the entry, as e2e/matchup-intel.spec.ts checks).
  if (await page.evaluate(() => "navigation" in window)) {
    await page.goBack();
    await expect(page).toHaveURL(/\?champion=Riven&vs=Darius$/);
    await expect(page.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", "Darius");
    await page.goBack();
    await expect(page).toHaveURL(/\?champion=Riven&vs=Mordekaiser$/);
    await expect(page.getByTestId("matchup-dashboard")).toHaveAttribute("data-layer", "curated");
    await page.goForward();
    await expect(page).toHaveURL(/\?champion=Riven&vs=Darius$/);
    await expect(page.getByTestId("matchup-enemy-abilities")).toHaveAttribute("data-champion", "Darius");
  }
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
  await expect(chip).toHaveAccessibleDescription(/Checked notes · Source: League of Legends Wiki: /);
  await chip.hover();
  await expect(page.getByTestId("fact-chip-bubble")).toBeVisible();
  await expect(page.getByTestId("fact-chip-bubble")).toContainText("Source: League of Legends Wiki:");
  // Wherever facts from Riot's text are shown, each chip quotes the clause and says how it was reviewed.
  await openMatchupIntel(page, "Riven", "Darius");
  await hydrated(page);
  const riotText = page.locator('[data-testid="ability-facts"][data-from="riot-text"] [data-testid="fact-chip"]');
  if (await riotText.count()) {
    await expect(riotText.first()).toHaveAccessibleDescription(/“.+” \(Riot's (tooltip|description) (for|of) .+\)\s*From Riot's ability text, reviewed automatically \(not by a person\)\./);
  } else {
    // No reviewed facts committed for Darius: his panel says so in words.
    await expect(page.getByTestId("matchup-no-facts")).toHaveText("No reviewed facts for Darius yet: crowd control, mobility, defence and sustain are not recorded.");
  }
});
