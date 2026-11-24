import { expect, test, type Page } from "./test";
import { expectNoSeriousAxe } from "./axe";

/*
  CHAMPION LOOKUP (docs/CHAMPION_LOOKUP.md; Release 16, in Matchup Intel's place): one searchable
  selector for every champion, the five abilities with their base cooldowns per rank from Riot's Data
  Dragon (the server pins 16.22.1: e2e/ddragon-version.ts), those cooldowns at a chosen ability haste
  by Riot's general rule only where Riot's data gives the cooldown, the special cases said in words,
  descriptions folded away, the champion and haste in the address, Matchup Intel's old links
  redirected, one screen on a desktop, phones at 320 and 390 with 200% text, and axe.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const isDesktop = (name: string) => name === "desktop";
const isPhone = (name: string) => name === "phone";
/** Riot's general rule as the page writes it. */
const hasted = (base: number, haste: number) => Math.round(((base * 100) / (100 + haste)) * 100) / 100;
const row = (page: Page, slot: string) => page.locator(`[data-testid="lookup-ability"][data-slot="${slot}"]`);
const values = async (page: Page, slot: string, kind: "base" | "hasted") => ((await row(page, slot).getByTestId(`lookup-${kind}`).getAttribute("data-values")) ?? "").split(",").filter(Boolean).map(Number);
/** The page's own controls answer (the toolbar marks it once the page's code runs). */
const ready = (page: Page) => expect(page.getByTestId("lookup-toolbar")).toHaveAttribute("data-ready", "true");
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test("with nothing chosen: the heading, where the data comes from, the search, All champions and the invitation", async ({ page }) => {
  await page.goto("/lookup");
  await expect(page.getByRole("heading", { level: 1, name: "Champion Lookup" })).toBeVisible();
  await expect(page.getByTestId("lookup-source")).toHaveText("Abilities and cooldowns from Riot's Data Dragon · patch 26.22");
  await expect(page.getByTestId("lookup-search-input")).toBeVisible();
  await expect(page.getByTestId("lookup-browse")).toBeVisible();
  await expect(page.getByTestId("lookup-empty")).toContainText("Choose a champion");
  // No Descriptions toggle and no haste without a champion.
  await expect(page.getByTestId("lookup-descriptions")).toHaveCount(0);
  await expect(page.getByTestId("lookup-haste")).toHaveCount(0);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});

test("a champion: portrait and name, the source line, Passive to R with icons and names, base cooldowns per rank, and the rule", async ({ page }) => {
  await page.goto("/lookup?champion=Ahri");
  const panel = page.getByTestId("lookup-panel");
  await expect(panel).toHaveAttribute("data-champion", "Ahri");
  await expect(page.getByTestId("lookup-name")).toHaveText("Ahri");
  await expect(page.getByTestId("lookup-source")).toHaveText("Riot Data Dragon 16.22.1 · patch 26.22");
  await expect(page.getByTestId("lookup-ability")).toHaveCount(5);
  expect(await page.getByTestId("lookup-ability").evaluateAll((els) => els.map((e) => e.getAttribute("data-slot")).join(""))).toBe("PQWER");
  expect(await page.getByTestId("lookup-ability-name").allTextContents()).toEqual(["Essence Theft", "Orb of Deception", "Fox-Fire", "Charm", "Spirit Rush"]);
  // Each with Riot's icon, or its key as a plain tile where the icon cannot load (the test's network may block Data Dragon).
  for (const slot of ["P", "Q", "W", "E", "R"]) expect(await row(page, slot).locator('img, [data-testid="lookup-icon-standin"]').count(), slot).toBeGreaterThan(0);
  expect(await values(page, "Q", "base")).toEqual([7, 7, 7, 7, 7]);
  expect(await values(page, "R", "base")).toEqual([140, 120, 100]);
  // At 0 the base alone, in the main weight; no hasted line.
  await expect(page.getByTestId("lookup-hasted")).toHaveCount(0);
  await expect(page.getByTestId("lookup-haste-cut")).toHaveText("Base cooldowns");
  await expect(row(page, "P").getByTestId("lookup-no-number")).toHaveText("No cooldown in Riot's data");
  await expect(page.getByTestId("lookup-rule")).toHaveText("At a haste: base × 100 / (100 + haste), Riot's general rule, applied only where Riot's data gives the cooldown. Ultimate haste isn't counted.");
  // Screen readers hear each rank with its unit.
  await expect(row(page, "Q").getByTestId("lookup-base")).toContainText("Rank 1: 7 seconds");
  // No timer, countdown or ready time anywhere (game integrity).
  await expect(page.locator("main")).not.toContainText(/\b(timer|countdown|ready at|ready in)\b/i);
});

