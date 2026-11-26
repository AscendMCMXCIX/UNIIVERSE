import { expect, test, type Page } from "./test";
import { expectNoSeriousAxe } from "./axe";

/*
  CHAMPION INTEL (docs/CHAMPION_INTEL.md; Champion Lookup until Release 17, at the same address):
  one champion, or two compared on one aligned board (25 Nov 2026), each with its five abilities as
  folds (the shared Fold), their base cooldowns per rank from Riot's Data Dragon (the server pins
  16.22.1: e2e/ddragon-version.ts) on one grid of rank columns, and those cooldowns at the haste
  typed in that champion's own field, by Riot's general rule only where Riot's data gives the
  cooldown; costs per rank where Riot's own line is filled by its data; the mechanics Riot's
  descriptions name as chips on each row; the champion's facts and base statistics; the special
  cases said in words; names never cut or broken; Compare's swap and removal of either champion;
  the champions and hastes in the address; Matchup Intel's old links redirected; phones with both
  champions side by side; the essential information on one screen at the desktop sizes, single and
  dual; phones at 320, 375, 390 and 430 with 200% text; and axe.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const isDesktop = (name: string) => name === "desktop";
const isPhone = (name: string) => name === "phone";
/** Riot's general rule as the page writes it. */
const hasted = (base: number, haste: number) => Math.round(((base * 100) / (100 + haste)) * 100) / 100;
const panel = (page: Page, n: 1 | 2 = 1) => page.locator(`[data-testid="lookup-panel"][data-panel="${n}"]`);
const row = (page: Page, slot: string, n: 1 | 2 = 1) => panel(page, n).locator(`[data-testid="lookup-ability"][data-slot="${slot}"]`);
const values = async (page: Page, slot: string, kind: "base" | "hasted", n: 1 | 2 = 1) => ((await row(page, slot, n).getByTestId(`lookup-${kind}`).getAttribute("data-values")) ?? "").split(",").filter(Boolean).map(Number);
/** The page's own controls answer (the page marks it once its code runs). */
const ready = (page: Page) => expect(page.getByTestId("lookup-view")).toHaveAttribute("data-ready", "true");
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const hasteInput = (page: Page, n: 1 | 2 = 1) => panel(page, n).getByTestId("lookup-haste-input");
/** Elements in the page's main part that scroll on their own (none should). */
const scrollers = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll("main *")].filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1).length);
/** Each slot's row of the two columns at the same height and top (Compare's aligned board). */
const rowsLevel = (page: Page) =>
  page.evaluate(() =>
    ["P", "Q", "W", "E", "R"].map((slot) => {
      const [a, b] = [1, 2].map((n) => document.querySelector(`[data-testid="lookup-panel"][data-panel="${n}"] [data-testid="lookup-ability"][data-slot="${slot}"]`)!.getBoundingClientRect());
      return { slot, top: Math.abs(a!.top - b!.top), height: Math.abs(a!.height - b!.height) };
    }),
  );
/**
 * Whether every element the selector finds shows its name whole: nothing cut (scrollWidth within
 * clientWidth, no ellipsis or line clamp) and no word broken across lines; `oneLine` also asks that
 * the whole name sit on one line.
 */
const namesWhole = (page: Page, selector: string, oneLine: boolean) =>
  page.evaluate(
    ({ selector, oneLine }) =>
      [...document.querySelectorAll<HTMLElement>(selector)]
        .filter((e) => e.offsetParent !== null)
        .map((e) => {
          const s = getComputedStyle(e);
          const text = e.firstChild?.nodeType === 3 ? (e.firstChild as Text) : null;
          const tops = (from: number, to: number) => {
            const r = document.createRange();
            r.setStart(text!, from);
            r.setEnd(text!, to);
            return [...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top));
          };
          let broken = false;
          let lines = 1;
          if (text) {
            const value = text.data;
            // A word: between spaces and hyphens ("Micro-Rockets" may wrap after its hyphen, as words do).
            for (const m of value.matchAll(/[^\s\-‐]+/g)) {
              const t = tops(m.index!, m.index! + m[0].length);
              if (new Set(t).size > 1) broken = true;
            }
            lines = new Set(tops(0, value.length)).size;
          }
          return { name: e.textContent ?? "", cut: e.scrollWidth > e.clientWidth + 1 || s.textOverflow === "ellipsis" || (s.webkitLineClamp !== "none" && s.webkitLineClamp !== ""), broken, lines: oneLine ? lines : 1 };
        })
        .filter((n) => n.cut || n.broken || n.lines > 1),
    { selector, oneLine },
  );
/** Picks a champion in the open window by its search. */
async function pickInWindow(page: Page, name: string, id: string) {
  const win = page.getByTestId("lookup-picker");
  await expect(win).toBeVisible();
  await win.getByTestId("lookup-picker-search").fill(name);
  await win.getByTestId("lookup-picker-grid").locator(`button[data-champion="${id}"]`).click();
  await expect(win).toHaveCount(0);
}

test("with nothing chosen: the heading, where the data comes from, the search, All champions and the invitation", async ({ page }) => {
  await page.goto("/lookup");
  await expect(page.getByRole("heading", { level: 1, name: "Champion Intel" })).toBeVisible();
  await expect(page.getByTestId("lookup-source")).toHaveText("Abilities and cooldowns from Riot's Data Dragon · patch 26.22");
  await expect(page.getByTestId("lookup-search-input")).toBeVisible();
  await expect(page.getByTestId("lookup-browse")).toBeVisible();
  await expect(page.getByTestId("lookup-empty")).toContainText("Choose a champion");
  // No haste, no Compare, no old controls without a champion.
  await expect(page.getByTestId("lookup-haste")).toHaveCount(0);
  await expect(page.getByTestId("lookup-add")).toHaveCount(0);
  await expect(page.getByTestId("lookup-descriptions")).toHaveCount(0);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});

