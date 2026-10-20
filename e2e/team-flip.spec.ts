import { expect, test, type CDPSession, type Locator, type Page } from "@playwright/test";
import { memberContext } from "./member-account";

/*
  Team Overview: a starter's card turns over (a 3D turn) to the role's one designated substitute,
  on the same card parts; a role without one has no turn control at all. The turned card works
  like the front: it opens the substitute's details without turning back. Turning is a preview:
  nothing is saved, nothing is fetched, a reload shows the saved lineup, and it works for anyone
  who can see the page. In Edit lineup a manager chooses, replaces or removes each role's
  substitute (Sub), and Start on the back swaps them; turning back is the cancel.
  Phones: a tap turns a card, a sideways swipe only scrolls the track. Reduced motion: no rotation.
  The demo roster is shared by the whole run, so the tests read who is where from the page.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1000) < 500;
const card = (page: Page, role: string) => page.getByTestId(`lineup-card-${role}`);
const flipButton = (page: Page, role: string) => card(page, role).getByTestId("flip-to-substitute");
/** The Team page once it is interactive (the cards are server-rendered before their handlers attach). */
const openTeam = (page: Page) => page.goto("/team", { waitUntil: "networkidle" });
const turnOver = async (page: Page, role: string) => {
  await expect(async () => {
    if (!(await card(page, role).getAttribute("data-flipped"))) await flipButton(page, role).click({ timeout: 2000 });
    await expect(card(page, role)).toHaveAttribute("data-flipped", "true", { timeout: 1000 });
  }).toPass();
};
/** A role whose card has a substitute (the demo gives Top and Support one). */
const withSubstitute = async (page: Page) => {
  for (const role of ["TOP", "SUPPORT", "MID", "ADC", "JUNGLE"]) if ((await flipButton(page, role).count()) > 0) return role;
  throw new Error("no role with a substitute in the demo roster");
};
const box = async (l: Locator) => {
  const b = (await l.boundingBox())!;
  return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
};
/** Same size and place, give or take the cards' 4px entrance rise and subpixel rounding. */
const expectSameBox = (a: Awaited<ReturnType<typeof box>>, b: Awaited<ReturnType<typeof box>>) => {
  for (const k of ["x", "y", "w", "h"] as const) expect(Math.abs(a[k] - b[k]), `${k}: ${a[k]} vs ${b[k]}`).toBeLessThanOrEqual(2);
};

test("a card turns over to a substitute on the same card, and back to the starter, without saving or fetching anything", async ({ page }) => {
  test.skip(isPhone(page), "the phone has its own test");
  await openTeam(page);
  const role = await withSubstitute(page);
  const front = page.getByTestId(`lineup-row-${role}`);
  const starter = await front.getAttribute("data-player-id");
  const frontBox = await box(front);
  const requests: string[] = [];
  page.on("request", (r) => ["fetch", "xhr", "document"].includes(r.resourceType()) && requests.push(r.url()));

  await turnOver(page, role);
  const back = page.getByTestId(`lineup-sub-${role}`);
  await expect(back).toBeVisible();
  await expect(front).toBeHidden();
  // A substitute (never the starter), on the starter's card parts, at the same size and place.
  expect(await back.getAttribute("data-player-id")).not.toBe(starter);
  await expect(back.getByTestId("substitute-label")).toBeVisible();
  await expect(back.getByTestId("assigned-role")).toBeVisible();
  await expect(back.getByTestId("card-art")).toBeVisible();
  await expect(back.getByTestId("pool-preview")).toBeVisible();
  expectSameBox(await box(back), frontBox);
  // Only this card turned; the flip asked the server for nothing.
  for (const other of ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"].filter((r) => r !== role)) await expect(card(page, other)).not.toHaveAttribute("data-flipped", "true");
  expect(requests).toEqual([]);
  // Nobody may save from the back outside Edit lineup.
  await expect(back.getByTestId("start-substitute")).toHaveCount(0);

  // The turned card works like a starter's: clicking it opens the substitute's details, and the
  // card stays turned while they are open and after they close.
  const subName = (await back.getAttribute("data-player-name"))!;
  await back.getByTestId("open-player-detail").click();
  const panel = page.getByTestId("player-detail");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("player-detail-hero")).toContainText(subName);
  await expect(panel.getByTestId("player-detail-position")).toContainText("substitute");
  await expect(back).toHaveAttribute("data-selected", "true");
  await expect(card(page, role)).toHaveAttribute("data-flipped", "true");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(card(page, role)).toHaveAttribute("data-flipped", "true");
  await expect(back.getByTestId("open-player-detail")).toBeFocused();

  // The turn control turns it back to the starter.
  await back.getByTestId("flip-back").click();
  await expect(card(page, role)).not.toHaveAttribute("data-flipped", "true");
  await expect(front).toBeVisible();
  expect(await front.getAttribute("data-player-id")).toBe(starter);

  // A reload shows the saved lineup, unturned.
  await turnOver(page, role);
  await page.reload({ waitUntil: "networkidle" });
  await expect(card(page, role)).not.toHaveAttribute("data-flipped", "true");
  await expect(page.getByTestId(`lineup-row-${role}`)).toHaveAttribute("data-player-id", starter!);
});

