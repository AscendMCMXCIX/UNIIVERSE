import { expect, test, type Page } from "./test";
import { expectNoSeriousAxe } from "./axe";

/*
  CHAMPION INTEL's builds and runes (docs/CHAMPION_INTEL.md, "Builds and runes"), on the demo's
  builds fixture (server/demo/builds-fixture.ts; Data Dragon pinned at 16.22.1, so the current patch
  is 26.22 and the previous 26.21): Thresh in support with a most common build and one with a higher
  win rate, Nasus in top with one build, Leona in support and the bot lane on the previous patch
  too, and the honest "not enough games" line for a champion with too few (Ahri). Compact icon rows
  with their win and pick rates, the source line and each ⓘ in plain words, the role in the address,
  Compare's aligned builds row, phones with nothing wider than the screen, the single desktop view
  on one screen, no player's identity anywhere, and axe.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const builds = (page: Page, n: 1 | 2 = 1) => page.locator(`[data-testid="lookup-panel"][data-panel="${n}"] [data-testid="lookup-builds-view"]`);
const part = (page: Page, name: string, n: 1 | 2 = 1) => builds(page, n).locator(`[data-testid="lookup-build-part"][data-part="${name}"]`);
const ready = (page: Page) => expect(page.getByTestId("lookup-view")).toHaveAttribute("data-ready", "true");
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const scrollers = (page: Page) => page.evaluate(() => [...document.querySelectorAll("main *")].filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1).length);
const PARTS = ["runes", "shards", "spells", "skills", "start", "boots", "core", "full"];

test("a champion with enough games: its builds and runes as icon rows, each with its win and pick rate, the source line said in full", async ({ page }) => {
  await page.goto("/lookup?champion=Thresh");
  await ready(page);
  const view = builds(page);
  await expect(view).toHaveAttribute("data-status", "shown");
  await expect(view).toHaveAttribute("data-role", "SUPPORT");
  await expect(view.getByRole("heading", { name: "Builds and runes" })).toBeVisible();
  // One role: named, no switch.
  await expect(view.getByTestId("lookup-build-one-role")).toHaveText("Support");
  await expect(view.getByTestId("lookup-build-role")).toHaveCount(0);
  await expect(view.getByTestId("lookup-build-source")).toHaveAttribute("data-line", /^From \d+ games in the team's matches · patch 26\.22 · all ranks · (Draft|Ranked|Clash)( and (Ranked|Clash))?$/);
  // The visible words are the line's (each part opening its own ⓘ).
  expect((await view.getByTestId("lookup-build-source").locator("button").allInnerTexts()).join(" ")).toMatch(/^From \d+ games in the team's matches patch 26\.22 all ranks (Draft|Ranked)/);
  for (const name of PARTS) await expect(part(page, name), name).toHaveAttribute("data-state", "shown");
  // Icons, not lists of names: every part but the skill order draws Riot's pictures (or a stand-in).
  for (const name of PARTS.filter((p) => p !== "skills")) expect(await part(page, name).getByTestId("lookup-build-choice").locator("img, [role=img]").count(), name).toBeGreaterThan(0);
  // The skill order's family is its max order; the first points shown are the most common among its games, said so.
  await expect(part(page, "skills").getByTestId("lookup-build-choice").getByRole("img")).toHaveAttribute("aria-label", /^Skill order: [QWE], then [QWE], then [QWE]\. First points most often [QWER], [QWER], [QWER]\.$/);
  await expect(part(page, "skills").getByTestId("lookup-build-choice")).toContainText(/most often first [QWER] [QWER] [QWER]/);
  // The rune page: both trees drawn, each named (the primary's before its keystone, the secondary's before its runes), and said to be the commonest page of its keystone and secondary tree.
  const runes = part(page, "runes").getByTestId("lookup-build-choice");
  await expect(runes.getByTestId("lookup-build-tree")).toHaveCount(2);
  await expect(runes.locator('[data-tree="primary"] [data-testid="lookup-build-tree"]').locator("img, [role=img]")).toHaveCount(1);
  await expect(runes.locator('[data-tree="secondary"] [data-testid="lookup-build-tree"]').locator("img, [role=img]")).toHaveCount(1);
  expect(await runes.locator("img, [role=img]").count()).toBe(8);
  await expect(runes).toContainText("The most common page with this keystone and secondary tree:");
  await expect(part(page, "core").getByTestId("lookup-build-choice")).toContainText("In their most common order:");
  await expect(part(page, "core").getByTestId("lookup-build-choice").locator("img")).toHaveCount(3);
  for (const name of PARTS.filter((p) => p !== "full")) {
    await expect(part(page, name).getByTestId("lookup-build-win"), name).toHaveText(/^\d{1,3}%$/);
    await expect(part(page, name).getByTestId("lookup-build-pick"), name).toHaveText(/^\d{1,3}%$/);
  }
  // Totals only: no player's identity or game anywhere in the page.
  expect(await page.content()).not.toMatch(/demo-filler|demo-lane|demo-together|demo-regular|DEMO_[A-Za-z0-9]/);
});

test("each ⓘ says one thing in plain words, by keyboard and by touch", async ({ page }, info) => {
  await page.goto("/lookup?champion=Thresh");
  await ready(page);
  const win = part(page, "runes").getByTestId("lookup-build-win");
  if (info.project.name === "phone") await win.tap();
  else await win.focus();
  // Counted by keystone and secondary tree (the page shown is their commonest), said so: never "this rune page".
  await expect(page.getByTestId("lookup-build-win-bubble")).toHaveText(/^Won \d+% of the \d+ games with this keystone and secondary tree; \d+% of the \d+ games with a full rune page recorded made it\.$/);
  if (info.project.name === "phone") await page.mouse.click(5, 5);
  else await win.blur();
  const where = builds(page).getByTestId("lookup-build-where");
  if (info.project.name === "phone") await where.tap();
  else await where.focus();
  await expect(page.getByTestId("lookup-build-where-bubble")).toHaveText("Counted from the games of the team's stored matches (both teams). Not a global sample of League players.");
  if (info.project.name !== "phone") {
    await builds(page).getByTestId("lookup-build-ranks").focus();
    await expect(page.getByTestId("lookup-build-ranks-bubble")).toHaveText("Riot's game records hold no rank, so these games are not filtered by rank.");
    await builds(page).getByTestId("lookup-build-patch").focus();
    await expect(page.getByTestId("lookup-build-patch-bubble")).toHaveText("Only games on the current patch, 26.22.");
  }
});

test("the highest win rate is another view, offered only where a common choice wins clearly more; the rows that differ are marked", async ({ page }) => {
  await page.goto("/lookup?champion=Thresh");
  await ready(page);
  const view = builds(page);
  const mode = view.getByTestId("lookup-build-mode");
  await expect(mode.getByRole("radio", { name: "Most common" })).toHaveAttribute("aria-checked", "true");
  const before = await part(page, "core").getByTestId("lookup-build-choice").locator("img").evaluateAll((els) => els.map((e) => e.getAttribute("alt")));
  await mode.getByRole("radio", { name: "Highest win rate" }).click();
  await expect(view).toHaveAttribute("data-mode", "highest");
  for (const name of ["runes", "boots", "core", "full"]) await expect(part(page, name), name).toHaveAttribute("data-choice", "highest");
  // A part whose most common choice also wins the most is the same in both views.
  await expect(part(page, "spells")).toHaveAttribute("data-choice", "common");
  const after = await part(page, "core").getByTestId("lookup-build-choice").locator("img").evaluateAll((els) => els.map((e) => e.getAttribute("alt")));
  expect(after).not.toEqual(before);
  // Never a small sample: the highest win rate's choice was made in at least 20 games.
  expect(Number(await part(page, "core").getAttribute("data-games"))).toBeGreaterThanOrEqual(20);
  // The full build's ⓘ names the core it starts from in this view: the one with the highest win rate, not the most common.
  const fullTip = part(page, "full").getByTestId("lookup-build-full");
  await fullTip.focus();
  await expect(page.getByTestId("lookup-build-full-bubble")).toHaveText(/^The core items with the highest win rate, then /);
  await fullTip.blur();
  await mode.getByRole("radio", { name: "Most common" }).click();
  await expect(view).toHaveAttribute("data-mode", "common");
  await part(page, "full").getByTestId("lookup-build-full").focus();
  await expect(page.getByTestId("lookup-build-full-bubble")).toHaveText(/^The most common core items, then /);
  // One build where the two agree: no second view at all.
  await page.goto("/lookup?champion=Nasus");
  await ready(page);
  await expect(builds(page)).toHaveAttribute("data-status", "shown");
  await expect(builds(page).getByTestId("lookup-build-mode")).toHaveCount(0);
});

test("too few games: one honest line, never a made-up build", async ({ page }) => {
  await page.goto("/lookup?champion=Ahri");
  await ready(page);
  await expect(builds(page)).toHaveAttribute("data-status", "few");
  await expect(builds(page).getByTestId("lookup-build-few")).toHaveText("Not enough games on patch 26.22 in the team's matches yet");
  await expect(builds(page).getByTestId("lookup-build-part")).toHaveCount(0);
});

test("a champion with enough games in two roles: the role is chosen here, kept in the address with the haste, and the previous patch is said", async ({ page }) => {
  await page.goto("/lookup?champion=Leona");
  await ready(page);
  const view = builds(page);
  const roles = view.getByTestId("lookup-build-role");
  await expect(roles.getByRole("radio")).toHaveCount(2);
  await expect(roles.getByRole("radio", { name: /Support/ })).toHaveAttribute("aria-checked", "true");
  await expect(view.getByTestId("lookup-build-source")).toHaveAttribute("data-line", /· patches 26\.21–26\.22 ·/);
  await roles.getByRole("radio", { name: /Bottom/ }).click();
  await expect(view).toHaveAttribute("data-role", "ADC");
  await expect(page).toHaveURL(/[?&]champion=Leona&role=ADC$/);
  // A haste typed keeps the role; a reload opens the same.
  await page.locator('[data-testid="lookup-panel"][data-panel="1"]').getByTestId("lookup-haste-input").fill("20");
  await expect(page).toHaveURL(/champion=Leona&haste=20&role=ADC$/);
  await page.reload();
  await ready(page);
  await expect(builds(page)).toHaveAttribute("data-role", "ADC");
  // The default role is left out of the address.
  await builds(page).getByTestId("lookup-build-role").getByRole("radio", { name: /Support/ }).click();
  await expect(page).toHaveURL(/champion=Leona&haste=20$/);
  // A role the champion has too few games in opens the default.
  await page.goto("/lookup?champion=Leona&role=JUNGLE");
  await ready(page);
  await expect(builds(page)).toHaveAttribute("data-role", "SUPPORT");
});

test("Compare: each champion's builds after R, side by side and level part by part (whatever each heading holds); Swap keeps each role with its champion", async ({ page }, info) => {
  // Side by side from a 390px phone (the phone project's 375px stacks the two columns).
  if (info.project.name === "phone") await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/lookup?champion=Thresh&champion2=Leona&role2=ADC");
  await ready(page);
  await expect(builds(page, 1)).toHaveAttribute("data-status", "shown");
  await expect(builds(page, 2)).toHaveAttribute("data-role", "ADC");
  const slots = page.getByTestId("lookup-builds");
  await expect(slots).toHaveCount(2);
  const [a, b] = await slots.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ top: Math.round(r.top), height: Math.round(r.height), left: Math.round(r.left) })));
  expect(Math.abs(a!.top - b!.top), "the two builds rows level").toBeLessThanOrEqual(1);
  expect(Math.abs(a!.height - b!.height), "the two builds rows the same height").toBeLessThanOrEqual(1);
  expect(b!.left).toBeGreaterThan(a!.left);
  // Thresh's heading holds the view switch, Leona's the role switch, their source lines wrap differently:
  // every part's row still sits level with the other champion's, and each group's headings too.
  const tops = () =>
    page.evaluate(() =>
      [1, 2].map((n) => {
        const view = document.querySelector(`[data-testid="lookup-panel"][data-panel="${n}"] [data-testid="lookup-builds-view"]`)!;
        const top = (el: Element | null) => (el ? Math.round(el.getBoundingClientRect().top) : null);
        return {
          parts: Object.fromEntries([...view.querySelectorAll('[data-testid="lookup-build-part"]')].map((r) => [r.getAttribute("data-part"), top(r)])),
          heads: [...view.querySelectorAll('[data-testid="lookup-build-head"]')].map(top),
          source: top(view.querySelector('[data-testid="lookup-build-source"]')),
        };
      }),
    );
  const level = async (where: string) => {
    const [one, two] = await tops();
    for (const p of ["runes", "shards", "spells", "skills", "start", "boots", "core"]) expect(Math.abs(one!.parts[p]! - two!.parts[p]!), `${where}: ${p} level in both columns`).toBeLessThanOrEqual(1);
    one!.heads.forEach((h, i) => expect(Math.abs(h! - two!.heads[i]!), `${where}: group ${i + 1}'s headings level`).toBeLessThanOrEqual(1));
    expect(Math.abs(one!.source! - two!.source!), `${where}: the source lines level`).toBeLessThanOrEqual(1);
  };
  await level("most common");
  // The other view changes Thresh's rows only: still level.
  await builds(page, 1).getByTestId("lookup-build-mode").getByRole("radio", { name: "Highest win rate" }).click();
  await expect(builds(page, 1)).toHaveAttribute("data-mode", "highest");
  await level("highest win rate");
  // Below the five abilities of their own column.
  const rBottom = await page.locator('[data-testid="lookup-panel"][data-panel="1"] [data-testid="lookup-ability"][data-slot="R"]').evaluate((e) => e.getBoundingClientRect().bottom);
  expect(a!.top).toBeGreaterThanOrEqual(rBottom - 1);
  await page.getByTestId("lookup-swap").click();
  await expect(page).toHaveURL(/champion=Leona&role=ADC&champion2=Thresh$/);
  await expect(builds(page, 1)).toHaveAttribute("data-role", "ADC");
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});

test("phones at 320 and 390, at 100% and 200% text: nothing wider than the phone, nothing scrolls inside, the role choices 44px targets", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the phone");
  test.setTimeout(120_000);
  for (const [width, height] of [[320, 568], [390, 844]] as const) {
    await page.setViewportSize({ width, height });
    for (const root of [100, 200]) {
      for (const path of ["/lookup?champion=Thresh", "/lookup?champion=Leona&champion2=Thresh"]) {
        await page.goto(path);
        await ready(page);
        await page.addStyleTag({ content: `html { font-size: ${root}% !important; }` });
        await page.evaluate(() => document.fonts.ready);
        const where = `${path} at ${width}px, ${root}%`;
        await expect.poll(() => overflow(page), { message: where }).toBeLessThanOrEqual(0);
        const wide = await page.getByTestId("lookup-builds-view").evaluateAll((els) => els.map((e) => e.scrollWidth - e.clientWidth));
        expect(wide.every((w) => w <= 1), where).toBe(true);
        expect(await scrollers(page), where).toBe(0);
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/lookup?champion=Leona");
  await ready(page);
  for (const h of await builds(page).getByTestId("lookup-build-role").getByRole("radio").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(44);
});

test("one champion with its builds still fits one screen at the desktop sizes, the sidebar open and folded", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "the desktop");
  test.setTimeout(120_000);
  for (const folded of [false, true]) {
    await context.clearCookies({ name: "uniiverse_sidebar" });
    if (folded) await context.addCookies([{ name: "uniiverse_sidebar", value: "collapsed", url: baseURL! }]);
    for (const [width, height] of [[1366, 768], [1440, 900], [1920, 1080], [2560, 1440]] as const) {
      await page.setViewportSize({ width, height });
      for (const champion of ["Thresh", "Leona"]) {
        await page.goto(`/lookup?champion=${champion}`);
        await expect(builds(page)).toHaveAttribute("data-status", "shown");
        const bottom = await page.getByTestId("lookup-board").evaluate((e) => e.getBoundingClientRect().bottom);
        expect(bottom, `${champion} at ${width} × ${height}${folded ? ", folded" : ""}`).toBeLessThanOrEqual(height);
        expect(await scrollers(page)).toBe(0);
      }
    }
  }
});

test("axe: the builds, single and compared, in both views", async ({ page }) => {
  await page.goto("/lookup?champion=Thresh&champion2=Leona");
  await ready(page);
  await expectNoSeriousAxe(page, "builds compared", ["[data-testid=lookup-builds]"]);
  await builds(page, 1).getByTestId("lookup-build-mode").getByRole("radio", { name: "Highest win rate" }).click();
  await expectNoSeriousAxe(page, "builds, highest win rate", ["[data-testid=lookup-builds]"]);
  await page.goto("/lookup?champion=Ahri");
  await ready(page);
  await expectNoSeriousAxe(page, "builds, too few games", ["[data-testid=lookup-builds]"]);
});
