import { expect, test, type Page } from "./test";
import { widenText } from "./wide-text";
import { expectNoSeriousAxe } from "./axe";
import { optionsOf, pick, shownLabel, valueOf } from "./select";

/*
  CHAMPION INTEL's builds and runes (docs/CHAMPION_INTEL.md, "Builds and runes"), on the demo's
  builds fixture (server/demo/builds-fixture.ts; Data Dragon pinned at 16.22.1, so the current patch
  is 26.22 and the previous 26.21), each queue counted on its own (D5): Thresh in support in Ranked
  Solo/Duo with a most common build and a less common one of 20 games and 16 wins that is never
  shown as the "Highest win rate" (D6), and too few in Ranked Flex; Nasus in top with one build;
  Leona in support on the previous patch too; and the honest "not enough games" line for a champion
  with too few (Ahri). Compact icon rows with their win and pick rates, each win rate's likely range
  in its ⓘ (greyed from fewer than 30 games), the queue choice (Ranked Solo/Duo by default, the
  page's, in the address), another queue offered (never switched to by itself), the source line and
  each ⓘ in plain words, Compare's aligned builds row, phones with nothing wider than the screen,
  the single desktop view on one screen, no player's identity anywhere, and axe. The "Highest win
  rate" view and a role choice between two roles are the Master+ demo's (the "Master+ source" tests
  below): an honest rule rarely finds one in the team's sample sizes.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const builds = (page: Page, n: 1 | 2 = 1) => page.locator(`[data-testid="lookup-panel"][data-panel="${n}"] [data-testid="lookup-builds-view"]`);
const part = (page: Page, name: string, n: 1 | 2 = 1) => builds(page, n).locator(`[data-testid="lookup-build-part"][data-part="${name}"]`);
const queue = (page: Page, n: 1 | 2 = 1) => builds(page, n).getByTestId("lookup-build-queue");
const ready = (page: Page) => expect(page.getByTestId("lookup-view")).toHaveAttribute("data-ready", "true");
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const scrollers = (page: Page) => page.evaluate(() => [...document.querySelectorAll("main *")].filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1).length);
const PARTS = ["runes", "shards", "spells", "skills", "start", "boots", "core", "full"];
/** A layout measure keeps this much room, so text a little wider (CI's browser) never flips it. */
const MARGIN = 12;