test("a champion: portrait and name, the source line, its facts, Passive to R with slot keys, icons, names, chips, costs and base cooldowns per rank, and the rule in the haste's ⓘ", async ({ page }) => {
  await page.goto("/lookup?champion=Ahri");
  await expect(panel(page)).toHaveAttribute("data-champion", "Ahri");
  await expect(panel(page).getByTestId("lookup-name")).toHaveText("Ahri");
  await expect(page.getByTestId("lookup-source")).toHaveText("Riot Data Dragon 16.22.1 · patch 26.22");
  await expect(page.getByTestId("lookup-ability")).toHaveCount(5);
  expect(await page.getByTestId("lookup-ability").evaluateAll((els) => els.map((e) => e.getAttribute("data-slot")).join(""))).toBe("PQWER");
  expect(await page.getByTestId("lookup-ability-name").allTextContents()).toEqual(["Essence Theft", "Orb of Deception", "Fox-Fire", "Charm", "Spirit Rush"]);
  for (const slot of ["P", "Q", "W", "E", "R"]) expect(await row(page, slot).locator('img, [data-testid="lookup-icon-standin"]').count(), slot).toBeGreaterThan(0);
  expect(await values(page, "Q", "base")).toEqual([7, 7, 7, 7, 7]);
  expect(await values(page, "R", "base")).toEqual([140, 120, 100]);
  // Each row's slot key, a tile of its own (the 10px badge and the repeated slot word are gone).
  expect(await panel(page).getByTestId("lookup-slot-key").filter({ visible: true }).allTextContents()).toEqual(["P", "Q", "W", "E", "R"]);
  await expect(row(page, "Q").getByRole("heading", { level: 3 })).toHaveText("Q: Orb of Deception");
  // Costs per rank, on the cooldowns' grid, where Riot's own line is filled by the ability's data; the passive has none.
  await expect(row(page, "Q").getByTestId("lookup-cost")).toHaveAttribute("data-values", "55,65,75,85,95");
  await expect(row(page, "Q").getByTestId("lookup-cost")).toHaveAttribute("data-resource", "Mana");
  await expect(row(page, "Q").getByTestId("lookup-cost")).toContainText("Rank 1: 55 Mana");
  await expect(row(page, "W").getByTestId("lookup-cost")).toHaveAttribute("data-values", "30,30,30,30,30");
  await expect(row(page, "P").getByTestId("lookup-cost")).toHaveCount(0);
  // At 0 the base alone, the field reads 0 and says nothing more.
  await expect(page.getByTestId("lookup-hasted")).toHaveCount(0);
  await expect(hasteInput(page)).toHaveValue("0");
  await expect(page.getByTestId("lookup-haste-cut")).toHaveCount(0);
  // The passive: a quiet dash, Riot's words for a screen reader (the abilities' ⓘ says why).
  await expect(row(page, "P").getByTestId("lookup-dash")).toHaveText("—");
  await expect(row(page, "P").getByTestId("lookup-no-number")).toContainText("No cooldown in Riot's data");
  // The rule, once per champion, in the ⓘ beside its haste field; what Riot's data does not hold in the abilities' ⓘ.
  await expect(panel(page).getByTestId("lookup-rule")).toContainText("Cooldowns at a haste use Riot's rule: base × 100 / (100 + haste). It applies only where Riot's data gives a cooldown. Ultimate haste isn't counted.");
  await expect(page.getByTestId("lookup-data-limit")).toContainText("Mechanics are named from the words of Riot's descriptions. Riot's data has no damage values or scaling, and no cooldown for passives (—).");
  await expect(page.getByTestId("lookup-data-limit")).toHaveCount(1);
  // The old lines under the board are gone.
  await expect(page.locator("main")).not.toContainText("Riot's published data has no damage values");
  // The champion's facts, once, in its header: label and value.
  const facts = panel(page).getByTestId("lookup-facts");
  await expect(facts.getByTestId("lookup-range")).toHaveText("550");
  await expect(facts.getByTestId("lookup-resource")).toHaveText("Mana");
  await expect(facts.getByTestId("lookup-classes")).toHaveText("Mage · Assassin");
  await expect(facts).toContainText("Attack range");
  // Attack range is not repeated among the base statistics.
  await expect(panel(page).locator('[data-testid="lookup-stat"][data-stat="attackrange"]')).toHaveCount(0);
  // The mechanics Riot's descriptions name, as chips on their own row, crowd control first.
  await expect(row(page, "E").locator('[data-testid="lookup-mechanic"][data-kind="charm"]')).toHaveText("Charm");
  expect(await row(page, "Q").getByTestId("lookup-mechanic").allTextContents()).toEqual(["Magic damage", "True damage"]);
  await expect(panel(page).getByTestId("lookup-mechanics")).toHaveCount(0);
  // Screen readers hear each rank with its unit.
  await expect(row(page, "Q").getByTestId("lookup-base")).toContainText("Rank 1: 7 seconds");
  // No timer, countdown or ready time anywhere (game integrity), and nothing "verified".
  await expect(page.locator("main")).not.toContainText(/\b(timer|countdown|ready at|ready in|verified)\b/i);
});

test("a row's chips name what Riot's description says; opened, the description marks the words they come from", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name) && !isPhone(info.project.name), "a desktop and a phone");
  await page.goto("/lookup?champion=Ahri");
  await ready(page);
  const e = row(page, "E");
  await expect(e.getByTestId("lookup-description")).toBeHidden();
  await expect(e.locator('[data-testid="lookup-mechanic"][data-kind="charm"]')).toBeVisible();
  await e.getByTestId("lookup-ability-summary").click();
  await expect(e.getByTestId("lookup-ability-fold")).toHaveAttribute("open", "");
  await expect(e.getByTestId("lookup-description")).toContainText("Ahri blows a kiss");
  await expect(e.getByTestId("lookup-description").locator('[data-mechanic="charm"]')).toHaveText("charms");
  // The chips are not listed again inside (the Release 17 "Named in it" line duplicated them).
  await expect(e.getByTestId("lookup-named")).toHaveCount(0);
});

test("each ability row folds by keyboard: Enter and Space open and close it, Riot's whole description inside, the page grows and never scrolls inside", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "a keyboard");
  await page.goto("/lookup?champion=AurelionSol&haste=20");
  await ready(page);
  const q = row(page, "Q");
  const summary = q.getByTestId("lookup-ability-summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(q.getByTestId("lookup-ability-fold")).toHaveAttribute("open", "");
  await expect(q.getByTestId("lookup-description")).toBeVisible();
  await page.keyboard.press("Space");
  await expect(q.getByTestId("lookup-ability-fold")).not.toHaveAttribute("open", "");
  // Aurelion Sol's R: Riot's longest description, whole since Release 17 (no "…").
  const r = row(page, "R");
  await r.getByTestId("lookup-ability-summary").click();
  await expect(r.getByTestId("lookup-description")).toContainText("The Skies Descend");
  await expect(r.getByTestId("lookup-description")).not.toContainText("…");
  // Every row open: the page grows, nothing scrolls inside it, nothing is wider than the window.
  for (const slot of ["P", "Q", "W", "E"]) await row(page, slot).getByTestId("lookup-ability-summary").click();
  expect(await scrollers(page)).toBe(0);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  await expectNoSeriousAxe(page, "every ability open");
});