test("haste: every quick value gives base × 100 / (100 + haste) on every ordinary ability, in place; Other takes a typed number, held to 300; the address keeps it", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name) && !isPhone(info.project.name), "a desktop and a phone");
  await page.goto("/resources");
  await page.goto("/lookup?champion=Darius");
  await ready(page);
  const haste = page.getByTestId("lookup-haste");
  const ordinary = await page.locator('[data-testid="lookup-ability"][data-cooldown="per-rank"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-slot")!));
  expect(ordinary).toEqual(["Q", "W", "E", "R"]);
  const base: Record<string, number[]> = {};
  for (const slot of ordinary) base[slot] = await values(page, slot, "base");
  for (const h of [10, 20, 30, 40, 50, 60, 80, 100, 0]) {
    await haste.locator(`button[data-haste="${h}"]`).click();
    await expect(haste).toHaveAttribute("data-haste", String(h));
    await expect(haste.locator(`button[data-haste="${h}"]`)).toHaveAttribute("aria-pressed", "true");
    for (const slot of ordinary) {
      if (h === 0) await expect(row(page, slot).getByTestId("lookup-hasted"), `${slot} at 0`).toHaveCount(0);
      else await expect(row(page, slot).getByTestId("lookup-hasted"), `${slot} at ${h}`).toHaveAttribute("data-values", base[slot]!.map((b) => hasted(b, h)).join(","));
      // The base line never changes.
      expect(await values(page, slot, "base"), `${slot}'s base at ${h}`).toEqual(base[slot]);
    }
    await expect(page).toHaveURL(h === 0 ? /\/lookup\?champion=Darius$/ : new RegExp(`/lookup\\?champion=Darius&haste=${h}$`));
  }
  // Darius's R: 120 / 100 / 80 s is 75 / 62.5 / 50 s at 60 (the docs' example).
  await haste.locator('button[data-haste="60"]').click();
  await expect(row(page, "R").getByTestId("lookup-hasted")).toHaveAttribute("data-values", "75,62.5,50");
  await expect(page.getByTestId("lookup-haste-cut")).toHaveText("Cooldowns 37.5% shorter");
  // Other: digits only, any whole number to 300; more is held to 300 and says so.
  const other = page.getByTestId("lookup-haste-input");
  await other.fill("45");
  await expect(haste).toHaveAttribute("data-haste", "45");
  await expect(row(page, "R").getByTestId("lookup-hasted")).toHaveAttribute("data-values", [120, 100, 80].map((b) => hasted(b, 45)).join(","));
  await expect(haste.locator("button[aria-pressed=true]")).toHaveCount(0);
  await other.fill("4a5x");
  await expect(other).toHaveValue("45");
  await other.fill("999");
  await expect(haste).toHaveAttribute("data-haste", "300");
  await expect(page.getByTestId("lookup-haste-held")).toHaveText("Held to 300");
  await other.blur();
  await expect(other).toHaveValue("300");
  await expect(page).toHaveURL(/\/lookup\?champion=Darius&haste=300$/);
  // A reload keeps the champion and the haste.
  await page.reload();
  await expect(page.getByTestId("lookup-haste")).toHaveAttribute("data-haste", "300");
  await expect(page.getByTestId("lookup-haste-input")).toHaveValue("300");
  // Haste changes added no history entry: Back leaves Champion Lookup in one step.
  await page.goBack();
  await expect(page).toHaveURL(/\/resources$/);
});

