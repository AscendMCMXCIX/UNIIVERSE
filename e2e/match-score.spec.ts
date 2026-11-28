import { expect, test, type Locator, type Page } from "./test";
import { closeGame, openGame, inTheFlow } from "./match-history";
import { NO_BUILD_CLASS, noBuildWords } from "../src/components/match-history/card-build";

/*
  The performance score on a collapsed Match History card (Release 17, the owner's brief §3): each
  card shows the game's score and place before it is opened, with MVP or ACE where they apply, and
  it is the same score and place the opened game shows for that player, never a calculation of the
  card's own (the server scores the card through the opened game's functions:
  docs/PERFORMANCE_SCORE.md). On the demo every card of the first page is read, then each game is
  opened and its scoreboard's row for the player compared. Several demo games have no stored
  timeline; without a Riot key nothing is fetched, so the opened game scores them on the record
  alone, and so does the card. One mark shows on a card at every width (the cards' heights are held
  in match-history-layout.spec.ts). Since the owner's requirements of 25 Nov 2026 the score has a
  place of its own (a column right after the K/D/A on a wide card, directly under the K/D/A on a
  narrow one), bold in the primary colour, with the shared place badge: MVP gold, ACE violet, other
  places restrained; the open card's header keeps it.
*/

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

async function openHistory(page: Page, role: string) {
  await page.goto("/team");
  const id = (await page.getByTestId(`lineup-row-${role}`).getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/matches`);
  await expect(page.locator("[data-testid='match-history'][data-ready]")).toBeVisible();
}

interface CardScore {
  state: string;
  score: number | null;
  rank: number | null;
  mvp: boolean;
  ace: boolean;
}

/** What a card says of its score: its button's state and figures, and its one visible mark's. */
async function cardScore(card: Locator): Promise<CardScore> {
  const row = card.getByTestId("match-row");
  const state = (await row.getAttribute("data-score-state"))!;
  const marks = card.locator("[data-testid=match-score]:visible");
  if (state !== "ok") {
    await expect(marks).toHaveCount(0);
    // The score's place is kept, with a quiet dash.
    await expect(card.locator("[data-testid=match-score-empty]:visible")).toHaveCount(1);
    return { state, score: null, rank: null, mvp: false, ace: false };
  }
  await expect(marks, "one mark at a time").toHaveCount(1);
  const mark = marks.first();
  const score = Number(await mark.getAttribute("data-score"));
  const rank = Number(await mark.getAttribute("data-rank"));
  expect(Number(await row.getAttribute("data-score"))).toBe(score);
  expect(Number(await row.getAttribute("data-rank"))).toBe(rank);
  const mvp = (await mark.getAttribute("data-mvp")) === "true";
  const ace = (await mark.getAttribute("data-ace")) === "true";
  // What it shows: "3.5" and its place badge ("9th", or MVP or ACE in its place); what it says: the score, the place of how many, MVP or ACE.
  await expect(mark.getByTestId("score-value")).toHaveText(score.toFixed(1));
  await expect(mark.getByTestId("match-placement")).toHaveText(mvp ? "MVP" : ace ? "ACE" : ordinal(rank));
  await expect(mark.getByTestId("match-placement")).toHaveAttribute("data-placement", mvp ? "mvp" : ace ? "ace" : "place");
  await expect(card.locator("[data-testid=match-score-empty]:visible")).toHaveCount(0);
  await expect(mark.locator(".sr-only")).toHaveText(new RegExp(`^Performance score ${score.toFixed(1).replace(".", "\\.")}, ${rank}(st|nd|rd|th) of (9|10)${mvp ? ", MVP" : ace ? ", ACE" : ""}$`));
  await expect(row).toHaveAttribute("aria-label", new RegExp(`performance score ${score.toFixed(1).replace(".", "\\.")}, ${rank}(st|nd|rd|th) of (9|10)${mvp ? ", MVP" : ace ? ", ACE" : ""}[,.]`));
  return { state, score, rank, mvp, ace };
}

/** The opened game's score for the profile's player: their scoreboard row (the player inspected as the game opens). */
async function openedScore(breakdown: Locator): Promise<CardScore> {
  await expect(breakdown).not.toHaveAttribute("data-timeline", "loading");
  const slot = (await breakdown.getAttribute("data-selected"))!;
  const cell = breakdown.locator(`[data-testid=participant][data-slot="${slot}"] [data-testid=participant-score]`).first();
  await expect(cell).not.toHaveAttribute("data-state", "loading");
  const score = await cell.getAttribute("data-score");
  if (score === null) return { state: "none", score: null, rank: null, mvp: false, ace: false };
  return { state: "ok", score: Number(score), rank: Number(await cell.getAttribute("data-rank")), mvp: (await cell.getAttribute("data-mvp")) === "true", ace: (await cell.getAttribute("data-ace")) === "true" };
}

test("every card of the first page shows the opened game's performance score and place, MVP and ACE included", async ({ page }) => {
  test.setTimeout(240_000);
  await openHistory(page, "MID");
  const cards = page.getByTestId("match-card");
  const count = await cards.count();
  expect(count).toBeGreaterThanOrEqual(5);
  const seen = { ok: 0, marks: 0 };
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const before = await cardScore(card);
    const breakdown = await openGame(card);
    const opened = await openedScore(breakdown);
    expect(before, `card ${i + 1}: the opened game's score and place`).toEqual(opened);
    // The open card's header keeps the card's score and place (a phone's window has its own header).
    const header = page.locator("li[data-expanded] [data-testid=match-header-score]");
    if (before.state === "ok" && (await page.locator("li[data-expanded]").count())) {
      await expect(header).toHaveAttribute("data-score", String(before.score));
      await expect(header).toHaveAttribute("data-rank", String(before.rank));
    } else await expect(header).toHaveCount(0);
    // The panel says the same where it shows the player inspected.
    if (opened.state === "ok") {
      const value = breakdown.getByTestId("performance-value");
      if (await value.count()) await expect(value).toHaveText(opened.score!.toFixed(1));
      seen.ok += 1;
      if (opened.mvp || opened.ace) seen.marks += 1;
    }
    await closeGame(card);
  }
  expect(seen.ok).toBeGreaterThanOrEqual(count - 1);
  expect(seen.marks, "MVP and ACE marked where they apply").toBeGreaterThan(0);
});