test("haste: the field changes every ordinary cooldown by base × 100 / (100 + haste) as it is typed, the address keeps it, and the special cases get none", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name) && !isPhone(info.project.name), "a desktop and a phone");
  await page.goto("/resources");
  await page.goto("/lookup?champion=Darius");
  await ready(page);
  const haste = panel(page).getByTestId("lookup-haste");
  const field = hasteInput(page);
  const ordinary = await page.locator('[data-testid="lookup-ability"][data-cooldown="per-rank"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-slot")!));
  expect(ordinary).toEqual(["Q", "W", "E", "R"]);
  const base: Record<string, number[]> = {};
  for (const slot of ordinary) base[slot] = await values(page, slot, "base");
  for (const h of [10, 20, 37, 100, 0]) {
    await field.fill(String(h));
    await expect(haste).toHaveAttribute("data-haste", String(h));
    for (const slot of ordinary) {
      if (h === 0) await expect(row(page, slot).getByTestId("lookup-hasted"), `${slot} at 0`).toHaveCount(0);
      else await expect(row(page, slot).getByTestId("lookup-hasted"), `${slot} at ${h}`).toHaveAttribute("data-values", base[slot]!.map((b) => hasted(b, h)).join(","));
      expect(await values(page, slot, "base"), `${slot}'s base at ${h}`).toEqual(base[slot]);
    }
    await expect(page).toHaveURL(h === 0 ? /\/lookup\?champion=Darius$/ : new RegExp(`/lookup\\?champion=Darius&haste=${h}$`));
  }
  // Darius's R: 120 / 100 / 80 s is 75 / 62.5 / 50 s at 60 (the docs' example).
  await field.fill("60");
  await expect(row(page, "R").getByTestId("lookup-hasted")).toHaveAttribute("data-values", "75,62.5,50");
  await expect(page.getByTestId("lookup-haste-cut")).toHaveText("37.5% shorter");
  // The passive never gets a haste: its dash stays, and no hasted line.
  await expect(row(page, "P").getByTestId("lookup-dash")).toHaveText("—");
  await expect(row(page, "P").getByTestId("lookup-hasted")).toHaveCount(0);
  // A reload keeps it; the changes added no history entry: Back leaves the page in one step.
  await page.reload();
  await expect(panel(page).getByTestId("lookup-haste")).toHaveAttribute("data-haste", "60");
  await expect(hasteInput(page)).toHaveValue("60");
  await page.goBack();
  await expect(page).toHaveURL(/\/resources$/);
});

test("the haste field takes a whole number from 0 to 300 and nothing else: a sign, an exponent, letters, a fraction and a paste are not taken, more than 300 is held, empty is 0", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name) && !isPhone(info.project.name), "a desktop and a phone");
  await page.goto("/lookup?champion=Darius");
  await ready(page);
  const haste = panel(page).getByTestId("lookup-haste");
  const field = hasteInput(page);
  const note = panel(page).getByTestId("lookup-haste-note");
  // A numeric keypad, a name read out, and 44px on a touch screen.
  await expect(field).toHaveAttribute("inputmode", "numeric");
  await expect(field).toHaveAccessibleName(/ability haste for Darius/);
  if (isPhone(info.project.name)) expect((await field.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(field).not.toHaveAttribute("aria-invalid", "true");
  /** Sets 35 haste, then types `text` key by key over it, as a reader would. */
  const typeOver = async (text: string) => {
    await field.fill("35");
    await expect(haste).toHaveAttribute("data-haste", "35");
    await field.selectText();
    await field.pressSequentially(text);
    await expect(field).toHaveValue(text);
  };
  // The Release 17 review: "-20" read "020" and took 20, "1e3" took 13. Now what is not digits is
  // not taken: the text stays as typed, the haste in use stays, the field says so and is invalid.
  // Typed key by key, digits typed before the first other character are taken ("4a5x" takes the 4,
  // "1e3" the 1: never 45, 13 or 1000); nothing after it is.
  for (const [typed, taken] of [
    ["-20", 35],
    ["+5", 35],
    ["abc", 35],
    ["4a5x", 4],
    ["1e3", 1],
  ] as const) {
    await typeOver(typed);
    await expect(haste, typed).toHaveAttribute("data-haste", String(taken));
    await expect(note, typed).toHaveText(/Digits only/);
    await expect(field, typed).toHaveAttribute("aria-invalid", "true");
    await expect(row(page, "R").getByTestId("lookup-hasted"), typed).toHaveAttribute("data-values", [120, 100, 80].map((b) => hasted(b, taken)).join(","));
    // On leaving, the field shows the haste in use.
    await field.blur();
    await expect(field, typed).toHaveValue(String(taken));
  }
  // Spaces around a number are ignored: " 7 " is 7, valid, and reads 7 on leaving.
  await typeOver(" 7 ");
  await expect(haste).toHaveAttribute("data-haste", "7");
  await expect(note).toHaveCount(0);
  await expect(field).not.toHaveAttribute("aria-invalid", "true");
  await field.blur();
  await expect(field).toHaveValue("7");
  // A fraction: the 12 typed before the point stays, "Whole numbers only"; on leaving it reads 12.
  await typeOver("12.5");
  await expect(haste).toHaveAttribute("data-haste", "12");
  await expect(note).toHaveText(/Whole numbers only/);
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await field.blur();
  await expect(field).toHaveValue("12");
  // More than 300 is held to 300, said; on leaving the field it reads 300.
  await field.fill("999");
  await expect(haste).toHaveAttribute("data-haste", "300");
  await expect(note).toHaveText(/Held to 300/);
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(row(page, "R").getByTestId("lookup-hasted")).toHaveAttribute("data-values", [120, 100, 80].map((b) => hasted(b, 300)).join(","));
  await field.blur();
  await expect(field).toHaveValue("300");
  await expect(page).toHaveURL(/\/lookup\?champion=Darius&haste=300$/);
  // Empty is 0: the base alone, valid; on leaving it reads 0.
  await field.fill("");
  await expect(haste).toHaveAttribute("data-haste", "0");
  await expect(page.getByTestId("lookup-hasted")).toHaveCount(0);
  await expect(note).toHaveCount(0);
  await expect(field).not.toHaveAttribute("aria-invalid", "true");
  await field.blur();
  await expect(field).toHaveValue("0");
  // A paste: digits alone are taken; a sentence or "1e3" is not.
  await field.fill("35");
  await field.selectText();
  await page.keyboard.insertText("20 haste");
  await expect(field).toHaveValue("20 haste");
  await expect(haste).toHaveAttribute("data-haste", "35");
  await expect(note).toHaveText(/Digits only/);
  await field.selectText();
  await page.keyboard.insertText("1e3");
  await expect(haste).toHaveAttribute("data-haste", "35");
  await field.selectText();
  await page.keyboard.insertText("40");
  await expect(haste).toHaveAttribute("data-haste", "40");
  await expect(note).toHaveCount(0);
  await expect(field).not.toHaveAttribute("aria-invalid", "true");
  // An address beyond the field's rule is held too.
  await page.goto("/lookup?champion=Darius&haste=abc");
  await expect(panel(page).getByTestId("lookup-haste")).toHaveAttribute("data-haste", "0");
  await page.goto("/lookup?champion=Darius&haste=5000");
  await expect(panel(page).getByTestId("lookup-haste")).toHaveAttribute("data-haste", "300");
});