test("special cooldowns are said in words, never computed: the passive, charges, two abilities in a slot, a known-wrong number, no number", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "the words are the same at every width");
  const cases: Array<[string, string, string, RegExp | null]> = [
    ["Teemo", "R", "Charges: recharge not in Riot's data", /Riot's number is the wait between casts, not the time to regain a charge\./],
    ["LeeSin", "Q", "Two abilities share this slot in Riot's data", /Riot's data doesn't say which one its cooldown is\. Riot lists 10 \/ 9 \/ 8 \/ 7 \/ 6 s for the slot\./],
    ["Rengar", "Q", "Riot's number for this ability is known to be wrong", null],
    ["Ashe", "Q", "No cooldown number in Riot's data", null],
    ["Aphelios", "Q", "Several abilities share this slot in Riot's data", null],
    ["Zoe", "W", "This slot casts spells picked up in a game", null],
    ["Corki", "R", "Charges: recharge not in Riot's data", null],
  ];
  for (const [champion, slot, line, more] of cases) {
    await page.goto(`/lookup?champion=${champion}&haste=40`);
    const r = row(page, slot);
    await expect(r.getByTestId("lookup-no-number"), `${champion} ${slot}`).toHaveText(`${line} · no haste applied`);
    if (more) await expect(r, `${champion} ${slot}`).toContainText(more);
    // No number is made up and no haste applied: neither line is drawn.
    await expect(r.getByTestId("lookup-base"), `${champion} ${slot}`).toHaveCount(0);
    await expect(r.getByTestId("lookup-hasted"), `${champion} ${slot}`).toHaveCount(0);
    await expect(row(page, "P").getByTestId("lookup-hasted")).toHaveCount(0);
  }
  // On the same page, an ordinary ability still gets its hasted line (Teemo's Q: 7 s at 40 haste is 5 s).
  await page.goto("/lookup?champion=Teemo&haste=40");
  await expect(row(page, "Q").getByTestId("lookup-hasted")).toHaveAttribute("data-values", (await values(page, "Q", "base")).map((b) => hasted(b, 40)).join(","));
});

test("descriptions: folded away by default, one press shows all five under their abilities, another hides them", async ({ page }) => {
  await page.goto("/lookup?champion=Ahri");
  await ready(page);
  const toggle = page.getByTestId("lookup-descriptions");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("lookup-description")).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("lookup-description")).toHaveCount(5);
  await expect(row(page, "Q").getByTestId("lookup-description")).toContainText("Ahri sends out and pulls back her orb");
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  await expectNoSeriousAxe(page, "descriptions shown");
  await toggle.click();
  await expect(page.getByTestId("lookup-description")).toHaveCount(0);
});

test("the search with the keyboard: \"/\" puts the focus in it, matches as typed (initials and nicknames too), ↑/↓ and Enter choose, Escape closes then clears", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "a keyboard and a mouse");
  await page.goto("/lookup?champion=Ahri");
  await ready(page);
  const input = page.getByTestId("lookup-search-input");
  await page.locator("main h1").click();
  await page.keyboard.press("/");
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.type("kha");
  await expect(input).toHaveAttribute("aria-expanded", "true");
  const options = page.getByTestId("lookup-search-option");
  await expect(options.first()).toHaveAttribute("data-champion", "Khazix");
  await expect(options.first()).toHaveAttribute("aria-selected", "true");
  await expectNoSeriousAxe(page, "the search's list open");
  await input.fill("j4");
  await expect(options.first()).toHaveAttribute("data-champion", "JarvanIV");
  await input.fill("tf");
  await expect(options.first()).toHaveAttribute("data-champion", "TwistedFate");
  // A short search: eight shown, the rest counted.
  await input.fill("a");
  await expect(options).toHaveCount(8);
  await expect(page.getByTestId("lookup-search-note")).toHaveText(/^\d+ more: keep typing, or open All champions\.$/);
  // ↓ marks the second, ↑ the first again; Enter takes the one marked.
  await input.fill("ka");
  const second = (await options.nth(1).getAttribute("data-champion"))!;
  await page.keyboard.press("ArrowDown");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(input).toHaveAttribute("aria-activedescendant", (await options.nth(1).getAttribute("id"))!);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("lookup-panel")).toHaveAttribute("data-champion", second);
  await expect(page).toHaveURL(new RegExp(`/lookup\\?champion=${second}$`));
  // With a mouse the field keeps the focus for the next search, emptied.
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("");
  // Escape: the list first, then what was typed.
  await page.keyboard.type("qqq");
  await expect(page.getByTestId("lookup-search-note")).toHaveText("No champion matches “qqq”.");
  await page.keyboard.press("Escape");
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await expect(input).toHaveValue("qqq");
  await page.keyboard.press("Escape");
  await expect(input).toHaveValue("");
  // A press on a match takes it.
  await input.fill("mord");
  await options.first().click();
  await expect(page.getByTestId("lookup-panel")).toHaveAttribute("data-champion", "Mordekaiser");
});