test("a champion with enough games: its builds and runes as icon rows, each with its win and pick rate, the source line said in full, Ranked Solo/Duo by default", async ({ page }) => {
  await page.goto("/lookup?champion=Thresh");
  await ready(page);
  const view = builds(page);
  await expect(view).toHaveAttribute("data-status", "shown");
  await expect(view).toHaveAttribute("data-role", "SUPPORT");
  await expect(view).toHaveAttribute("data-queue", "solo");
  await expect(view).toHaveAttribute("data-source", "team");
  await expect(view.getByRole("heading", { name: "Builds and runes" })).toBeVisible();
  // The queue: Ranked Solo/Duo, the default, so the address names none.
  expect(await valueOf(queue(page))).toBe("solo");
  expect(await shownLabel(queue(page))).toBe("Ranked Solo/Duo");
  await expect(queue(page)).toHaveAccessibleName("Thresh's builds: queue");
  expect(new URL(page.url()).searchParams.has("queue")).toBe(false);
  // One role: named, no switch.
  await expect(view.getByTestId("lookup-build-one-role")).toHaveText("Support");
  await expect(view.getByTestId("lookup-build-role")).toHaveCount(0);
  await expect(view.getByTestId("lookup-build-source")).toHaveAttribute("data-line", /^From \d+ games in the team's matches · patch 26\.22 · all ranks$/);
  // The visible words are the line's (each part opening its own ⓘ).
  expect((await view.getByTestId("lookup-build-source").locator("button").allInnerTexts()).join(" ")).toMatch(/^From \d+ games in the team's matches patch 26\.22 all ranks$/);
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
    // Its record for the Production check: the games, wins, part total and family (ids only).
    for (const attr of ["data-games", "data-wins", "data-total", "data-key"]) await expect(part(page, name), `${name} ${attr}`).toHaveAttribute(attr, /\S/);
  }
  // Totals only: no player's identity or game anywhere in the page.
  expect(await page.content()).not.toMatch(/demo-filler|demo-lane|demo-together|demo-regular|DEMO_[A-Za-z0-9]/);
});

test("each ⓘ says one thing in plain words, every win rate with its likely range, by keyboard and by touch", async ({ page }, info) => {
  await page.goto("/lookup?champion=Thresh");
  await ready(page);
  const win = part(page, "spells").getByTestId("lookup-build-win");
  if (info.project.name === "phone") await win.tap();
  else await win.focus();
  await expect(page.getByTestId("lookup-build-win-bubble")).toHaveText(/^Won \d+% of \d+ games with these summoner spells, likely \d{1,3}–\d{1,3}%\. \d+% of \d+ games with summoner spells recorded made it\.$/);
  if (info.project.name === "phone") await page.mouse.click(5, 5);
  else await win.blur();
  // Counted by keystone and secondary tree (the page shown is their commonest), said so: never "this rune page".
  const rune = part(page, "runes").getByTestId("lookup-build-win");
  if (info.project.name === "phone") await rune.tap();
  else await rune.focus();
  await expect(page.getByTestId("lookup-build-win-bubble")).toHaveText(/^Won \d+% of \d+ games with this keystone and secondary tree, likely \d{1,3}–\d{1,3}%\. \d+% of \d+ games with a full rune page recorded made it\.$/);
  if (info.project.name === "phone") await page.mouse.click(5, 5);
  else await rune.blur();
  const where = builds(page).getByTestId("lookup-build-where");
  if (info.project.name === "phone") await where.tap();
  else await where.focus();
  await expect(page.getByTestId("lookup-build-where-bubble")).toHaveText("Counted from the games of the team's stored matches (both teams). Not a global sample of League players.");
  if (info.project.name === "phone") await page.mouse.click(5, 5);
  if (info.project.name !== "phone") {
    await builds(page).getByTestId("lookup-build-ranks").focus();
    await expect(page.getByTestId("lookup-build-ranks-bubble")).toHaveText("Riot's game records hold no rank, so these games are not filtered by rank.");
    await builds(page).getByTestId("lookup-build-patch").focus();
    await expect(page.getByTestId("lookup-build-patch-bubble")).toHaveText("Only games on the current patch, 26.22.");
    await builds(page).getByTestId("lookup-build-queue-tip").focus();
    await expect(page.getByTestId("lookup-build-queue-tip-bubble")).toHaveText("Each queue is counted on its own and never mixed. Swiftplay, Quickplay, Blind Pick and ARAM are not counted.");
    await builds(page).getByTestId("lookup-build-win-head").focus();
    await expect(page.getByTestId("lookup-build-win-head-bubble")).toHaveText("Win rates from fewer than 30 games are greyed: they swing a lot. Each one's ⓘ gives its likely range.");
  }
});

test("a win rate from fewer than 30 games is greyed and said to be a small sample; one from 30 or more is a figure", async ({ page }) => {
  await page.goto("/lookup?champion=Thresh");
  await ready(page);
  const cell = (name: string) => part(page, name).locator("[data-firm]");
  // Every Solo/Duo game records the spells (50): firm. The core items (fewer, with a timeline and known items): under 30, greyed.
  for (const name of PARTS.filter((p) => p !== "full")) {
    const games = Number(await part(page, name).getAttribute("data-games"));
    const firm = games >= 30;
    await expect(cell(name), name).toHaveAttribute("data-firm", firm ? "true" : "false");
    const look = await cell(name).evaluate((e) => ({ subtle: e.classList.contains("text-fg-subtle"), strong: e.classList.contains("text-fg") && e.classList.contains("font-semibold"), said: e.textContent ?? "" }));
    expect(look.subtle, name).toBe(!firm);
    expect(look.strong, name).toBe(firm);
    expect(look.said.includes("(small sample)"), name).toBe(!firm);
  }
  await expect(cell("spells")).toHaveAttribute("data-firm", "true");
  await expect(cell("core")).toHaveAttribute("data-firm", "false");
});

test("a less common build of 20 games that won 16 is shown as a choice with its win rate, never as the highest win rate (D6)", async ({ page }) => {
  await page.goto("/lookup?champion=Thresh");
  await ready(page);
  const view = builds(page);
  // No part has a choice that won clearly more from 30 games or more: no "Highest win rate" view.
  await expect(view.getByTestId("lookup-build-mode")).toHaveCount(0);
  await expect(view).toHaveAttribute("data-mode", "common");
  for (const name of PARTS) await expect(part(page, name), name).toHaveAttribute("data-choice", "common");
  // One build where the two agree: no second view either.
  await page.goto("/lookup?champion=Nasus");
  await ready(page);
  await expect(builds(page)).toHaveAttribute("data-status", "shown");
  await expect(builds(page).getByTestId("lookup-build-mode")).toHaveCount(0);
});

test("the queue is chosen here, with no request: Ranked Flex says it has too few games and offers Ranked Solo/Duo, never switching by itself; the address and a reload keep it", async ({ page }) => {
  await page.goto("/lookup?champion=Thresh");
  await ready(page);
  const requests: string[] = [];
  page.on("request", (r) => {
    // A page load, or the page's own data from the server (a React Server Components request for /lookup).
    if (r.resourceType() === "document" || new URL(r.url()).pathname.startsWith("/lookup")) requests.push(r.url());
  });
  await pick(queue(page), "flex");
  const view = builds(page);
  await expect(view).toHaveAttribute("data-queue", "flex");
  await expect(view).toHaveAttribute("data-status", "few");
  await expect(view.getByTestId("lookup-build-few")).toHaveText("Not enough Ranked Flex games on patch 26.22 in the team's matches yet");
  await expect(page).toHaveURL(/[?&]champion=Thresh&queue=flex$/);
  // Every queue's counts came with the page: choosing one asked the server nothing.
  expect(requests).toEqual([]);
  // The offer names the queue that has builds, with its games in the role; it is a choice, not a switch.
  const offer = view.getByTestId("lookup-build-other-queue");
  await expect(offer).toHaveText(/^Show Ranked Solo\/Duo \(\d+ games as Support\)$/);
  await expect(offer).toHaveAttribute("data-queue", "solo");
  await view.getByTestId("lookup-build-few-tip").focus();
  await expect(page.getByTestId("lookup-build-few-tip-bubble")).toHaveText("Builds need 20 games in one role and queue. The team's Ranked Flex games have 18 as Support on this patch and the one before.");
  // A reload opens the same queue.
  await page.reload();
  await ready(page);
  await expect(builds(page)).toHaveAttribute("data-queue", "flex");
  expect(await valueOf(queue(page))).toBe("flex");
  // The offer, pressed: Solo/Duo's builds, the address without a queue, and the focus on the queue choice (the offer is gone).
  await builds(page).getByTestId("lookup-build-other-queue").click();
  await expect(builds(page)).toHaveAttribute("data-queue", "solo");
  await expect(builds(page)).toHaveAttribute("data-status", "shown");
  await expect(page).toHaveURL(/[?&]champion=Thresh$/);
  await expect(queue(page)).toBeFocused();
  // An unknown queue in the address is Ranked Solo/Duo.
  await page.goto("/lookup?champion=Thresh&queue=aram");
  await ready(page);
  await expect(builds(page)).toHaveAttribute("data-queue", "solo");
  await expect(page).toHaveURL(/[?&]champion=Thresh$/);
});

test("too few games: one honest line naming the queue, never a made-up build, and no offer where no other queue has builds", async ({ page }) => {
  await page.goto("/lookup?champion=Ahri");
  await ready(page);
  await expect(builds(page)).toHaveAttribute("data-status", "few");
  await expect(builds(page)).toHaveAttribute("data-queue", "solo");
  await expect(builds(page).getByTestId("lookup-build-few")).toHaveText("Not enough Ranked Solo/Duo games on patch 26.22 in the team's matches yet");
  await expect(builds(page).getByTestId("lookup-build-part")).toHaveCount(0);
  await expect(builds(page).getByTestId("lookup-build-other-queue")).toHaveCount(0);
});

test("the previous patch added is said; a role the champion has too few games in opens its default", async ({ page }) => {
  await page.goto("/lookup?champion=Leona");
  await ready(page);
  const view = builds(page);
  await expect(view).toHaveAttribute("data-status", "shown");
  await expect(view.getByTestId("lookup-build-source")).toHaveAttribute("data-line", /· patches 26\.21–26\.22 ·/);
  await expect(view).toHaveAttribute("data-roles", /^SUPPORT:\d+$/);
  await page.goto("/lookup?champion=Leona&role=JUNGLE");
  await ready(page);
  await expect(builds(page)).toHaveAttribute("data-role", "SUPPORT");
});

test("Compare: each champion's builds after R, side by side and level part by part (whatever each heading holds); both columns read the page's queue, and Swap keeps it", async ({ page }, info) => {
  // Side by side from a 390px phone (the phone project's 375px stacks the two columns).
  if (info.project.name === "phone") await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/lookup?champion=Thresh&champion2=Leona");
  await ready(page);
  await expect(builds(page, 1)).toHaveAttribute("data-status", "shown");
  await expect(builds(page, 2)).toHaveAttribute("data-status", "shown");
  const slots = page.getByTestId("lookup-builds");
  await expect(slots).toHaveCount(2);
  const [a, b] = await slots.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ top: Math.round(r.top), height: Math.round(r.height), left: Math.round(r.left) })));
  expect(Math.abs(a!.top - b!.top), "the two builds rows level").toBeLessThanOrEqual(1);
  expect(Math.abs(a!.height - b!.height), "the two builds rows the same height").toBeLessThanOrEqual(1);
  expect(b!.left).toBeGreaterThan(a!.left);
  // Thresh's source line names one patch, Leona's two (widened), their lines wrap differently:
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
  const [one, two] = await tops();
  for (const p of ["runes", "shards", "spells", "skills", "start", "boots", "core"]) expect(Math.abs(one!.parts[p]! - two!.parts[p]!), `${p} level in both columns`).toBeLessThanOrEqual(1);
  one!.heads.forEach((h, i) => expect(Math.abs(h! - two!.heads[i]!), `group ${i + 1}'s headings level`).toBeLessThanOrEqual(1));
  expect(Math.abs(one!.source! - two!.source!), "the source lines level").toBeLessThanOrEqual(1);
  // Below the five abilities of their own column.
  const rBottom = await page.locator('[data-testid="lookup-panel"][data-panel="1"] [data-testid="lookup-ability"][data-slot="R"]').evaluate((e) => e.getBoundingClientRect().bottom);
  expect(a!.top).toBeGreaterThanOrEqual(rBottom - 1);
  // The queue is the page's: chosen in either column, both read it (one population side by side).
  for (const n of [1, 2] as const) await expect(builds(page, n)).toHaveAttribute("data-queue", "solo");
  await pick(queue(page, 2), "flex");
  for (const n of [1, 2] as const) await expect(builds(page, n)).toHaveAttribute("data-queue", "flex");
  expect(await valueOf(queue(page, 1))).toBe("flex");
  await expect(page).toHaveURL(/champion=Thresh&champion2=Leona&queue=flex$/);
  // Swap keeps the queue, each champion's role with it.
  await page.getByTestId("lookup-swap").click();
  await expect(page).toHaveURL(/champion=Leona&champion2=Thresh&queue=flex$/);
  await expect(builds(page, 1)).toHaveAttribute("data-queue", "flex");
  await expect(page.locator('[data-testid="lookup-panel"][data-panel="1"]')).toHaveAttribute("data-champion", "Leona");
  // ✕ keeps it too.
  await page.locator('[data-testid="lookup-panel"][data-panel="2"] [data-testid="lookup-remove"]').click();
  await expect(page).toHaveURL(/\/lookup\?champion=Leona&queue=flex$/);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});