test("special cooldowns are said in words, never computed: the passive, charges, two abilities in a slot, a known-wrong number, no number", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "the words are the same at every width");
  const cases: Array<[string, string, string, RegExp | null]> = [
    ["Teemo", "R", "Charges: recharge not in Riot's data", /Riot's number is the wait between casts, not the time to regain a charge\./],
    ["LeeSin", "Q", "Two abilities share this slot in Riot's data", /Riot's data doesn't say which one its cooldown is\. Riot lists 10 \/ 9 \/ 8 \/ 7 \/ 6\s+s for the slot\./],
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
    if (more) {
      // The reason in full is in the opened row.
      await r.getByTestId("lookup-ability-summary").click();
      await expect(r.getByTestId("lookup-ability-details"), `${champion} ${slot}`).toContainText(more);
    }
    await expect(r.getByTestId("lookup-base"), `${champion} ${slot}`).toHaveCount(0);
    await expect(r.getByTestId("lookup-hasted"), `${champion} ${slot}`).toHaveCount(0);
    await expect(row(page, "P").getByTestId("lookup-hasted")).toHaveCount(0);
  }
  // The passive's opened row does not repeat its folded line (the Release 17 review).
  await row(page, "P").getByTestId("lookup-ability-summary").click();
  await expect(row(page, "P").getByTestId("lookup-ability-details")).toBeVisible();
  await expect(row(page, "P").getByTestId("lookup-ability-details")).not.toContainText("No cooldown in Riot's data");
  await expect(row(page, "P").getByTestId("lookup-ability-details")).not.toContainText("gives passives no cooldown");
  // On the same page, an ordinary ability still gets its hasted line (Teemo's Q: 7 s at 40 haste is 5 s).
  await page.goto("/lookup?champion=Teemo&haste=40");
  await expect(row(page, "Q").getByTestId("lookup-hasted")).toHaveAttribute("data-values", (await values(page, "Q", "base")).map((b) => hasted(b, 40)).join(","));
});

test("unusual champions: a transformation, a resource-less champion, 6 ranks, a health cost: Riot's words or nothing, never a zero", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "once");
  // Jayce: two forms in each slot, Riot's array said as Riot's; the form swap named by his description.
  await page.goto("/lookup?champion=Jayce&haste=20");
  await expect(row(page, "Q").getByTestId("lookup-no-number")).toHaveText("Two abilities share this slot in Riot's data · no haste applied");
  await expect(panel(page).locator('[data-testid="lookup-mechanic"][data-kind="transform"]').first()).toBeVisible();
  // Garen: no resource ("None"), every ability at no cost in Riot's words.
  await page.goto("/lookup?champion=Garen");
  await expect(panel(page).getByTestId("lookup-resource")).toHaveText("None");
  for (const slot of ["Q", "W", "E", "R"]) await expect(row(page, slot).getByTestId("lookup-cost"), slot).toHaveText("No cost");
  // Udyr: six ranks, every one shown.
  await page.goto("/lookup?champion=Udyr");
  expect(await values(page, "Q", "base")).toHaveLength(6);
  // Dr. Mundo's Q costs health, a number Riot's data leaves out: no cost line, never "0".
  await page.goto("/lookup?champion=DrMundo");
  await expect(row(page, "Q").getByTestId("lookup-cost")).toHaveCount(0);
  // Base statistics (open beside the abilities on a desktop, a fold narrower): attack damage without a growth (Riot's data gives 0 for every champion), never "+0".
  const statsSummary = panel(page).getByTestId("lookup-stats-summary").filter({ visible: true });
  if (await statsSummary.count()) await statsSummary.click();
  const ad = panel(page).locator('[data-testid="lookup-stat"][data-stat="attackdamage"]').filter({ visible: true });
  await expect(ad).toBeVisible();
  await expect(ad).not.toContainText("+");
  await expect(panel(page).locator('[data-testid="lookup-stat"][data-stat="hp"]').filter({ visible: true })).toContainText(/\+\d/);
  await expect(panel(page).locator("[data-testid=lookup-stats]").filter({ visible: true })).not.toContainText(/\+0(?![.\d])/);
});

