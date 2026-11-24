import { expect, test, type Locator, type Page } from "./test";
import { closeGame, openGame } from "./match-history";

/*
  The performance score on a collapsed Match History card (Release 17, the owner's brief §3): each
  card shows the game's score and place before it is opened, with MVP or ACE where they apply, and
  it is the same score and place the opened game shows for that player, never a calculation of the
  card's own (the server scores the card through the opened game's functions:
  docs/PERFORMANCE_SCORE.md). On the demo every card of the first page is read, then each game is
  opened and its scoreboard's row for the player compared. Several demo games have no stored
  timeline; without a Riot key nothing is fetched, so the opened game scores them on the record
  alone, and so does the card. One mark shows on a card at every width, and a card's height is
  unchanged by it (the cards' heights are held in match-history-layout.spec.ts).
*/

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
  // What it shows: "3.5 · 9th", MVP or ACE after it; what it says: the score, the place of how many, MVP or ACE.
  const shown = (await mark.locator("[aria-hidden]").innerText()).replace(/\s+/g, " ").trim();
  expect(shown).toMatch(new RegExp(`^${score.toFixed(1).replace(".", "\\.")} · ${rank}(st|nd|rd|th)${mvp ? " MVP" : ace ? " ACE" : ""}$`));
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

test("the mark is quiet: the smallest text, the place in grey, MVP in the emphasis colour and ACE ringed, inside the card", async ({ page }) => {
  await openHistory(page, "TOP");
  const marks = page.locator("[data-testid=match-score]:visible");
  await expect(marks.first()).toBeVisible();
  const facts = await marks.evaluateAll((els) =>
    els.map((el) => {
      const card = el.closest("[data-testid=match-card]")!.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const chip = el.querySelector("[aria-hidden] > span:nth-child(4)");
      return { size: parseFloat(getComputedStyle(el).fontSize), inside: r.left >= card.left && r.right <= card.right && r.top >= card.top && r.bottom <= card.bottom, height: r.height, chip: chip ? { text: chip.textContent, ring: getComputedStyle(chip).boxShadow !== "none" } : null };
    }),
  );
  const kda = parseFloat(await page.getByTestId("match-kda").first().evaluate((e) => getComputedStyle(e).fontSize));
  for (const f of facts) {
    expect(f.size, "the smallest text size").toBeLessThanOrEqual(12);
    expect(f.size).toBeLessThan(kda);
    expect(f.inside, "inside its card").toBe(true);
    expect(f.height).toBeLessThanOrEqual(18);
    if (f.chip) {
      expect(["MVP", "ACE"]).toContain(f.chip.text);
      expect(f.chip.ring, "ringed").toBe(true);
    }
  }
  // Where it is: under the K/D/A on a phone's and a two-row card (lists under 50rem); with the build on a wide card.
  const first = marks.first();
  if ((page.viewportSize()?.width ?? 0) < 1024) {
    const card = first.locator("xpath=ancestor::*[@data-testid='match-card']");
    const kda = (await card.getByTestId("match-kda").boundingBox())!;
    const box = (await first.boundingBox())!;
    expect(box.y, "under the K/D/A").toBeGreaterThanOrEqual(kda.y + kda.height);
    expect(Math.min(box.x + box.width, kda.x + kda.width) - Math.max(box.x, kda.x), "in the K/D/A's column").toBeGreaterThan(0);
  } else await expect(first.locator("xpath=ancestor::*[@data-testid='match-card-build']")).toHaveCount(1);
});
