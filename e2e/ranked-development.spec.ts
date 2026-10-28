import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "./test";
import { memberContext, signIn } from "./member-account";

/*
  RANKED DEVELOPMENT on real member accounts (in-memory demo, no Riot key): an objective with an
  If–Then plan (a rank goal is pointed out, never refused), a session started on one device and
  resumed on another, a game added by hand with its review and one whose review is skipped at no
  cost, the session ended with a closing note, its summary and the keep / adjust / replace choice,
  then the library, where only the player moves an objective. Along the way: the three areas on
  phones and tablets held either way (no sideways scrolling, windows inside the screen), reduced
  motion, accessibility, and a session's address that another member cannot open.

  Synced games joining a session by themselves (and every association rule) are covered in
  tests/db/ranked-development.test.ts: the demo has no Riot key to sync with.
*/

test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "runs once: it opens its own phone and tablet windows"));

const PASSWORD = "Mine#2026-team";
const PLAN = "If my wave is about to crash, then I ward the river first.";
const overflow = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

async function audit(p: Page, label: string) {
  const result = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const blocking = result.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  expect(blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")})`), label).toEqual([]);
}

/** Every Ranked Development area at a phone and a tablet size, upright and sideways: nothing wider than the screen. */
async function fitsEverySize(p: Page, routes: string[]) {
  const back = p.viewportSize()!;
  for (const size of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 820, height: 1180 },
    { width: 1180, height: 820 },
  ]) {
    await p.setViewportSize(size);
    for (const route of routes) {
      await p.goto(route);
      await expect(p.getByTestId("ranked-development")).toBeVisible();
      expect(await overflow(p), `${route} at ${size.width}x${size.height}`).toBeLessThanOrEqual(1);
    }
  }
  await p.setViewportSize(back);
}