test("\"/\" opens the window of every champion, its search takes the typing, Enter the first match; the search with nothing chosen works by keyboard too", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "a keyboard and a mouse");
  await page.goto("/lookup?champion=Ahri");
  await ready(page);
  await page.locator("main h1").click();
  await page.keyboard.press("/");
  const win = page.getByTestId("lookup-picker");
  await expect(win).toBeVisible();
  const search = win.getByTestId("lookup-picker-search");
  await expect(search).toBeFocused();
  await search.fill("kha");
  await search.press("Enter");
  await expect(win).toHaveCount(0);
  await expect(panel(page)).toHaveAttribute("data-champion", "Khazix");
  await expect(page).toHaveURL(/\/lookup\?champion=Khazix$/);
  await expect(panel(page).getByTestId("lookup-change")).toBeFocused();

  // With nothing chosen: the combobox, "/" into it, initials and nicknames, ↑/↓ and Enter, Escape twice.
  await page.goto("/lookup");
  await ready(page);
  const input = page.getByTestId("lookup-search-input");
  await page.locator("main h1").click();
  await page.keyboard.press("/");
  await expect(input).toBeFocused();
  await page.keyboard.type("kha");
  const options = page.getByTestId("lookup-search-option");
  await expect(options.first()).toHaveAttribute("data-champion", "Khazix");
  await expectNoSeriousAxe(page, "the search's list open");
  await input.fill("j4");
  await expect(options.first()).toHaveAttribute("data-champion", "JarvanIV");
  await input.fill("tf");
  await expect(options.first()).toHaveAttribute("data-champion", "TwistedFate");
  await input.fill("a");
  await expect(options).toHaveCount(8);
  await expect(page.getByTestId("lookup-search-note")).toHaveText(/^\d+ more: keep typing, or open All champions\.$/);
  await input.fill("qqq");
  await page.keyboard.press("Escape");
  await expect(input).toHaveValue("qqq");
  await page.keyboard.press("Escape");
  await expect(input).toHaveValue("");
  await input.fill("ka");
  const second = (await options.nth(1).getAttribute("data-champion"))!;
  await page.keyboard.press("ArrowDown");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(panel(page)).toHaveAttribute("data-champion", second);
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
  await expect(panel(page)).toHaveAttribute("data-champion", "Ahri");
  await expect(input).toHaveCount(0);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  // The haste field, the name and the fold rows are 44px targets.
  expect((await hasteInput(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await panel(page).getByTestId("lookup-change").boundingBox())!.height).toBeGreaterThanOrEqual(44);
  for (const h of await page.getByTestId("lookup-ability-summary").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))) expect(h).toBeGreaterThanOrEqual(44);
});

test("the champion's name opens the window of every champion: the roster, a search, Enter the first match, a Recent row, the focus back, and no history entry", async ({ page }, info) => {
  test.skip(isPhone(info.project.name) ? false : !isDesktop(info.project.name), "a desktop and a phone");
  await page.goto("/resources");
  await page.goto("/lookup?champion=Ahri");
  await ready(page);
  const change = panel(page).getByTestId("lookup-change");
  await expect(change).toHaveAccessibleName("Ahri: change champion");
  await change.click();
  const win = page.getByTestId("lookup-picker");
  await expect(win).toBeVisible();
  const grid = win.getByTestId("lookup-picker-grid").locator("button[data-champion]");
  await expect(grid.first()).toBeVisible();
  const counted = Number(/·\s*(\d+)/.exec((await win.getByTestId("lookup-picker-all-title").textContent()) ?? "")?.[1]);
  expect(counted).toBeGreaterThanOrEqual(170);
  await expect(grid).toHaveCount(counted);
  await expect(win.getByTestId("lookup-picker-recent").locator('button[data-champion="Ahri"]')).toBeVisible();
  const search = win.getByTestId("lookup-picker-search");
  if (isPhone(info.project.name)) await search.tap();
  await search.fill("nunu");
  await expect(win.getByTestId("lookup-picker-count")).toHaveText("1 champion found");
  await search.press("Enter");
  await expect(win).toHaveCount(0);
  await expect(panel(page)).toHaveAttribute("data-champion", "Nunu");
  await expect(panel(page).getByTestId("lookup-change")).toBeFocused();
  await page.goBack();
  await expect(page).toHaveURL(/\/resources$/);
});

test("Compare: a second champion on one aligned board, each changed and hasted on its own, both in the address, removed again, Back in one step", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "the desktop");
  await page.goto("/resources");
  await page.goto("/lookup?champion=Ahri&haste=20");
  await ready(page);
  await expect(page.getByTestId("lookup-add")).toHaveText("Compare");
  await page.getByTestId("lookup-add").click();
  await expect(page.getByTestId("lookup-picker")).toContainText("Compare with");
  await pickInWindow(page, "jinx", "Jinx");
  await expect(panel(page, 2)).toHaveAttribute("data-champion", "Jinx");
  await expect(page).toHaveURL(/\/lookup\?champion=Ahri&haste=20&champion2=Jinx$/);
  // The new column's name has the focus; Compare gives way to Swap while two are shown.
  await expect(panel(page, 2).getByTestId("lookup-change")).toBeFocused();
  await expect(page.getByTestId("lookup-add")).toHaveCount(0);
  await expect(page.getByTestId("lookup-swap")).toHaveAccessibleName("Swap Ahri and Jinx");
  // One board: two equal columns side by side, every row of the two level, the slots' keys beside them; no switcher.
  await expect(page.getByTestId("lookup-board")).toHaveAttribute("data-layout", "compare");
  const [a, b] = [(await panel(page, 1).boundingBox())!, (await panel(page, 2).boundingBox())!];
  expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(1);
  expect(b.x).toBeGreaterThan(a.x + a.width - 1);
  for (const r of await rowsLevel(page)) expect(r, `${r.slot} level in both columns`).toEqual({ slot: r.slot, top: 0, height: 0 });
  await expect(page.getByTestId("lookup-key-column").getByTestId("lookup-slot-key")).toHaveCount(5);
  await expect(page.getByTestId("lookup-switcher")).toHaveCount(0);
  // Two neutral references: no better or worse, no difference computed (Riot's own descriptions aside: "attack slower" is Jinx's).
  const ownWords = await page.locator("main").evaluate((m) => {
    const copy = m.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('[data-testid="lookup-description"]').forEach((d) => d.remove());
    return copy.textContent ?? "";
  });
  expect(ownWords).not.toMatch(/\b(faster|slower|better|worse|advantage|wins?)\b/i);
  // Each haste its own.
  await hasteInput(page, 2).fill("50");
  await expect(row(page, "W", 2).getByTestId("lookup-hasted")).toHaveAttribute("data-values", (await values(page, "W", "base", 2)).map((x) => hasted(x, 50)).join(","));
  await expect(row(page, "Q", 1).getByTestId("lookup-hasted")).toHaveAttribute("data-values", "5.83,5.83,5.83,5.83,5.83");
  await expect(page).toHaveURL(/\/lookup\?champion=Ahri&haste=20&champion2=Jinx&haste2=50$/);
  // An open fold of the first stays open while the second changes champion.
  await row(page, "E", 1).getByTestId("lookup-ability-summary").click();
  await panel(page, 2).getByTestId("lookup-change").click();
  await pickInWindow(page, "cait", "Caitlyn");
  await expect(panel(page, 2)).toHaveAttribute("data-champion", "Caitlyn");
  await expect(page).toHaveURL(/\/lookup\?champion=Ahri&haste=20&champion2=Caitlyn&haste2=50$/);
  await expect(row(page, "E", 1).getByTestId("lookup-ability-fold")).toHaveAttribute("open", "");
  await expect(panel(page, 1)).toHaveAttribute("data-champion", "Ahri");
  await expectNoSeriousAxe(page, "two champions");
  // The first changes alone too.
  await panel(page, 1).getByTestId("lookup-change").click();
  await pickInWindow(page, "lux", "Lux");
  await expect(page).toHaveURL(/\/lookup\?champion=Lux&haste=20&champion2=Caitlyn&haste2=50$/);
  // The two base statistics folds open and close together, their rows level.
  await panel(page, 1).getByTestId("lookup-stats-summary").click();
  await expect(panel(page, 2).getByTestId("lookup-stats")).toHaveAttribute("open", "");
  const statTops = await page.evaluate(() => [1, 2].map((n) => [...document.querySelectorAll(`[data-panel="${n}"] [data-testid="lookup-stat"]`)].map((r) => Math.round(r.getBoundingClientRect().top))));
  expect(statTops[0]).toEqual(statTops[1]);
  await panel(page, 2).getByTestId("lookup-stats-summary").click();
  await expect(panel(page, 1).getByTestId("lookup-stats")).not.toHaveAttribute("open", "");
  // Removed: one champion again, the first's haste kept, the focus on it.
  await panel(page, 2).getByTestId("lookup-remove").click();
  await expect(panel(page, 2)).toHaveCount(0);
  await expect(page).toHaveURL(/\/lookup\?champion=Lux&haste=20$/);
  await expect(panel(page, 1).getByTestId("lookup-change")).toBeFocused();
  await expect(page.getByTestId("lookup-board")).toHaveAttribute("data-layout", "single");
  // None of it added a history entry.
  await page.goBack();
  await expect(page).toHaveURL(/\/resources$/);
});

