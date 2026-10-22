import { devices, expect, test, type Browser, type BrowserContext, type Locator, type Page } from "./test";
import { choosePassword, createMember } from "./member-account";
import * as fs from "node:fs";
import * as path from "node:path";

/*
  A PLAYER CARD WITH EVERYTHING ON IT, ON BOTH ITS SIDES, AT EVERY SIZE. Reported more than once:
  taglines cut off, social icons crowding the name, names cut on narrow desktop cards, labels on
  top of each other, and the same on the substitute's side. This builds the hardest Top card a
  team can have: a starter with a long name in wide capitals, a 40-character tagline, all three
  links, an emblem and a frame, and a substitute with a long unspaced gamer tag, its own tagline
  and links, playing their Off Role. Then, on Team at desktop widths (five across and three across),
  a tablet, phones held either way and a small phone, on both sides of the card:
  - the name and the tagline are whole (never cut, never ellipsised) and inside the card;
  - no part of the card covers another: the role, the controls, the picture, the links, the name,
    the tagline and each label;
  - the links are full-size controls (a finger-sized target on touch screens), and using one neither
    turns the card nor opens it;
  - pointing at the turn control moves nothing (the substitute's side is already part of the card's
    height), and the turned card shows the substitute whole;
  - cards side by side keep their pictures, names and labels level: a name on two lines or a
    tagline that one player has never moves their card's parts off the others' (a name of three
    lines, five across, moves its own card's parts by that third line only).
  Set CARD_SHOTS to a folder to also save each card and page there (before/after comparisons).
*/

test.describe.configure({ timeout: 420_000 });
test.use({ actionTimeout: 30_000 });

const SHOTS = process.env.CARD_SHOTS ?? "";

type Role = "Top" | "Jungle" | "Mid" | "Bottom" | "Support";
type Who = { base: string; display: string; role: Role; offRole?: Role; tagline: string; emblem: string; nameStyle: string; frame: string };

const STARTER: Who = { base: "Valk", display: "Valkyrie of the Endless Twilight", role: "Top", tagline: "Unstoppable force meets immovable object", emblem: "star", nameStyle: "wide", frame: "premium" };
const SUB: Who = { base: "Shade", display: "XxShadowAssassinOfTheVoidxX2026", role: "Mid", offRole: "Top", tagline: "Main tank, part-time hero, full-time fan", emblem: "skull", nameStyle: "bold", frame: "glow" };