test("on a phone a tap on a match chooses and the keyboard goes down; the page is no wider than the phone", async ({ page }, info) => {
  test.skip(!isPhone(info.project.name), "the phone");
  await page.goto("/lookup");
  await ready(page);
  const input = page.getByTestId("lookup-search-input");
  expect(await input.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
  await input.tap();
  await input.fill("ahr");
  await page.getByTestId("lookup-search-option").first().tap();
  await expect(page.getByTestId("lookup-panel")).toHaveAttribute("data-champion", "Ahri");
  await expect(input).not.toBeFocused();
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  // Every haste button and the field are 44px targets.
  for (const h of await page.getByTestId("lookup-haste").locator("button, input").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))) expect(h).toBeGreaterThanOrEqual(44);
});

test("All champions: every champion on the roster, a search in the window, Enter takes the first match, a Recent row of the champions looked up, and no history entry", async ({ page }, info) => {
  test.skip(isPhone(info.project.name) ? false : !isDesktop(info.project.name), "a desktop and a phone");
  await page.goto("/resources");
  await page.goto("/lookup?champion=Ahri");
  await ready(page);
  const browse = page.getByTestId("lookup-browse");
  await browse.click();
  const win = page.getByTestId("lookup-picker");
  await expect(win).toBeVisible();
  const grid = win.getByTestId("lookup-picker-grid").locator("button[data-champion]");
  await expect(grid.first()).toBeVisible();
  // The demo's roster is Data Dragon 16.22.1's: 172 champions (173 with the newest), all there.
  const counted = Number(/·\s*(\d+)/.exec((await win.getByTestId("lookup-picker-all-title").textContent()) ?? "")?.[1]);
  expect(counted).toBeGreaterThanOrEqual(170);
  await expect(grid).toHaveCount(counted);
  // Looked up lately: Ahri, in the Recent row.
  await expect(win.getByTestId("lookup-picker-recent").locator('button[data-champion="Ahri"]')).toBeVisible();
  const search = win.getByTestId("lookup-picker-search");
  if (isPhone(info.project.name)) await search.tap();
  await search.fill("nunu");
  await expect(win.getByTestId("lookup-picker-count")).toHaveText("1 champion found");
  await search.press("Enter");
  await expect(win).toHaveCount(0);
  await expect(page.getByTestId("lookup-panel")).toHaveAttribute("data-champion", "Nunu");
  // The window gives the focus back to All champions.
  await expect(browse).toBeFocused();
  // The window and the choices made no history entry: Back leaves the page.
  await page.goBack();
  await expect(page).toHaveURL(/\/resources$/);
});

test("the address: a name in any case opens its champion and is written back as its id; a champion the roster lacks is left out, said, and not repeated back", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "once");
  await page.goto("/lookup?champion=wukong&haste=25");
  await expect(page.getByTestId("lookup-panel")).toHaveAttribute("data-champion", "MonkeyKing");
  await expect(page).toHaveURL(/\/lookup\?champion=MonkeyKing&haste=25$/);
  await expect(page.getByTestId("lookup-haste")).toHaveAttribute("data-haste", "25");
  await page.goto("/lookup?champion=%3Cb%3ENobody&haste=abc");
  await expect(page.getByTestId("lookup-unknown")).toContainText("not on the roster");
  await expect(page.locator("main")).not.toContainText("Nobody");
  await expect(page).toHaveURL(/\/lookup$/);
});