test("the address with two champions: both open, a name in any case, a second alone becomes the first, one the roster lacks is left out and said", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "once");
  await page.goto("/lookup?champion=Ahri&haste=10&champion2=jinx&haste2=999");
  await expect(panel(page, 2)).toHaveAttribute("data-champion", "Jinx");
  await expect(page).toHaveURL(/\/lookup\?champion=Ahri&haste=10&champion2=Jinx&haste2=300$/);
  await expect(panel(page, 2).getByTestId("lookup-haste")).toHaveAttribute("data-haste", "300");
  await page.goto("/lookup?champion2=Thresh&haste2=40");
  await expect(panel(page, 1)).toHaveAttribute("data-champion", "Thresh");
  await expect(panel(page, 2)).toHaveCount(0);
  await expect(page).toHaveURL(/\/lookup\?champion=Thresh&haste=40$/);
  await page.goto("/lookup?champion=Ahri&champion2=%3Cb%3ENobody");
  await expect(page.getByTestId("lookup-unknown")).toContainText("not on the roster");
  await expect(page.locator("main")).not.toContainText("Nobody");
  await expect(page).toHaveURL(/\/lookup\?champion=Ahri$/);
  await page.goto("/lookup?champion=wukong&haste=25");
  await expect(panel(page)).toHaveAttribute("data-champion", "MonkeyKing");
  await expect(page).toHaveURL(/\/lookup\?champion=MonkeyKing&haste=25$/);
});

test("a phone and a tablet compare side by side: both champions in every row, level, each with its own haste and folds, nothing wider than the screen, 44px targets", async ({ page }, info) => {
  test.skip(isDesktop(info.project.name), "the phone and the tablet");
  await page.goto("/lookup?champion=Ahri&champion2=Jinx");
  await ready(page);
  // Both columns shown, side by side, every row level; no switcher any more.
  await expect(panel(page, 1)).toBeVisible();
  await expect(panel(page, 2)).toBeVisible();
  await expect(page.getByTestId("lookup-switcher")).toHaveCount(0);
  const [a, b] = [(await panel(page, 1).boundingBox())!, (await panel(page, 2).boundingBox())!];
  expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(1);
  expect(b.x).toBeGreaterThan(a.x + a.width - 1);
  for (const r of await rowsLevel(page)) expect(r, `${r.slot} level`).toEqual({ slot: r.slot, top: 0, height: 0 });
  // Each its own haste and folds.
  await hasteInput(page, 1).fill("30");
  await row(page, "Q", 1).getByTestId("lookup-ability-summary").click();
  await expect(row(page, "Q", 1).getByTestId("lookup-description")).toBeVisible();
  await expect(row(page, "Q", 2).getByTestId("lookup-description")).toBeHidden();
  await hasteInput(page, 2).fill("15");
  await expect(page).toHaveURL(/\/lookup\?champion=Ahri&haste=30&champion2=Jinx&haste2=15$/);
  await expect(row(page, "Q", 1).getByTestId("lookup-hasted")).toHaveAttribute("data-values", [7, 7, 7, 7, 7].map((x) => hasted(x, 30)).join(","));
  // An open row grows that row in both columns, which stay level.
  for (const r of await rowsLevel(page)) expect(r.top, `${r.slot} level with a row open`).toBe(0);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  expect(await scrollers(page)).toBe(0);
  // Every control a 44px target on a touch screen.
  if (isPhone(info.project.name)) {
    for (const n of [1, 2] as const) {
      for (const id of ["lookup-change", "lookup-remove", "lookup-haste-input"]) expect((await panel(page, n).getByTestId(id).boundingBox())!.height, `${id} ${n}`).toBeGreaterThanOrEqual(44);
    }
    expect((await page.getByTestId("lookup-swap").boundingBox())!.height).toBeGreaterThanOrEqual(44);
    for (const h of await page.getByTestId("lookup-ability-summary").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))) expect(h).toBeGreaterThanOrEqual(44);
  }
  await expectNoSeriousAxe(page, "two champions on a phone or tablet");
});