test("the turn control is one quiet icon, and only on cards whose role has a substitute", async ({ page }) => {
  test.skip(isPhone(page), "desktop covers the faces");
  await openTeam(page);
  const role = await withSubstitute(page);
  const control = flipButton(page, role);
  // No count or text: a round icon button the size of the card's other controls (32px, 44px on touch screens).
  await expect(control).toHaveText("");
  const b = (await control.boundingBox())!;
  expect(Math.abs(b.width - b.height)).toBeLessThanOrEqual(1);
  const touch = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  expect(Math.round(b.width)).toBe(touch ? 44 : 32);
  await expect(control).toHaveAttribute("aria-label", /substitute/);
  // A role without a substitute offers no turn at all.
  const without = [];
  for (const r of ["JUNGLE", "MID", "ADC", "TOP", "SUPPORT"]) if ((await flipButton(page, r).count()) === 0) without.push(r);
  expect(without.length).toBeGreaterThan(0);
  for (const r of without) await expect(page.getByTestId(`lineup-sub-${r}`)).toHaveCount(0);
});

test("the keyboard turns a card, focus follows to the other side, and Escape turns it back", async ({ page }) => {
  test.skip(isPhone(page), "desktop keyboard");
  await openTeam(page);
  const role = await withSubstitute(page);
  await flipButton(page, role).focus();
  await page.keyboard.press("Enter");
  await expect(card(page, role)).toHaveAttribute("data-flipped", "true");
  await expect(page.getByTestId(`lineup-sub-${role}`).getByTestId("flip-back")).toBeFocused();
  // The hidden side is inert: out of the tab order and the accessibility tree.
  await expect(card(page, role).locator(".flip-face-front")).toHaveAttribute("inert", "");
  await expect(card(page, role).locator(".flip-face-back")).not.toHaveAttribute("inert", "");
  await page.keyboard.press("Escape");
  await expect(card(page, role)).not.toHaveAttribute("data-flipped", "true");
  await expect(flipButton(page, role)).toBeFocused();
  await expect(card(page, role).locator(".flip-face-back")).toHaveAttribute("inert", "");

  // Rapid taps (each on the side that is live at that moment) settle on the last one, with nothing left turning.
  await card(page, role).evaluate(async (el) => {
    for (let i = 0; i < 5; i++) {
      (el.querySelector(".flip-face:not([inert]) [data-testid=flip-to-substitute], .flip-face:not([inert]) [data-testid=flip-back]") as HTMLElement).click();
      await new Promise((r) => setTimeout(r, 60));
    }
  });
  await expect(card(page, role)).toHaveAttribute("data-flipped", "true");
  await expect(card(page, role)).not.toHaveAttribute("data-turn", /.+/);
  await expect(page.getByTestId(`lineup-sub-${role}`)).toBeVisible();
});