/** A member with everything a card can carry: links teammates see, a tagline, an emblem, a name style and a frame. */
async function makeMember(browser: Browser, admin: Page, who: Who): Promise<BrowserContext> {
  const { username, temporary } = await createMember(admin, who.base);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await choosePassword(page, username, temporary);
  const setup = page.getByTestId("setup-form");
  await setup.getByTestId("setup-display-name").fill(who.display);
  await setup.getByTestId("setup-continue").click();
  await setup.getByRole("radiogroup", { name: "Primary role" }).getByRole("button", { name: who.role }).click();
  if (who.offRole) {
    await setup.getByTestId("add-secondary-role").click();
    await setup.getByRole("radiogroup", { name: "Off role" }).getByRole("button", { name: who.offRole }).click();
  }
  await setup.getByTestId("primary-pool-toggle").click();
  await setup.getByTestId("primary-pool-results").getByRole("option").first().click();
  await page.keyboard.press("Escape");
  await setup.getByRole("button", { name: "Finish setup" }).click();
  await page.getByTestId("personalise-done").click();
  await expect(page.locator("aside").getByTestId("account-current-name")).toHaveText(who.display);
  await page.goto("/settings");
  const links = page.getByTestId("social-links-form");
  // Settings is drawn on the server: type the first link until the hydrated form has taken it.
  await expect(async () => {
    await links.getByLabel("YouTube", { exact: true }).fill(`youtube.com/@${who.base}Plays`);
    await expect(page.getByTestId("social-links-save")).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await links.getByLabel("Twitch", { exact: true }).fill(`${who.base.toLowerCase()}_live`);
  await links.getByLabel("Discord", { exact: true }).fill(`${who.base.toLowerCase()}.oce`);
  for (let i = 0; i < 3; i++) await links.getByLabel("Who can see it").nth(i).selectOption("team");
  await page.getByTestId("social-links-save").click();
  await expect(page.getByText("Social links saved.")).toBeVisible();
  await page.goto("/overview");
  await page.getByTestId("customise-card").first().click();
  const studio = page.getByTestId("card-studio");
  await studio.locator(`[role=radio][data-value="${who.frame}"]`).first().click();
  await page.getByTestId("studio-step-identity").click();
  await page.getByTestId("tagline-input").fill(who.tagline);
  await page.getByRole("radiogroup", { name: "Emblem" }).locator(`[data-value=${who.emblem}]`).click();
  await page.getByRole("radiogroup", { name: "Name style" }).locator(`[data-value=${who.nameStyle}]`).click();
  await page.getByTestId("save-card-style").click();
  await expect(studio).toBeHidden();
  return context;
}

/** Edit lineup: who starts at Top and who is its substitute (each chosen by name). */
async function setTop(admin: Page, starter: string, sub: string) {
  await admin.goto("/team");
  await expect(admin.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
  await admin.getByTestId("edit-lineup").click();
  if ((await admin.getByTestId("lineup-row-TOP").getAttribute("data-player-name")) !== starter) {
    await admin.getByTestId("lineup-change-TOP").click();
    const sheet = admin.getByTestId("lineup-sheet-TOP");
    await sheet.locator(`[data-testid=lineup-option][data-player-name="${starter}"]`).click();
    await sheet.getByTestId("lineup-sheet-save").click();
    await expect(sheet).toBeHidden();
  }
  await expect(admin.getByTestId("lineup-row-TOP")).toHaveAttribute("data-player-name", starter);
  if ((await admin.getByTestId("lineup-sub-TOP").getAttribute("data-player-name")) !== sub) {
    await admin.getByTestId("lineup-substitute-TOP").click();
    const sheet = admin.getByTestId("substitute-sheet-TOP");
    await sheet.locator(`[data-testid=substitute-option][data-player-name="${sub}"]`).click();
    await sheet.getByTestId("lineup-sheet-save").click();
    await expect(sheet).toBeHidden();
  }
  await expect(admin.getByTestId("lineup-sub-TOP")).toHaveAttribute("data-player-name", sub);
  await admin.getByTestId("edit-lineup").click();
}

const SIZES: Array<[string, Parameters<Browser["newContext"]>[0]]> = [
  ["1920", { viewport: { width: 1920, height: 1080 } }],
  ["1440", { viewport: { width: 1440, height: 900 } }],
  ["1366", { viewport: { width: 1366, height: 768 } }],
  ["1280", { viewport: { width: 1280, height: 800 } }],
  ["tablet-768", { viewport: { width: 768, height: 1024 }, hasTouch: true }],
  ["phone-390", { ...devices["iPhone 15"] }],
  ["phone-375", { ...devices["iPhone SE"] }],
  ["landscape-844", { ...devices["iPhone 15 landscape"] }],
];

/** The parts of a card side that must never cover each other. */
const PARTS = "[data-testid=assigned-role], [data-testid=customise-card], [data-testid=flip-to-substitute], [data-testid=flip-back], [data-avatar-frame], [data-testid=card-social], [data-testid=card-name], [data-testid=card-tagline], [data-testid=card-fit] > *";

/** One side of a card, measured: its name and tagline, what overlaps, what leaves the card, and its links' targets. */
async function measure(face: Locator) {
  return face.evaluate((card, selector) => {
    const box = (el: Element) => el.getBoundingClientRect();
    const c = box(card);
    const parts = [...card.querySelectorAll<HTMLElement>(selector)].filter((el) => box(el).width > 0);
    const label = (el: HTMLElement) => el.dataset.testid ?? (el.dataset.avatarFrame !== undefined ? "avatar" : el.tagName);
    const overlaps: string[] = [];
    for (let i = 0; i < parts.length; i++)
      for (let j = i + 1; j < parts.length; j++) {
        const [a, b] = [box(parts[i]!), box(parts[j]!)];
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) overlaps.push(`${label(parts[i]!)} × ${label(parts[j]!)}`);
      }
    const outside = parts.filter((el) => {
      const b = box(el);
      return b.left < c.left - 0.5 || b.right > c.right + 0.5 || b.top < c.top - 0.5 || b.bottom > c.bottom + 0.5;
    });
    const cut = (el: HTMLElement | null) => !!el && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
    const name = card.querySelector<HTMLElement>("[data-testid=card-name]");
    const tagline = card.querySelector<HTMLElement>("[data-testid=card-tagline]");
    const coarse = matchMedia("(pointer: coarse)").matches;
    // On a touch screen each icon's invisible margin (its ::after, drawn past its edges) adds to its target.
    const icons = [...card.querySelectorAll<HTMLElement>("[data-testid^=card-social-]")].map((el) => {
      const b = box(el);
      const reach = coarse ? -2 * (parseFloat(getComputedStyle(el, "::after").top) || 0) : 0;
      return { kind: el.dataset.kind, size: Math.round(Math.min(b.width, b.height)), target: Math.round(Math.min(b.width, b.height) + reach) };
    });
    return { name: name?.textContent ?? "", nameCut: cut(name), tagline: tagline?.textContent ?? "", taglineCut: cut(tagline), clipped: card.scrollHeight > card.clientHeight + 1, overlaps, outside: outside.map(label), icons, coarse };
  }, PARTS);
}

/** Everything that must hold for one side of the card at one size. */
function expectWhole(m: Awaited<ReturnType<typeof measure>>, who: Who, label: string) {
  expect(m.name, `${label}: the name`).toBe(who.display);
  expect(m.nameCut, `${label}: the name is whole`).toBe(false);
  expect(m.tagline, `${label}: the tagline`).toBe(`“${who.tagline}”`);
  expect(m.taglineCut, `${label}: the tagline is whole`).toBe(false);
  expect(m.clipped, `${label}: nothing is cut off the card`).toBe(false);
  expect(m.overlaps, `${label}: nothing covers anything else`).toEqual([]);
  expect(m.outside, `${label}: every part inside the card`).toEqual([]);
  expect(m.icons.map((i) => i.kind).sort(), `${label}: all three links`).toEqual(["discord", "twitch", "youtube"]);
  for (const icon of m.icons) {
    expect(icon.size, `${label}: ${icon.kind} drawn full size`).toBeGreaterThanOrEqual(28);
    if (m.coarse) expect(icon.target, `${label}: ${icon.kind} is a finger-sized target`).toBeGreaterThanOrEqual(44);
  }
}

/**
 * Each row of cards side by side: the tops of their labels, and of their pictures and names for
 * every card whose name takes at most two lines (the room kept for the others' names).
 */
async function levelRows(page: Page) {
  return page.locator("[data-testid^=lineup-row-]").evaluateAll((cards) => {
    const parts = cards.map((card) => {
      const top = (selector: string) => Math.round(card.querySelector(selector)!.getBoundingClientRect().top);
      const name = card.querySelector<HTMLElement>("[data-testid=card-name]")!;
      const line = parseFloat(getComputedStyle(name).lineHeight);
      const lines = Math.round(name.getBoundingClientRect().height / line);
      return { role: card.getAttribute("data-testid"), row: Math.round(card.getBoundingClientRect().top), avatar: top("[data-avatar-frame]"), name: top("[data-testid=card-name]"), labels: top("[data-testid=card-fit]"), lines, extra: Math.max(0, lines - 2) * line };
    });
    const spread = (values: number[]) => Math.max(...values) - Math.min(...values);
    return [...new Set(parts.map((p) => p.row))]
      .map((row) => parts.filter((p) => p.row === row))
      .filter((inRow) => inRow.filter((p) => p.lines <= 2).length > 1)
      .map((inRow) => {
        const level = inRow.filter((p) => p.lines <= 2);
        const [ref] = level;
        return {
          cards: inRow.map((p) => `${p.role}: ${p.lines} line(s)`).join(", "),
          labels: spread(level.map((p) => p.labels)),
          avatars: spread(level.map((p) => p.avatar)),
          names: spread(level.map((p) => p.name)),
          // A longer name moves its own card's parts by its extra lines, no more: its picture and name
          // up (the art keeps its height) or its labels down (the art grows).
          longer: inRow.filter((p) => p.lines > 2).map((p) => ({ role: p.role, extra: Math.round(p.extra), moved: Math.max(Math.abs(p.avatar - ref!.avatar), Math.abs(p.labels - ref!.labels)) })),
        };
      });
  });
}

/** The Team page at one size, its Top card in view (phones: through the role bar). */
async function openTop(browser: Browser, state: Awaited<ReturnType<BrowserContext["storageState"]>>, options: Parameters<Browser["newContext"]>[0]) {
  const ctx = await browser.newContext({ ...options, storageState: state });
  const page = await ctx.newPage();
  await page.goto("/team");
  await expect(page.getByTestId("lineup-overview")).toHaveAttribute("data-ready", "true");
  const pager = page.getByTestId("lineup-pager");
  if (await pager.isVisible()) await pager.getByRole("tab", { name: /^Top/ }).click();
  const front = page.getByTestId("lineup-row-TOP");
  await expect(front).toBeInViewport();
  return { ctx, page, front, card: page.getByTestId("lineup-card-TOP"), back: page.getByTestId("lineup-sub-TOP") };
}

async function shot(target: Page | Locator, name: string) {
  if (!SHOTS) return;
  const file = path.join(SHOTS, `${name}.png`);
  if ("goto" in target) await target.screenshot({ path: file, fullPage: true });
  else await target.screenshot({ path: file });
}

test("a Top card with everything on both sides: whole and uncovered at every size, its links its own", async ({ browser, page: admin, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "one lineup, checked at every size below");
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  await admin.context().addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  await admin.goto("/team");
  const before = { starter: (await admin.getByTestId("lineup-row-TOP").getAttribute("data-player-name"))!, sub: (await admin.getByTestId("lineup-sub-TOP").getAttribute("data-player-name"))! };
  // A retry runs on the same server, where the first attempt's members keep their names.
  const [topStarter, topSub] = [STARTER, SUB].map((who) => (info.retry ? { ...who, display: `${who.display} ${info.retry}` } : who)) as [Who, Who];
  const starter = await makeMember(browser, admin, topStarter);
  const sub = await makeMember(browser, admin, topSub);
  try {
    await setTop(admin, topStarter.display, topSub.display);
    const state = await admin.context().storageState();
    for (const [size, options] of SIZES) {
      const { ctx, page, front, card, back } = await openTop(browser, state, options);
      await shot(page, `team-${size}`);
      await shot(front, `card-TOP-${size}`);
      expectWhole(await measure(front), topStarter, `${size}, front`);
      await expect(front.getByTestId("main-role-badge")).toBeVisible();
      // Side by side (not the phone track), every row's parts are level.
      if (!(await page.getByTestId("lineup-pager").isVisible()))
        for (const row of await levelRows(page)) {
          expect({ labels: row.labels <= 1, avatars: row.avatars <= 1, names: row.names <= 1 }, `${size}: level along ${row.cards}`).toEqual({ labels: true, avatars: true, names: true });
          for (const long of row.longer) expect(long.moved, `${size}: ${long.role} moves by its extra lines (${long.extra}px) only`).toBeLessThanOrEqual(long.extra + 1);
        }

      // Pointing at the turn control (which readies the back's pictures) moves nothing.
      const still = await card.boundingBox();
      if (!options?.hasTouch) await front.getByTestId("flip-to-substitute").hover();
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      expect(await card.boundingBox(), `${size}: the card keeps its place and size`).toEqual(still);

      await front.getByTestId("flip-to-substitute").click();
      await expect(card).toHaveAttribute("data-flipped", "true");
      await expect(card).not.toHaveAttribute("data-turn", /.+/);
      await expect(back).toBeVisible();
      await shot(back, `card-TOP-sub-${size}`);
      expectWhole(await measure(back), topSub, `${size}, substitute`);
      await expect(back.getByTestId("off-role-badge")).toBeVisible();
      await expect(back.getByTestId("substitute-label")).toBeVisible();
      await ctx.close();
    }

    // A link is a control of its own: it opens in a new tab, and the card neither turns nor opens.
    for (const options of [SIZES[1]![1], SIZES[5]![1]]) {
      const { ctx, page, front, card } = await openTop(browser, state, options);
      const youtube = front.getByTestId("card-social-youtube");
      await expect(youtube).toHaveAttribute("href", "https://www.youtube.com/@ValkPlays");
      const [tab] = await Promise.all([ctx.waitForEvent("page"), options?.hasTouch ? youtube.tap() : youtube.click()]);
      await tab.close();
      await expect(card).not.toHaveAttribute("data-flipped", "true");
      await expect(page.getByTestId("player-detail")).toBeHidden();
      await ctx.close();
    }

    // The starter's own card adds Customise beside the turn control: five across the two stand one
    // above the other, and the links keep clear of both.
    for (const [size, options] of [SIZES[2]!, SIZES[1]!]) {
      const { ctx, front } = await openTop(browser, await starter.storageState(), options);
      await expect(front.getByTestId("customise-card")).toBeVisible();
      await expect(front.getByTestId("card-you")).toBeVisible();
      await shot(front, `card-TOP-own-${size}`);
      expectWhole(await measure(front), topStarter, `${size}, own card`);
      await ctx.close();
    }

    // For the comparison only: the same identity on Players, the public page and the Card Studio's preview.
    if (SHOTS)
      for (const [size, options] of [SIZES[1]!, SIZES[5]!]) {
        const ctx = await browser.newContext({ ...options, storageState: state });
        const page = await ctx.newPage();
        await page.goto("/players");
        await shot(page, `players-${size}`);
        await ctx.close();
        const guest = await browser.newContext({ ...options });
        const gp = await guest.newPage();
        await gp.goto("/public");
        await shot(gp, `public-${size}`);
        await guest.close();
        const own = await browser.newContext({ ...options, storageState: await starter.storageState() });
        const op = await own.newPage();
        await op.goto("/overview");
        await op.getByTestId("customise-card").first().click();
        await expect(op.getByTestId("card-preview")).toBeVisible();
        await op.screenshot({ path: path.join(SHOTS, `studio-${size}.png`) });
        await own.close();
      }
  } finally {
    // Later tests share the demo roster: Top's starter and substitute go back.
    await setTop(admin, before.starter, before.sub);
    await starter.close();
    await sub.close();
  }
});