test("phones at 320 and 390, at 100% and 200% text: nothing wider than the phone, nothing scrolls inside, the queue choice and the offer 44px targets", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the phone");
  test.setTimeout(150_000);
  for (const [width, height] of [[320, 568], [390, 844]] as const) {
    await page.setViewportSize({ width, height });
    for (const root of [100, 200]) {
      for (const path of ["/lookup?champion=Thresh", "/lookup?champion=Leona&champion2=Thresh", "/lookup?champion=Thresh&champion2=Leona&queue=flex"]) {
        await page.goto(path);
        await ready(page);
        await page.addStyleTag({ content: `html { font-size: ${root}% !important; }` });
        await page.evaluate(() => document.fonts.ready);
        const where = `${path} at ${width}px, ${root}%`;
        await expect.poll(() => overflow(page), { message: where }).toBeLessThanOrEqual(0);
        const wide = await page.getByTestId("lookup-builds-view").evaluateAll((els) => els.map((e) => e.scrollWidth - e.clientWidth));
        expect(wide.every((w) => w <= 1), where).toBe(true);
        // Nothing in a builds section reaches past its column (the offer's words wrap).
        const past = await page.getByTestId("lookup-builds-view").evaluateAll((els) => els.flatMap((s) => { const box = s.getBoundingClientRect(); return [...s.querySelectorAll("button, select, p")].filter((e) => e.getBoundingClientRect().right > box.right + 1).map((e) => e.textContent?.slice(0, 30)); }));
        expect(past, where).toEqual([]);
        expect(await scrollers(page), where).toBe(0);
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/lookup?champion=Thresh&queue=flex");
  await ready(page);
  // The phone's own picker below 768px: the browser's select, a 44px target.
  expect(await queue(page).evaluate((e) => e.tagName)).toBe("SELECT");
  for (const el of [queue(page), builds(page).getByTestId("lookup-build-other-queue")]) expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await pick(queue(page), "solo");
  await expect(builds(page)).toHaveAttribute("data-status", "shown");
});

test("one champion with its builds still fits one screen at the desktop sizes with room to spare, the sidebar open and folded, and with CI's wider text", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "the desktop");
  test.setTimeout(180_000);
  // Release 19: the board ends at least 12px above the window, and a last pass at 1366 × 768 with CI's wider text (e2e/wide-text.ts):
  // "Pick rate", "Health regen per 5 s" and the skill order's caption wrapped there with text 2% wider, and the board ran past.
  for (const pass of ["open", "folded", "wide-open", "wide-folded"] as const) {
    const folded = pass.endsWith("folded");
    if (pass === "wide-open") await widenText(page);
    await context.clearCookies({ name: "uniiverse_sidebar" });
    if (folded) await context.addCookies([{ name: "uniiverse_sidebar", value: "collapsed", url: baseURL! }]);
    const sizes = pass.startsWith("wide") ? ([[1366, 768]] as const) : ([[1366, 768], [1440, 900], [1920, 1080], [2560, 1440]] as const);
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      for (const champion of ["Thresh", "Leona"]) {
        await page.goto(`/lookup?champion=${champion}`);
        await expect(builds(page)).toHaveAttribute("data-status", "shown");
        await page.evaluate(() => document.fonts.ready);
        const bottom = await page.getByTestId("lookup-board").evaluate((e) => e.getBoundingClientRect().bottom);
        expect(height - bottom, `${champion} at ${width} × ${height}, ${pass}: room under the board`).toBeGreaterThanOrEqual(MARGIN);
        expect(await scrollers(page)).toBe(0);
        // The figures' headings on one line each (they wrapped in their 3.25rem columns with wider text).
        const heads = await builds(page).getByTestId("lookup-build-head").locator("[role=columnheader]").evaluateAll((els) => els.filter((e) => e.getClientRects().length > 0 && /rate/i.test(e.textContent ?? "")).map((e) => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight))));
        expect(heads.every((lines) => lines <= 1), `${champion} at ${width} × ${height}, ${pass}: "Win rate" and "Pick rate" on one line`).toBe(true);
      }
    }
  }
});