test("Matchup Intel's old links land on Champion Lookup, carrying one champion: the enemy where named", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "once");
  // One HTTP 308 from the proxy, before any page renders (no streamed client-side redirect).
  const first = await page.request.get("/resources/matchups?champion=Riven&vs=Mordekaiser", { maxRedirects: 0 });
  expect(first.status()).toBe(308);
  const to = new URL(first.headers()["location"]!, "http://x");
  expect(to.pathname + to.search).toBe("/lookup?champion=Mordekaiser");
  for (const [old, want] of [
    ["/resources/matchups?champion=Riven&vs=Mordekaiser", "/lookup?champion=Mordekaiser"],
    ["/resources/matchups?role=top&champion=Riven", "/lookup?champion=Riven"],
    ["/resources/matchups?role=adc&champion=Jinx&ally=Lulu&vs=Caitlyn&vs2=Lux&ability=Caitlyn.Q", "/lookup?champion=Caitlyn"],
    ["/resources/matchups?role=support&ally=Lulu&vs2=Lux", "/lookup?champion=Lux"],
    ["/resources/matchups", "/lookup"],
  ] as const) {
    await page.goto(old);
    await expect(page, old).toHaveURL(new RegExp(`${want.replace(/[?]/g, "\\?")}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Champion Lookup" })).toBeVisible();
  }
  await page.goto("/resources/matchups?vs=Mordekaiser");
  await expect(page.getByTestId("lookup-panel")).toHaveAttribute("data-champion", "Mordekaiser");
});

test("one screen for any champion at any haste: 1440 × 900, 1920 × 1080, and the owner's own windows, 1920 × 950 with the sidebar folded and 1440 × 780", async ({ page, context, baseURL }, info) => {
  test.skip(!isDesktop(info.project.name), "the desktop");
  // The owner's second monitor (23 Nov 2026): a 1920 × 1080 screen less the browser's bars and the
  // taskbar, the sidebar folded; and what a 1440 × 900 screen leaves the page.
  const sizes = [
    { width: 1440, height: 900, folded: false },
    { width: 1920, height: 1080, folded: false },
    { width: 1920, height: 950, folded: true },
    { width: 1920, height: 950, folded: false },
    { width: 1440, height: 780, folded: false },
    { width: 1440, height: 780, folded: true },
  ];
  for (const size of sizes) {
    await context.clearCookies({ name: "uniiverse_sidebar" });
    if (size.folded) await context.addCookies([{ name: "uniiverse_sidebar", value: "collapsed", url: baseURL! }]);
    await page.setViewportSize({ width: size.width, height: size.height });
    for (const path of ["/lookup?champion=Ahri&haste=100", "/lookup?champion=LeeSin&haste=40", "/lookup?champion=Aphelios&haste=300", "/lookup?champion=Udyr&haste=20", "/lookup?champion=Teemo&haste=55"]) {
      await page.goto(path);
      await expect(page.getByTestId("lookup-ability")).toHaveCount(5);
      const where = `${path} at ${size.width} × ${size.height}${size.folded ? ", the sidebar folded" : ""}`;
      const fit = await page.evaluate(() => ({ over: document.documentElement.scrollHeight - innerHeight, rule: document.querySelector('[data-testid="lookup-rule"]')!.getBoundingClientRect().bottom, haste: document.querySelector('[data-testid="lookup-haste"]')!.getBoundingClientRect().bottom }));
      expect(fit.over, where).toBeLessThanOrEqual(1);
      expect(fit.haste, `${where}: the haste choice on the screen`).toBeLessThanOrEqual(size.height);
      expect(fit.rule, `${where}: the five abilities and the rule's line on the screen`).toBeLessThanOrEqual(size.height);
    }
  }
});