test("in Edit lineup a manager saves the substitute as the starter; the former starter becomes the substitute, and turning back cancels", async ({ page }) => {
  test.skip(isPhone(page), "desktop covers lineup editing");
  await openTeam(page);
  const role = await withSubstitute(page);
  const front = page.getByTestId(`lineup-row-${role}`);
  const starter = { id: (await front.getAttribute("data-player-id"))!, name: (await front.getAttribute("data-player-name"))! };
  await page.getByTestId("edit-lineup").click();

  // Turning back is the cancel: nothing changes.
  await turnOver(page, role);
  const back = page.getByTestId(`lineup-sub-${role}`);
  const sub = { id: (await back.getAttribute("data-player-id"))!, name: (await back.getAttribute("data-player-name"))! };
  await expect(back.getByTestId("start-substitute")).toBeVisible();
  await back.getByTestId("flip-back").click();
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByTestId(`lineup-row-${role}`)).toHaveAttribute("data-player-id", starter.id);

  // Start saves it, then the card turns back to show the new starter.
  await page.getByTestId("edit-lineup").click();
  await turnOver(page, role);
  await expect(page.getByTestId(`lineup-sub-${role}`)).toHaveAttribute("data-player-id", sub.id);
  await page.getByTestId(`lineup-sub-${role}`).getByTestId("start-substitute").click();
  await expect(page.getByTestId(`lineup-row-${role}`)).toHaveAttribute("data-player-id", sub.id);
  await expect(card(page, role)).not.toHaveAttribute("data-flipped", "true");

  // The former starter is now the role's substitute; starting them puts the lineup back.
  await turnOver(page, role);
  await expect(page.getByTestId(`lineup-sub-${role}`)).toHaveAttribute("data-player-name", starter.name);
  await page.getByTestId(`lineup-sub-${role}`).getByTestId("start-substitute").click();
  await expect(page.getByTestId(`lineup-row-${role}`)).toHaveAttribute("data-player-id", starter.id);
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByTestId(`lineup-row-${role}`)).toHaveAttribute("data-player-id", starter.id);
});

test("in Edit lineup a manager chooses, replaces and removes a role's substitute; it is saved and shown to everyone", async ({ page }) => {
  test.skip(isPhone(page), "desktop covers lineup editing");
  await openTeam(page);
  // A role without a substitute whose bench has someone who lists it (in the demo: Mid).
  let role: string | null = null;
  await page.getByTestId("edit-lineup").click();
  for (const r of ["MID", "JUNGLE", "ADC"]) {
    if ((await flipButton(page, r).count()) > 0) continue;
    await page.getByTestId(`lineup-row-${r}`).getByRole("button", { name: /Choose a .* substitute/ }).click();
    await expect(page.getByTestId(`substitute-sheet-${r}`)).toBeVisible();
    if ((await page.getByTestId("substitute-option").count()) > 0) {
      role = r;
      break;
    }
    await page.keyboard.press("Escape");
    await expect(page.getByTestId(`substitute-sheet-${r}`)).toBeHidden();
  }
  test.skip(!role, "no role with a free bench candidate in this run's roster");
  const option = page.getByTestId("substitute-option").first();
  const name = (await option.getAttribute("data-player-name"))!;
  await option.click();
  // Nothing is saved until Save.
  await expect(card(page, role!)).not.toHaveAttribute("data-substitute-id", /.+/);
  await page.getByTestId("lineup-sheet-save").click();
  await expect(card(page, role!)).toHaveAttribute("data-substitute-id", /.+/);
  await expect(flipButton(page, role!)).toBeVisible();
  // One per role: the menu shows the choice; turning shows them.
  await turnOver(page, role!);
  await expect(page.getByTestId(`lineup-sub-${role!}`)).toHaveAttribute("data-player-name", name);
  await page.getByTestId(`lineup-sub-${role!}`).getByTestId("flip-back").click();
  // Saved: a reload (outside Edit lineup) still turns over to them.
  await page.reload({ waitUntil: "networkidle" });
  await turnOver(page, role!);
  await expect(page.getByTestId(`lineup-sub-${role!}`)).toHaveAttribute("data-player-name", name);
  await page.getByTestId(`lineup-sub-${role!}`).getByTestId("flip-back").click();
  // Removed: the card no longer turns.
  await page.getByTestId("edit-lineup").click();
  await page.getByTestId(`lineup-row-${role!}`).getByRole("button", { name: /Change the .* substitute/ }).click();
  await page.getByTestId("remove-substitute").click();
  await page.getByTestId("lineup-sheet-save").click();
  await expect(flipButton(page, role!)).toHaveCount(0);
  await page.reload({ waitUntil: "networkidle" });
  await expect(flipButton(page, role!)).toHaveCount(0);
});