test("axe: the builds, single and compared, a queue with too few games and its offer", async ({ page }) => {
  await page.goto("/lookup?champion=Thresh&champion2=Leona");
  await ready(page);
  await expectNoSeriousAxe(page, "builds compared", ["[data-testid=lookup-builds]"]);
  await page.goto("/lookup?champion=Thresh&champion2=Leona&queue=flex");
  await ready(page);
  await expectNoSeriousAxe(page, "builds compared, too few in Ranked Flex", ["[data-testid=lookup-builds]"]);
  await page.goto("/lookup?champion=Ahri");
  await ready(page);
  await expectNoSeriousAxe(page, "builds, too few games", ["[data-testid=lookup-builds]"]);
});

/*
  The Master+ source (docs/HIGH_ELO_EVIDENCE.md): prepared and switched off, so production offers
  none. The browser tests' cookie shows the in-memory demo's synthetic counts (server/demo/high-elo.ts,
  made by the sampler's own code): Thresh in support with a choice that won clearly more (the
  "Highest win rate" view, its marks and its full build), Leona in two roles, Nasus too few once
  weighted, Ahri none.
*/
test.describe("Master+ source", () => {
  const MASTER_COOKIE = "uniiverse-test-high-elo";
  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([{ name: MASTER_COOKIE, value: "on", url: baseURL! }]);
  });

  test("not offered without collection (the cookie absent): the four queues only", async ({ page, context }) => {
    await context.clearCookies({ name: MASTER_COOKIE });
    await page.goto("/lookup?champion=Thresh&source=master");
    await ready(page);
    await expect(builds(page)).toHaveAttribute("data-source", "team");
    expect((await optionsOf(queue(page))).map((o) => o.value)).toEqual(["solo", "flex", "draft", "clash"]);
    await expect(page).toHaveURL(/[?&]champion=Thresh$/);
  });

  test("chosen in the queue choice: anonymous counts apart from the team's, weighted, said so, in the address", async ({ page }) => {
    await page.goto("/lookup?champion=Thresh");
    await ready(page);
    const options = await optionsOf(queue(page));
    expect(options.map((o) => o.value)).toEqual(["solo", "flex", "draft", "clash", "master"]);
    expect(options.at(-1)!.label).toBe("Ranked Solo/Duo · all regions");
    await pick(queue(page), "master");
    const view = builds(page);
    await expect(view).toHaveAttribute("data-source", "master");
    await expect(view).toHaveAttribute("data-queue", "solo");
    await expect(page).toHaveURL(/[?&]champion=Thresh&source=master$/);
    await expect(view.getByTestId("lookup-build-source")).toHaveAttribute("data-line", /^From \d[\d,]* Master\+ games · all regions · patch 26\.22$/);
    const observed = Number(await view.getByTestId("lookup-build-source").getAttribute("data-observed"));
    const games = Number(await view.getByTestId("lookup-build-source").getAttribute("data-games"));
    expect(observed).toBeGreaterThan(games);
    await view.getByTestId("lookup-build-games").focus();
    await expect(page.getByTestId("lookup-build-games-bubble")).toHaveText(/^[\d,]+ games observed, worth [\d,]+ as a sample once weighted: figures and thresholds use [\d,]+\.$/);
    await view.getByTestId("lookup-build-where").focus();
    await expect(page.getByTestId("lookup-build-where-bubble")).toContainText("No player is stored.");
    // No "all ranks" (the tier is in the name), no player anywhere.
    await expect(view.getByTestId("lookup-build-ranks")).toHaveCount(0);
    expect(await page.content()).not.toMatch(/-player-|demo-filler|DEMO_[A-Za-z0-9]/);
    // A reload keeps it; the team's queue again drops it from the address.
    await page.reload();
    await ready(page);
    await expect(builds(page)).toHaveAttribute("data-source", "master");
    await pick(queue(page), "solo");
    await expect(builds(page)).toHaveAttribute("data-source", "team");
    await expect(page).toHaveURL(/[?&]champion=Thresh$/);
  });

  test("the highest win rate is another view, offered where a common choice won clearly more; the rows that differ are marked, the full build after its core", async ({ page }) => {
    await page.goto("/lookup?champion=Thresh&source=master");
    await ready(page);
    const view = builds(page);
    const mode = view.getByTestId("lookup-build-mode");
    await expect(mode.getByRole("radio", { name: "Most common" })).toHaveAttribute("aria-checked", "true");
    const before = await part(page, "core").getByTestId("lookup-build-choice").locator("img").evaluateAll((els) => els.map((e) => e.getAttribute("alt")));
    await mode.getByRole("radio", { name: "Highest win rate" }).click();
    await expect(view).toHaveAttribute("data-mode", "highest");
    for (const name of ["runes", "boots", "core", "full"]) await expect(part(page, name), name).toHaveAttribute("data-choice", "highest");
    await expect(part(page, "spells")).toHaveAttribute("data-choice", "common");
    const after = await part(page, "core").getByTestId("lookup-build-choice").locator("img").evaluateAll((els) => els.map((e) => e.getAttribute("alt")));
    expect(after).not.toEqual(before);
    // Never a small sample: from 30 games or more (effective), the most common's counts beside it.
    for (const name of ["runes", "boots", "core"]) {
      expect(Number(await part(page, name).getAttribute("data-games")), name).toBeGreaterThanOrEqual(30);
      await expect(part(page, name), name).toHaveAttribute("data-common-games", /^\d+$/);
    }
    await view.getByTestId("lookup-build-win-head").first().focus();
    await expect(page.getByTestId("lookup-build-win-head-bubble")).toContainText("likely range");
    await view.locator('[data-testid="lookup-build-head"]').first().getByRole("button", { name: "Highest win rate" }).focus();
    await expect(page.getByTestId("info-tip-bubble")).toHaveText("Among choices of 30 games or more, one that won clearly more than the most common, 99% sure not by chance. Shown only then.");
    const fullTip = part(page, "full").getByTestId("lookup-build-full");
    await fullTip.focus();
    await expect(page.getByTestId("lookup-build-full-bubble")).toHaveText(/^The core items with the highest win rate, then /);
    await fullTip.blur();
    await mode.getByRole("radio", { name: "Most common" }).click();
    await expect(view).toHaveAttribute("data-mode", "common");
  });

  test("two roles: the role is chosen here, kept in the address with the source, the default left out", async ({ page }) => {
    await page.goto("/lookup?champion=Leona&source=master");
    await ready(page);
    const view = builds(page);
    const roles = view.getByTestId("lookup-build-role");
    await expect(roles.getByRole("radio")).toHaveCount(2);
    await expect(roles.getByRole("radio", { name: /Support/ })).toHaveAttribute("aria-checked", "true");
    await roles.getByRole("radio", { name: /Bottom/ }).click();
    await expect(view).toHaveAttribute("data-role", "ADC");
    await expect(page).toHaveURL(/[?&]champion=Leona&role=ADC&source=master$/);
    await page.reload();
    await ready(page);
    await expect(builds(page)).toHaveAttribute("data-role", "ADC");
    await builds(page).getByTestId("lookup-build-role").getByRole("radio", { name: /Support/ }).click();
    await expect(page).toHaveURL(/[?&]champion=Leona&source=master$/);
    if ((await page.viewportSize())!.width >= 768) return;
    for (const h of await builds(page).getByTestId("lookup-build-role").getByRole("radio").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(44);
  });

  test("too few once weighted, or none counted yet: said in words, with no offer of the team's queues", async ({ page }) => {
    await page.goto("/lookup?champion=Nasus&source=master");
    await ready(page);
    await expect(builds(page)).toHaveAttribute("data-status", "few");
    await expect(builds(page).getByTestId("lookup-build-few")).toHaveText("Not enough Master+ games on patch 26.22 yet");
    await expect(builds(page).getByTestId("lookup-build-other-queue")).toHaveCount(0);
    await page.goto("/lookup?champion=Ahri&source=master");
    await ready(page);
    await expect(builds(page).getByTestId("lookup-build-few")).toHaveText("No Master+ games counted on patch 26.22 yet");
  });

  test("Compare: both columns on the Master+ source, every part's row level in both views", async ({ page }, info) => {
    if (info.project.name === "phone") await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/lookup?champion=Thresh&champion2=Leona&source=master");
    await ready(page);
    for (const n of [1, 2] as const) await expect(builds(page, n)).toHaveAttribute("data-source", "master");
    const level = async (where: string) => {
      const tops = await page.evaluate(() => [1, 2].map((n) => Object.fromEntries([...document.querySelectorAll(`[data-testid="lookup-panel"][data-panel="${n}"] [data-testid="lookup-build-part"]`)].map((r) => [r.getAttribute("data-part"), Math.round(r.getBoundingClientRect().top)]))));
      for (const p of ["runes", "shards", "spells", "skills", "start", "boots", "core"]) expect(Math.abs(tops[0]![p]! - tops[1]![p]!), `${where}: ${p}`).toBeLessThanOrEqual(1);
    };
    await level("most common");
    await builds(page, 1).getByTestId("lookup-build-mode").getByRole("radio", { name: "Highest win rate" }).click();
    await expect(builds(page, 1)).toHaveAttribute("data-mode", "highest");
    await level("highest win rate");
    await page.getByTestId("lookup-swap").click();
    await expect(page).toHaveURL(/champion=Leona&champion2=Thresh&source=master$/);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });

  test("axe: the Master+ source, compared, in both views", async ({ page }) => {
    await page.goto("/lookup?champion=Thresh&champion2=Leona&source=master");
    await ready(page);
    await expectNoSeriousAxe(page, "Master+ builds compared", ["[data-testid=lookup-builds]"]);
    await builds(page, 1).getByTestId("lookup-build-mode").getByRole("radio", { name: "Highest win rate" }).click();
    await expectNoSeriousAxe(page, "Master+ builds, highest win rate", ["[data-testid=lookup-builds]"]);
  });
});