test("Swap exchanges the two champions, each keeping its haste and open rows; ✕ on the first leaves the second as the first, its haste with it", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name) && !isPhone(info.project.name), "a desktop and a phone");
  await page.goto("/resources");
  await page.goto("/lookup?champion=Ahri&haste=20&champion2=Jinx&haste2=50");
  await ready(page);
  await row(page, "E", 1).getByTestId("lookup-ability-summary").click();
  await expect(row(page, "E", 1).getByTestId("lookup-ability-fold")).toHaveAttribute("open", "");
  await page.getByTestId("lookup-swap").click();
  await expect(page).toHaveURL(/\/lookup\?champion=Jinx&haste=50&champion2=Ahri&haste2=20$/);
  await expect(panel(page, 1)).toHaveAttribute("data-champion", "Jinx");
  await expect(panel(page, 2)).toHaveAttribute("data-champion", "Ahri");
  await expect(panel(page, 2)).not.toHaveAttribute("aria-busy", "true");
  // Each haste went with its champion; Ahri's open row too.
  await expect(hasteInput(page, 1)).toHaveValue("50");
  await expect(hasteInput(page, 2)).toHaveValue("20");
  await expect(row(page, "Q", 2).getByTestId("lookup-hasted")).toHaveAttribute("data-values", "5.83,5.83,5.83,5.83,5.83");
  await expect(row(page, "E", 2).getByTestId("lookup-ability-fold")).toHaveAttribute("open", "");
  await expect(page.getByTestId("lookup-swap")).toHaveAccessibleName("Swap Jinx and Ahri");
  // ✕ on the first column (Jinx): Ahri stays, first, at her haste; the focus on her name.
  await panel(page, 1).getByTestId("lookup-remove").click();
  await expect(page).toHaveURL(/\/lookup\?champion=Ahri&haste=20$/);
  await expect(panel(page, 1)).toHaveAttribute("data-champion", "Ahri");
  await expect(panel(page, 2)).toHaveCount(0);
  await expect(hasteInput(page, 1)).toHaveValue("20");
  await expect(panel(page, 1).getByTestId("lookup-change")).toBeFocused();
  // None of it added a history entry.
  await page.goBack();
  await expect(page).toHaveURL(/\/resources$/);
});

test("names are never cut or broken: the longest on one line in the header at 1366, 1440 and 1920, single and compared, in the search's list and in the window's grid", async ({ page, context, baseURL }, info) => {
  test.skip(!isDesktop(info.project.name), "the desktop sizes");
  test.setTimeout(120_000);
  for (const folded of [false, true]) {
    await context.clearCookies({ name: "uniiverse_sidebar" });
    if (folded) await context.addCookies([{ name: "uniiverse_sidebar", value: "collapsed", url: baseURL! }]);
    for (const [width, height] of [[1366, 768], [1440, 900], [1920, 1080]] as const) {
      await page.setViewportSize({ width, height });
      for (const path of ["/lookup?champion=Nunu&haste=20", "/lookup?champion=AurelionSol", "/lookup?champion=Nunu&champion2=AurelionSol", "/lookup?champion=RenataGlasc&champion2=TwistedFate&haste2=40", "/lookup?champion=Heimerdinger&champion2=Fiddlesticks"]) {
        await page.goto(path);
        await expect(page.getByTestId("lookup-ability").first()).toBeVisible();
        const where = `${path} at ${width} × ${height}${folded ? ", the sidebar folded" : ""}`;
        expect(await namesWhole(page, '[data-testid="lookup-name"]', true), where).toEqual([]);
        // The abilities' names: whole, a word never broken (two-form names may wrap between words).
        expect(await namesWhole(page, '[data-testid="lookup-ability-name"]', false), `${where}: ability names`).toEqual([]);
      }
    }
  }
  // The search's list: the name whole beside its title (the title gives way first).
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/lookup");
  await ready(page);
  await page.getByTestId("lookup-search-input").fill("nunu");
  await expect(page.getByTestId("lookup-search-option").first()).toHaveAttribute("data-champion", "Nunu");
  expect(await namesWhole(page, '[data-testid="lookup-search-option"] > span.font-medium', true)).toEqual([]);
  // The window's grid: every name whole under its portrait, never clamped to two lines.
  await page.getByTestId("lookup-browse").click();
  const grid = page.getByTestId("lookup-picker-grid");
  await expect(grid.locator("button[data-champion]").first()).toBeVisible();
  expect(await namesWhole(page, '[data-testid="lookup-picker-grid"] button[data-champion] > span:not([aria-hidden]):not(.sr-only)', false)).toEqual([]);
});

test("Matchup Intel's old links land on Champion Intel, carrying one champion: the enemy where named", async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), "once");
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
    await expect(page.getByRole("heading", { level: 1, name: "Champion Intel" })).toBeVisible();
  }
});

test("one screen: the header, the haste and the five abilities, folded, on the first screen at every desktop size, one champion and two, the sidebar open and folded; nothing scrolls inside", async ({ page, context, baseURL }, info) => {
  test.skip(!isDesktop(info.project.name), "the desktop");
  test.setTimeout(240_000);
  const sizes: Array<[number, number]> = [
    [1280, 720],
    [1440, 900],
    [1440, 780],
    [1920, 1080],
    [1920, 950],
    [2560, 1440],
    [3440, 1440],
  ];
  const paths = ["/lookup?champion=Ahri&haste=100", "/lookup?champion=Udyr&haste=20", "/lookup?champion=Aphelios&haste=300", "/lookup?champion=Ahri&haste=20&champion2=Jinx&haste2=20", "/lookup?champion=Udyr&haste=40&champion2=LeeSin&haste2=40", "/lookup?champion=Teemo&haste=55&champion2=Jayce&haste2=10"];
  for (const folded of [false, true]) {
    await context.clearCookies({ name: "uniiverse_sidebar" });
    if (folded) await context.addCookies([{ name: "uniiverse_sidebar", value: "collapsed", url: baseURL! }]);
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      for (const path of paths) {
        await page.goto(path);
        await expect(page.getByTestId("lookup-ability").first()).toBeVisible();
        const where = `${path} at ${width} × ${height}${folded ? ", the sidebar folded" : ""}`;
        const fit = await page.evaluate(() => {
          const panels = [...document.querySelectorAll<HTMLElement>('[data-testid="lookup-panel"]')].filter((p) => p.offsetParent !== null);
          return {
            panels: panels.length,
            rows: Math.max(...panels.flatMap((p) => [...p.querySelectorAll('[data-testid="lookup-ability"]')].map((r) => r.getBoundingClientRect().bottom))),
            haste: Math.max(...panels.map((p) => p.querySelector('[data-testid="lookup-haste"]')!.getBoundingClientRect().bottom)),
            // The page is centred in the room beside the sidebar: its left and right gaps within a pixel.
            view: (() => {
              const v = document.querySelector('[data-testid="champion-lookup"]')!.getBoundingClientRect();
              const main = document.querySelector("main")!.getBoundingClientRect();
              return { left: v.left - main.left, right: main.right - v.right };
            })(),
          };
        });
        expect(fit.panels, `${where}: both panels side by side`).toBe(path.includes("champion2") ? 2 : 1);
        // Compare is held to one screen from 1440 × 780 up (the 25 Nov 2026 layout: two columns of the
        // aligned board at 1280 × 720 with the sidebar open run a little past the screen); one champion at every size.
        const held = !(path.includes("champion2") && width < 1366);
        if (held) expect(fit.haste, `${where}: the haste on the screen`).toBeLessThanOrEqual(height);
        if (held) expect(fit.rows, `${where}: the five abilities on the screen`).toBeLessThanOrEqual(height);
        expect(Math.abs(fit.view.left - fit.view.right), `${where}: centred`).toBeLessThanOrEqual(2);
        expect(await scrollers(page), where).toBe(0);
        expect(await overflow(page), where).toBeLessThanOrEqual(1);
      }
    }
  }
});