test("a member without lineup rights can turn cards over but has no way to save a change", async ({ browser, page }) => {
  test.skip(isPhone(page), "runs once");
  await openTeam(page);
  const role = await withSubstitute(page);
  const starter = await page.getByTestId(`lineup-row-${role}`).getAttribute("data-player-id");
  const member = await memberContext(browser, page);
  try {
    await openTeam(member.page);
    await expect(member.page.getByTestId("edit-lineup")).toHaveCount(0);
    await expect(member.page.getByRole("button", { name: /substitute \(|Choose a .* substitute/ })).toHaveCount(0);
    await turnOver(member.page, role);
    await expect(member.page.getByTestId(`lineup-sub-${role}`)).toBeVisible();
    await expect(member.page.getByTestId("start-substitute")).toHaveCount(0);
    await member.page.reload({ waitUntil: "networkidle" });
    await expect(member.page.getByTestId(`lineup-row-${role}`)).toHaveAttribute("data-player-id", starter!);
  } finally {
    await member.context.close();
  }
});

/** A finger drag on the touchscreen (real touch events, so the browser scrolls natively). */
async function swipe(page: Page, cdp: CDPSession, from: { x: number; y: number }, to: { x: number; y: number }) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  for (let i = 1; i <= 12; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + ((to.x - from.x) * i) / 12, y: from.y + ((to.y - from.y) * i) / 12 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test("phones: a sideways swipe only scrolls the track, a tap on the control turns the card, and nothing is clipped", async ({ page, context }) => {
  test.skip(!isPhone(page), "phones only");
  await openTeam(page);
  const track = page.getByTestId("lineup-overview");
  await track.evaluate((el) => window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - 120)));
  const cdp = await context.newCDPSession(page);
  const area = (await track.boundingBox())!;
  const y = Math.round(area.y + 160);
  // Swipes that start on a card (its art and its turn control area) scroll; no card turns.
  await swipe(page, cdp, { x: Math.round(area.width * 0.85), y }, { x: Math.round(area.width * 0.2), y });
  await expect(page.getByTestId("lineup-dot").nth(1)).toHaveAttribute("aria-selected", "true");
  await swipe(page, cdp, { x: Math.round(area.width * 0.2), y }, { x: Math.round(area.width * 0.85), y });
  await expect(page.getByTestId("lineup-dot").nth(0)).toHaveAttribute("aria-selected", "true");
  expect(await page.locator("[data-flipped]").count()).toBe(0);

  // The turn control is a comfortable touch target; a tap turns the card in view.
  const control = flipButton(page, "TOP");
  expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // Measured once the track's snap has settled after the swipes.
  let before = await box(page.getByTestId("lineup-cell").first());
  await expect
    .poll(async () => {
      await page.waitForTimeout(150);
      const now = await box(page.getByTestId("lineup-cell").first());
      const same = JSON.stringify(now) === JSON.stringify(before);
      before = now;
      return same;
    })
    .toBe(true);
  await control.tap();
  await expect(card(page, "TOP")).toHaveAttribute("data-flipped", "true");
  await expect(page.getByTestId("lineup-sub-TOP")).toBeVisible();
  // Same size and place, and the track still lets the turning card's edges show (no clipping box).
  expectSameBox(await box(page.getByTestId("lineup-cell").first()), before);
  const room = await track.evaluate((el) => {
    const t = el.getBoundingClientRect();
    const c = el.firstElementChild!.getBoundingClientRect();
    return { top: c.top - t.top, bottom: t.bottom - c.bottom };
  });
  expect(room.top).toBeGreaterThanOrEqual(10);
  expect(room.bottom).toBeGreaterThanOrEqual(10);
  await page.getByTestId("lineup-sub-TOP").getByTestId("flip-back").tap();
  await expect(card(page, "TOP")).not.toHaveAttribute("data-flipped", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("the card swaps sides without any rotation", async ({ page }) => {
    test.skip(isPhone(page), "runs once");
    await openTeam(page);
    const role = await withSubstitute(page);
    await flipButton(page, role).click();
    await expect(card(page, role)).toHaveAttribute("data-flipped", "true");
    // No turn at all: no rotation, no dip, and the other side is there at once.
    expect(await card(page, role).getAttribute("data-turn")).toBeNull();
    expect(await card(page, role).locator(".flip-card-inner").evaluate((el) => getComputedStyle(el).rotate)).toBe("none");
    expect(await card(page, role).locator(".flip-face-back").evaluate((el) => getComputedStyle(el).rotate)).toBe("none");
    await expect(page.getByTestId(`lineup-sub-${role}`)).toBeVisible();
    await expect(page.getByTestId(`lineup-row-${role}`)).toBeHidden();
  });
});