test("the score is prominent and keeps one place: bold in the primary colour, its own column after the K/D/A on a wide card, under the K/D/A on a narrow one; MVP gold, ACE violet, other places restrained", async ({ page }) => {
  // A full page of ten games, each opened under its card: the flow (in the one-screen gate a page holds what fits, and games open in the game window).
  await inTheFlow(page);
  await openHistory(page, "MID");
  const marks = page.locator("[data-testid=match-score]:visible");
  await expect(marks.first()).toBeVisible();
  const facts = await page.getByTestId("match-card").evaluateAll((cards) => {
    const probe = (token: string) => {
      const el = document.createElement("span");
      el.style.color = `var(${token})`;
      document.body.append(el);
      const c = getComputedStyle(el).color;
      el.remove();
      return c;
    };
    const [fg, gold, violet, muted] = ["--color-fg", "--color-gold", "--color-violet", "--color-fg-muted"].map(probe);
    const shown = (card: Element, sel: string) => [...card.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 0) ?? null;
    return cards.map((card) => {
      const c = card.getBoundingClientRect();
      const mark = shown(card, "[data-testid=match-score]");
      const slot = mark ?? shown(card, "[data-testid=match-score-empty]");
      const kda = card.querySelector("[data-testid=match-kda]")!;
      const kdaCol = kda.parentElement!.getBoundingClientRect();
      const cell = shown(card, "[data-testid=match-score-cell]");
      const figures = card.querySelector("[data-testid=match-figures]")!.getBoundingClientRect();
      const value = mark?.querySelector("[data-testid=score-value]") ?? null;
      const badge = mark?.querySelector("[data-testid=match-placement]") ?? null;
      const s = slot!.getBoundingClientRect();
      const colour = (e: Element | null) => {
        if (!e) return null;
        const x = getComputedStyle(e).color;
        return x === gold ? "gold" : x === violet ? "violet" : x === muted ? "muted" : x === fg ? "fg" : x;
      };
      return {
        inside: s.left >= c.left && s.right <= c.right && s.top >= c.top && s.bottom <= c.bottom,
        cell: cell ? { left: cell.getBoundingClientRect().left, right: cell.getBoundingClientRect().right } : null,
        kdaRight: kdaCol.right,
        kdaBottom: kda.getBoundingClientRect().bottom,
        kdaLeft: kdaCol.left,
        figuresLeft: figures.left,
        slot: { top: s.top, left: s.left, right: s.right },
        value: value ? { size: parseFloat(getComputedStyle(value).fontSize), weight: Number(getComputedStyle(value).fontWeight), colour: colour(value) } : null,
        kdaSize: parseFloat(getComputedStyle(kda).fontSize),
        badge: badge ? { kind: badge.getAttribute("data-placement"), text: badge.textContent, colour: colour(badge), ring: getComputedStyle(badge).boxShadow !== "none", height: badge.getBoundingClientRect().height, width: badge.getBoundingClientRect().width } : null,
        valueRight: value ? value.getBoundingClientRect().right - c.left : null,
      };
    });
  });
  expect(facts.length).toBeGreaterThan(5);
  const wide = facts.some((f) => f.cell);
  for (const [i, f] of facts.entries()) {
    const at = `card ${i}`;
    expect(f.inside, `${at}: inside its card`).toBe(true);
    if (f.value) {
      // Bold, in the primary colour, never the smallest text: the largest figure of its column on a wide card.
      expect(f.value.weight, `${at}: bold`).toBeGreaterThanOrEqual(700);
      expect(f.value.colour, `${at}: the primary colour`).toBe("fg");
      expect(f.value.size, `${at}: not the smallest text`).toBeGreaterThanOrEqual(15);
      if (f.cell) expect(f.value.size, `${at}: on a wide card, at least the K/D/A's size`).toBeGreaterThanOrEqual(f.kdaSize);
    }
    if (f.badge) {
      expect(f.badge.colour, `${at}: ${f.badge.kind}`).toBe(f.badge.kind === "mvp" ? "gold" : f.badge.kind === "ace" ? "violet" : "muted");
      expect(f.badge.ring, `${at}: a ring on MVP and ACE only`).toBe(f.badge.kind !== "place");
      if (f.badge.kind === "mvp") expect(f.badge.text).toBe("MVP");
      if (f.badge.kind === "ace") expect(f.badge.text).toBe("ACE");
    }
    if (wide) {
      // A column of its own: after the K/D/A's, before the figures'.
      expect(f.cell, `${at}: the score's column`).not.toBeNull();
      expect(f.cell!.left, `${at}: after the K/D/A`).toBeGreaterThanOrEqual(f.kdaRight - 0.5);
      expect(f.cell!.right, `${at}: before the figures`).toBeLessThanOrEqual(f.figuresLeft + 0.5);
    } else {
      // Directly under the K/D/A, in its column.
      expect(f.slot.top, `${at}: under the K/D/A`).toBeGreaterThanOrEqual(f.kdaBottom - 0.5);
      expect(Math.min(f.slot.right, f.kdaRight) - Math.max(f.slot.left, f.kdaLeft), `${at}: in the K/D/A's column`).toBeGreaterThan(0);
    }
  }
  // The same place on every card of the list: one x for the column on wide cards (±1px).
  if (wide) {
    const lefts = facts.map((f) => f.cell!.left);
    expect(Math.max(...lefts) - Math.min(...lefts), "the score's column level from card to card").toBeLessThanOrEqual(1);
  }
  // One badge height and one width whatever it says (MVP and ACE no wider than "5th": the owner's review of 25 Nov 2026), so the
  // score beside its badge on a narrow card starts at one x from card to card.
  const heights = facts.flatMap((f) => (f.badge ? [Math.round(f.badge.height)] : []));
  expect(new Set(heights).size, "one badge height").toBe(1);
  const widths = facts.flatMap((f) => (f.badge ? [Math.round(f.badge.width * 10) / 10] : []));
  expect(new Set(widths).size, `one badge width (${[...new Set(widths)].join(", ")})`).toBe(1);
  if (!wide) {
    const rights = facts.flatMap((f) => (f.valueRight === null ? [] : [f.valueRight]));
    expect(Math.max(...rights) - Math.min(...rights), "the score beside its badge at one x on every card (its figure's end, so a wider figure stays level)").toBeLessThanOrEqual(1);
  }
  expect(facts.some((f) => f.badge?.kind === "mvp") && facts.some((f) => f.badge?.kind === "ace"), "MVP and ACE both on the demo's first page").toBe(true);
});