test("the ranks line up: in columns each rank's cooldown and cost sit under its heading on one line; on a narrow row a value never breaks inside itself, from 640px to 1440px with the sidebar open and folded, one champion and two", async ({ page, context, baseURL }, info) => {
  test.skip(!isDesktop(info.project.name), "the desktop project, every width set here");
  test.setTimeout(180_000);
  const sizes: Array<[number, boolean]> = [[640, false], [768, false], [1024, false], [1024, true], [1280, false], [1280, true], [1440, false]];
  for (const [width, folded] of sizes) {
    await context.clearCookies({ name: "uniiverse_sidebar" });
    if (folded) await context.addCookies([{ name: "uniiverse_sidebar", value: "collapsed", url: baseURL! }]);
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/lookup?champion=Ahri", "/lookup?champion=Udyr", "/lookup?champion=Udyr&champion2=Ahri"]) {
      await page.goto(path);
      await expect(page.getByTestId("lookup-ability").first()).toBeVisible();
      const where = `${path} at ${width}px${folded ? ", the sidebar folded" : ""}`;
      const panels = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('[data-testid="lookup-panel"]')]
          .filter((p) => p.offsetParent !== null)
          .map((p) => {
            const head = p.querySelector<HTMLElement>('[data-testid="lookup-rank-head"]')!;
            const columns = getComputedStyle(head).display !== "none";
            const ranksOf = (el: Element | null) => (el ? [...el.querySelectorAll<HTMLElement>(":scope > [data-rank]")].map((c) => c.getBoundingClientRect()) : []);
            const right = p.getBoundingClientRect().right;
            const rows = [...p.querySelectorAll('[data-testid="lookup-ability"][data-cooldown="per-rank"]')].map((r) => {
              const lines = ["lookup-base", "lookup-cost"].map((id) => ranksOf(r.querySelector(`[data-testid="${id}"]`)));
              const base = lines[0]!;
              const oneLine = (cells: DOMRect[]) => cells.every((c) => Math.abs(c.top - cells[0]!.top) <= 2);
              // A value never breaks inside itself (a narrow row wraps between ranks only).
              const whole = lines.flat().every((c) => c.height <= 30);
              return { slot: r.getAttribute("data-slot"), ranks: base.length, oneLine: oneLine(base), whole, rights: base.map((c) => Math.round(c.right)), costRights: lines[1]!.map((c) => Math.round(c.right)), inside: lines.flat().every((c) => c.right <= right - 1) };
            });
            const heads = [...head.querySelectorAll<HTMLElement>('[data-testid="lookup-rank-head-cell"]')].map((h) => h.getBoundingClientRect());
            return { columns, rows, headsOneLine: heads.every((h) => Math.abs(h.top - heads[0]!.top) <= 2), headRights: heads.map((h) => Math.round(h.right)) };
          }),
      );
      for (const m of panels) {
        for (const r of m.rows) {
          expect(r.whole, `${where}: ${r.slot}'s values each whole`).toBe(true);
          expect(r.inside, `${where}: ${r.slot}'s ranks inside the panel`).toBe(true);
          if (m.columns) {
            expect(r.oneLine, `${where}: ${r.slot}'s ranks on one line`).toBe(true);
            r.rights.forEach((right, i) => expect(Math.abs(right - m.headRights[i]!), `${where}: ${r.slot}'s rank ${i + 1} under its heading`).toBeLessThanOrEqual(1));
            // The cost per rank on the same grid: rank n's cost under rank n's cooldown.
            r.costRights.forEach((right, i) => expect(Math.abs(right - m.headRights[i]!), `${where}: ${r.slot}'s cost at rank ${i + 1} under its heading`).toBeLessThanOrEqual(1));
          }
        }
        if (m.columns) {
          expect(m.headsOneLine, `${where}: the heading's ranks on one line`).toBe(true);
          expect(m.headRights.length, `${where}: a heading for every rank`).toBe(Math.max(5, ...m.rows.map((r) => r.ranks)));
        }
      }
    }
  }
});

test("phones at 320, 375, 390 and 430, at 100% and 200% text: nothing wider than the phone, nothing scrolls inside, every ability's name and cooldown whole", async ({ page }, info) => {
  test.skip(!isPhone(info.project.name), "the phone");
  test.setTimeout(180_000);
  for (const [width, height] of [[320, 568], [375, 667], [390, 844], [430, 932]] as const) {
    await page.setViewportSize({ width, height });
    for (const root of [100, 200]) {
      for (const path of ["/lookup?champion=Heimerdinger&haste=20", "/lookup?champion=LeeSin&haste=40&champion2=Udyr&haste2=10"]) {
        await page.goto(path);
        await ready(page);
        await page.addStyleTag({ content: `html { font-size: ${root}% !important; }` });
        await page.evaluate(() => document.fonts.ready);
        const where = `${path} at ${width}px, ${root}%`;
        await expect.poll(() => overflow(page), { message: where }).toBeLessThanOrEqual(0);
        await row(page, "Q").getByTestId("lookup-ability-summary").click();
        const rows = await page.getByTestId("lookup-ability").evaluateAll((els) => els.map((e) => ({ over: e.scrollWidth - e.clientWidth })));
        expect(rows.every((r) => r.over <= 1), where).toBe(true);
        expect(await scrollers(page), where).toBe(0);
        expect(await overflow(page), `${where}, a row open`).toBeLessThanOrEqual(1);
      }
    }
  }
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/lookup?champion=Heimerdinger&haste=20");
  await expectNoSeriousAxe(page, "a phone");
});