test("the ranks never wrap: in columns each rank's value sits in its own column under its heading, on one line; in the line form each kind's ranks keep one line, from 640px to 1280px with the sidebar open and folded", async ({ page, context, baseURL }, info) => {
  test.skip(!isDesktop(info.project.name), "the desktop project, every width set here");
  // The review of Release 16 found rank 5 wrapping under rank 1 where the panel was about 36–45rem
  // wide ("9 / 5" read as Fox-Fire's rank 1): the columns now start where six ranks fit (44rem, Udyr's).
  const sizes: Array<[number, boolean]> = [[640, false], [700, false], [768, false], [834, false], [1024, false], [1024, true], [1100, false], [1280, false], [1280, true]];
  for (const [width, folded] of sizes) {
    await context.clearCookies({ name: "uniiverse_sidebar" });
    if (folded) await context.addCookies([{ name: "uniiverse_sidebar", value: "collapsed", url: baseURL! }]);
    await page.setViewportSize({ width, height: 900 });
    for (const champion of ["Ahri", "Udyr"]) {
      await page.goto(`/lookup?champion=${champion}&haste=20`);
      await expect(page.getByTestId("lookup-ability")).toHaveCount(5);
      const where = `${champion} at ${width}px${folded ? ", the sidebar folded" : ""}`;
      const m = await page.evaluate(() => {
        const heading = document.querySelector<HTMLElement>('[data-testid="lookup-abilities"] > [aria-hidden] > div')!;
        const columns = getComputedStyle(heading).display !== "none";
        const ranksOf = (el: Element) => [...el.querySelectorAll<HTMLElement>(":scope > span:not([aria-hidden])")].map((c) => c.getBoundingClientRect());
        const rows = [...document.querySelectorAll('[data-testid="lookup-ability"][data-cooldown="per-rank"]')].map((r) => {
          const base = ranksOf(r.querySelector('[data-testid="lookup-base"]')!);
          const hasted = ranksOf(r.querySelector('[data-testid="lookup-hasted"]')!);
          const oneLine = (cells: DOMRect[]) => cells.every((c) => Math.abs(c.top - cells[0]!.top) <= 2);
          const leftToRight = (cells: DOMRect[]) => cells.every((c, i) => i === 0 || c.left > cells[i - 1]!.right - 1);
          return {
            slot: r.getAttribute("data-slot"),
            ranks: base.length,
            oneLine: oneLine(base) && oneLine(hasted),
            leftToRight: leftToRight(base) && leftToRight(hasted),
            // In columns, each rank's base and hasted values share their column.
            aligned: base.every((c, i) => Math.abs(c.right - hasted[i]!.right) <= 1),
            rights: base.map((c) => Math.round(c.right)),
          };
        });
        const heads = [...heading.querySelectorAll<HTMLElement>("span.label-caps:last-child > span")].map((h) => h.getBoundingClientRect());
        return { columns, rows, headsOneLine: heads.every((h) => Math.abs(h.top - heads[0]!.top) <= 2), headRights: heads.map((h) => Math.round(h.right)) };
      });
      for (const r of m.rows) {
        expect(r.oneLine, `${where}: ${r.slot}'s ranks on one line each (${m.columns ? "columns" : "the line form"})`).toBe(true);
        expect(r.leftToRight, `${where}: ${r.slot}'s ranks left to right`).toBe(true);
        if (m.columns) {
          expect(r.aligned, `${where}: ${r.slot}'s base and hasted values in the same columns`).toBe(true);
          // Under the heading's ranks: each value's right edge at its rank's.
          r.rights.forEach((right, i) => expect(Math.abs(right - m.headRights[i]!), `${where}: ${r.slot}'s rank ${i + 1} under its heading`).toBeLessThanOrEqual(1));
        }
      }
      if (m.columns) expect(m.headsOneLine, `${where}: the heading's ranks on one line`).toBe(true);
    }
  }
});

test("phones at 320 and 390, at 100% and 200% text: nothing wider than the phone, every ability's name and cooldown whole", async ({ page }, info) => {
  test.skip(!isPhone(info.project.name), "the phone");
  for (const [width, height] of [[320, 568], [390, 844]] as const) {
    await page.setViewportSize({ width, height });
    for (const root of [100, 200]) {
      for (const path of ["/lookup?champion=Heimerdinger&haste=20", "/lookup?champion=LeeSin&haste=40"]) {
        await page.goto(path);
        await ready(page);
        await page.addStyleTag({ content: `html { font-size: ${root}% !important; }` });
        await page.evaluate(() => document.fonts.ready);
        const where = `${path} at ${width}px, ${root}%`;
        await expect.poll(() => overflow(page), { message: where }).toBeLessThanOrEqual(0);
        // No ability row reaches past the panel.
        const rows = await page.getByTestId("lookup-ability").evaluateAll((els) => els.map((e) => ({ over: e.scrollWidth - e.clientWidth })));
        expect(rows.every((r) => r.over <= 1), where).toBe(true);
      }
    }
  }
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/lookup?champion=Heimerdinger&haste=20");
  await expectNoSeriousAxe(page, "a phone");
});