test("an objective, a session on two devices, a reviewed and a skipped game, the summary and the library", async ({ browser, page }) => {
  test.setTimeout(240_000);
  await page.goto("/team");
  const member = await memberContext(browser, page);
  const p = member.page;
  try {
    await p.goto("/overview/development");
    const before = p.getByTestId("before-queue");
    await expect(before).toHaveAttribute("data-state", "empty");

    // BEFORE: one objective, a habit rather than a result. A rank goal is pointed out, not refused.
    // A click before the page has hydrated does nothing: click until the window opens.
    const editor = p.getByRole("dialog", { name: "New objective" });
    await expect(async () => {
      await p.getByTestId("objective-create").click();
      await expect(editor).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    const title = editor.getByTestId("objective-editor").getByTestId("objective-title");
    await title.fill("Reach Diamond this split");
    await expect(editor.getByTestId("objective-outcome-note")).toBeVisible();
    await title.fill("Ward the river before I shove");
    await expect(editor.getByTestId("objective-outcome-note")).toHaveCount(0);
    await editor.getByTestId("objective-area").selectOption("vision");
    await editor.getByTestId("plan-if").fill("my wave is about to crash");
    await editor.getByTestId("plan-then").fill("I ward the river first");
    await expect(editor.getByTestId("plan-preview")).toHaveText(PLAN);
    await audit(p, "objective editor");
    await editor.getByTestId("objective-save").click();
    await expect(editor).toBeHidden();
    await expect(before).toHaveAttribute("data-state", "ready");
    await expect(before.getByTestId("objective-title")).toHaveText("Ward the river before I shove");
    await expect(before.getByTestId("plan-callout")).toContainText(PLAN);

    // Start: no game limit unless one is chosen.
    await expect(p.getByTestId("session-limit-none")).toHaveAttribute("aria-checked", "true");
    await p.getByTestId("session-start").click();
    await expect(before).toHaveAttribute("data-state", "active");
    await expect(before).toContainText("Session 1 in progress");
    await expect(before).toContainText("No game limit");

    // Reduced motion: the live marker stops pulsing, and nothing in the section animates.
    await expect.poll(() => before.getByTestId("session-live").evaluate((e) => getComputedStyle(e).animationName)).toBe("pulse");
    await p.emulateMedia({ reducedMotion: "reduce" });
    await expect.poll(() => before.getByTestId("session-live").evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
    expect(await p.evaluate(() => document.getAnimations().filter((a) => a.effect instanceof KeyframeEffect && !!a.effect.target?.closest("[data-testid=ranked-development]")).length)).toBe(0);
    await p.emulateMedia({ reducedMotion: "no-preference" });

    // The session lives on the server: another device signed in to the same account resumes it.
    const otherDevice = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    try {
      const phone = await otherDevice.newPage();
      await signIn(phone, member.username, PASSWORD, "/overview/development");
      await expect(phone).toHaveURL(/\/overview\/development$/);
      await expect(phone.getByTestId("before-queue")).toHaveAttribute("data-state", "active");
      await phone.getByTestId("session-continue").click();
      await expect(phone).toHaveURL(/\/overview\/development\/sessions$/);
      await expect(phone.getByTestId("current-session")).toContainText("Session 1");
      expect(await overflow(phone)).toBeLessThanOrEqual(1);
    } finally {
      await otherDevice.close();
    }

    // DURING and AFTER: a game Riot has not handed over, added by hand; its review opens right after.
    await p.goto("/overview/development/sessions");
    const current = p.getByTestId("current-session");
    await expect(current).toContainText("No games yet");
    const add = p.getByTestId("add-game");
    await expect(add).toContainText("Goes into Session 1");
    // Until the page has hydrated a click changes nothing: pick until the champion is chosen.
    const pick = add.getByTestId("pool-quick-pick").first();
    await expect(async () => {
      await add.getByTestId("add-game-manual").click();
      await pick.click();
      await expect(pick).toHaveAttribute("aria-pressed", "true", { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await add.getByRole("button", { name: "Win", exact: true }).click();
    await add.getByRole("button", { name: "Save game" }).click();
    const review = p.getByRole("dialog", { name: "Review this game" });
    await expect(review).toBeVisible();
    await expect(review).toContainText(PLAN);
    await audit(p, "review window");
    await review.getByTestId("review-execution-2").click();
    await review.getByTestId("review-learning").fill("I shoved without vision twice");
    await review.getByTestId("review-adjustment").fill("Ward on the first crash");
    await review.getByTestId("review-save").click();
    await expect(review).toBeHidden();
    const games = current.getByTestId("session-game");
    await expect(games).toHaveCount(1);
    await expect(games.first()).toHaveAttribute("data-review", "done");
    await expect(games.first().getByTestId("game-review")).toContainText("I shoved without vision twice");

    // A second game, its review skipped: no penalty, and it is not asked for again.
    await add.getByTestId("pool-quick-pick").first().click();
    await add.getByRole("button", { name: "Loss", exact: true }).click();
    await add.getByRole("button", { name: "Save game" }).click();
    await expect(review).toBeVisible();
    // On a phone the review window stays inside the screen (measured once it has settled).
    await p.setViewportSize({ width: 390, height: 844 });
    const edges = async () => {
      const b = (await review.boundingBox())!;
      return { left: b.x >= -0.5, right: b.x + b.width <= 390.5, bottom: b.y + b.height <= 844.5 };
    };
    await expect.poll(edges, { message: "review window inside a phone screen" }).toEqual({ left: true, right: true, bottom: true });
    await p.setViewportSize({ width: 1440, height: 900 });
    await review.getByTestId("review-skip").click();
    await expect(review).toBeHidden();
    await expect(games).toHaveCount(2);
    await expect(current.locator("[data-testid=session-game][data-review=skipped]")).toHaveCount(1);
    await p.goto("/overview/development");
    await expect(p.getByTestId("pending-reviews")).toHaveCount(0);
    await expect(p.getByTestId("progress-summary").getByTestId("status-stepper")).toHaveAttribute("data-status", "practising");
    await audit(p, "overview with a session in progress");

    await fitsEverySize(p, ["/overview/development", "/overview/development/sessions", "/overview/development/library"]);

    // End it with a closing note: the summary, then the choice for the next session.
    await p.goto("/overview/development/sessions");
    await audit(p, "sessions with a session in progress");
    const end = p.getByRole("dialog", { name: "End Session 1?" });
    await expect(async () => {
      await current.getByTestId("session-end").click();
      await expect(end).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await expect(end).toContainText("2 games (1W 1L)");
    await end.getByTestId("session-end-note").fill("The plan held in lane.");
    await end.getByTestId("session-end-confirm").click();
    await expect(p).toHaveURL(/\/overview\/development\/sessions\/[0-9a-f-]{36}$/);
    const sessionUrl = new URL(p.url()).pathname;
    const summary = p.getByTestId("session-summary");
    await expect(summary).toContainText("Plan followed in 1 of 1 reviewed game");
    await expect(summary.getByTestId("summary-reviews")).toContainText("From your reviews · self-reported");
    await expect(summary.getByTestId("summary-reviews")).toContainText("1 reviewed · 1 skipped");
    await expect(summary.getByTestId("summary-reviews")).toContainText("I shoved without vision twice");
    await expect(p.getByTestId("session-note").getByRole("textbox")).toHaveValue("The plan held in lane.");
    await expect(p.getByTestId("session-games").getByTestId("session-game")).toHaveCount(2);
    await audit(p, "a finished session");
    await p.getByTestId("next-keep").click();
    await expect(p.getByTestId("next-keep")).toHaveText("Kept for next session");
    await fitsEverySize(p, [sessionUrl]);

    // Old Solo Queue Blocks addresses lead here: the history, and a block's own address to its session.
    for (const [from, to] of [
      ["/overview/blocks", "/overview/development/sessions"],
      ["/overview/blocks/history", "/overview/development/sessions"],
      [`/overview/blocks/${sessionUrl.split("/").pop()}`, sessionUrl],
    ] as const) {
      await p.goto(from);
      await expect(p, from).toHaveURL(new RegExp(`${to}$`));
    }

    // The history lists it; the overview offers the next one with the same objective.
    await p.goto("/overview/development/sessions");
    await expect(p.getByTestId("session-list").getByTestId("session-row")).toHaveCount(1);
    await expect(p.getByTestId("before-queue")).toHaveAttribute("data-state", "ready");

    // The library: the objective with its evidence, each kind named for where it comes from. Wins
    // never move it; the player does, and the step stays.
    await p.goto("/overview/development/library");
    const card = p.getByTestId("objective-card");
    await expect(card).toHaveCount(1);
    await expect(card).toHaveAttribute("data-status", "practising");
    await expect(card.getByTestId("objective-status-practising")).toHaveAttribute("aria-checked", "true");
    await expect(card.getByTestId("evidence-none")).toBeVisible();
    await expect(card.getByTestId("evidence-execution")).toHaveAttribute("data-rated", "1");
    await audit(p, "library");
    await expect(async () => {
      await card.getByTestId("objective-status-improving").click();
      await expect(card).toHaveAttribute("data-status", "improving", { timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    await expect(card.getByTestId("objective-status-improving")).toHaveAttribute("aria-checked", "true");
    await p.reload();
    await expect(p.getByTestId("objective-card")).toHaveAttribute("data-status", "improving");
    await expect(p.getByTestId("plan-history").getByTestId("plan-history-row")).toHaveCount(1);

    // Private: another member's address for this session is simply not found, and their own
    // Ranked Development is empty.
    const other = await memberContext(browser, page, { width: 1440, height: 900 }, { base: "Other" });
    try {
      await other.page.goto(sessionUrl);
      await expect(other.page.getByTestId("not-found")).toBeVisible();
      await other.page.goto("/overview/development/sessions");
      await expect(other.page.getByTestId("session-list").getByTestId("session-row")).toHaveCount(0);
      await expect(other.page.getByText("Ward the river before I shove")).toHaveCount(0);
    } finally {
      await other.context.close();
    }
  } finally {
    await member.context.close();
  }
});