test("a card whose record is still being collected, or that Riot no longer serves, keeps the score and the K/D/A where every other card has them: its phrase at the build's width", async ({ page, context, baseURL }, info) => {
  test.skip(info.project.name === "phone", "a phone's card has no column after its build: the phrase is a line of the card");
  await context.addCookies([{ name: "uniiverse_sidebar", value: "expanded", url: baseURL! }]);
  // The desktop at the tiers that matter (a 60rem list at 1280 with the sidebar open, 70rem at 1440, about 99rem at 1920); the tablet's two-row card.
  const sizes = info.project.name === "desktop" ? [{ width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }] : [page.viewportSize()!];
  for (const size of sizes) {
    await page.setViewportSize(size);
    await openHistory(page, "MID");
    await page.evaluate(() => document.fonts.ready);
    const places = () =>
      page.getByTestId("match-card").evaluateAll((cards) =>
        cards.map((card) => {
          const shown = (sel: string) => [...card.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 0) ?? null;
          const slot = shown("[data-testid=match-score], [data-testid=match-score-empty]")!.getBoundingClientRect();
          const kda = card.querySelector("[data-testid=match-kda]")!.getBoundingClientRect();
          const build = shown("[data-testid=match-card-build]");
          const phrase = build?.querySelector<HTMLElement>("[data-testid=match-items-missing]") ?? null;
          return { score: slot.left, kda: kda.left, build: build ? build.getBoundingClientRect().width : 0, cut: phrase ? phrase.scrollWidth > phrase.clientWidth + 0.5 || phrase.getBoundingClientRect().bottom > card.getBoundingClientRect().bottom : false };
        }),
      );
    const before = await places();
    expect(before.length).toBeGreaterThan(3);
    // The demo has no such game: two cards' builds are drawn as a card draws a record still being
    // collected and one Riot no longer serves (the card's own classes and words, card-build.ts).
    await page.getByTestId("match-card").evaluateAll(
      (cards, { cls, words }) =>
        words.forEach((w, i) => {
          const cell = [...cards[i + 1]!.querySelectorAll<HTMLElement>("[data-testid=match-card-build]")].find((e) => e.getBoundingClientRect().width > 0)!;
          const phrase = document.createElement("span");
          phrase.className = cls;
          phrase.dataset.testid = "match-items-missing";
          phrase.textContent = w;
          cell.replaceChildren(phrase);
        }),
      { cls: NO_BUILD_CLASS, words: [noBuildWords("missing"), noBuildWords("unavailable")] },
    );
    const after = await places();
    const at = `${size.width}×${size.height}`;
    for (const [i, a] of after.entries()) {
      expect(Math.abs(a.score - before[i]!.score), `${at}, card ${i}: the score where it was`).toBeLessThanOrEqual(1);
      expect(Math.abs(a.kda - before[i]!.kda), `${at}, card ${i}: the K/D/A where it was`).toBeLessThanOrEqual(1);
      expect(a.cut, `${at}, card ${i}: the phrase whole, inside its card`).toBe(false);
    }
    // At a build's width, as the stored builds beside them.
    for (const i of [1, 2]) expect(Math.abs(after[i]!.build - before[0]!.build), `${at}, card ${i}: the phrase as wide as a build`).toBeLessThanOrEqual(1);
    // A wide card's score column: one x on every card (the Production check's fact, scripts/card-score-facts.mjs).
    if (info.project.name === "desktop") {
      const lefts = after.map((a) => a.score);
      expect(Math.max(...lefts) - Math.min(...lefts), `${at}: the score's column level from card to card`).toBeLessThanOrEqual(1);
    }
  }
});

