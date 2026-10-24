import { expect, test, type Page, type Response } from "./test";

/*
  Ranks in the match window (server/players/participant-ranks.ts, domain/known-rank.ts), on the
  demo games with the browser tests' Riot stand-in (server/riot/browser-test.ts: most players
  ranked in Solo/Duo, some in Flex too or only, some unranked, one in ten failing). Every player
  gets one compact badge: a current or last-checked rank with its queue and date, "Unranked" when
  Riot listed no entry, or "—" when nothing is known; never a rank at the time of the game. The
  check asks Riot only for players whose rank is missing or stale, once. The row layout is the one
  the scoreboard already had, on phones too.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

/** The rank checks the page asked for (server action answers carrying a check), in order. */
function watchChecks(page: Page) {
  const checks: Array<{ asked: number; found: number; failed: number; skipped: number }> = [];
  const pending: Array<Promise<void>> = [];
  page.on("response", (r: Response) => {
    if (r.request().method() !== "POST" || !r.request().headers()["next-action"]) return;
    pending.push(
      r
        .text()
        .then((body) => {
          const m = /"check":\{"asked":(\d+),"found":(\d+),"failed":(\d+),"skipped":(\d+)/.exec(body);
          if (m) checks.push({ asked: Number(m[1]), found: Number(m[2]), failed: Number(m[3]), skipped: Number(m[4]) });
        })
        .catch(() => {}),
    );
  });
  return { checks, settled: () => Promise.all(pending) };
}

async function openHistory(page: Page, role: string) {
  await page.goto("/team");
  const id = (await page.getByTestId(`lineup-row-${role}`).getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/matches`);
  await page.waitForLoadState("networkidle");
}

async function openMatch(page: Page, index: number) {
  const card = page.getByTestId("match-card").nth(index);
  await expect(async () => {
    await card.click({ position: { x: 24, y: 16 } });
    await expect(page.getByTestId("match-detail")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  const note = page.getByTestId("ranks-note");
  await expect(note).toBeVisible({ timeout: 15_000 });
  await expect(note).not.toHaveAttribute("data-state", "checking", { timeout: 15_000 });
  return note;
}

async function closeMatch(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("match-detail")).toHaveCount(0);
}

test("every player in the scoreboard has one rank badge: a dated current rank, Unranked or not available", async ({ page }) => {
  await openHistory(page, "TOP");
  const note = await openMatch(page, 1);
  const rows = page.locator('[data-testid="participant"]:not([data-removed])');
  const count = await rows.count();
  expect(count).toBe(10);
  const states: string[] = [];
  for (let i = 0; i < count; i++) {
    const badge = rows.nth(i).getByTestId("participant-rank");
    await expect(badge).toHaveCount(1);
    const state = (await badge.getAttribute("data-state"))!;
    states.push(state);
    const shown = (await badge.getByTestId("participant-rank-text").innerText()).trim();
    const title = (await badge.getAttribute("title"))!;
    if (state === "ranked") {
      // The queue, the rank in full, when it was read, and that it is not the rank in this game.
      expect(title).toMatch(/^Ranked (Solo\/Duo|Flex): [A-Z][a-z]+( (I|II|III|IV))?(, \d+ LP)?, (checked|last seen) \d{1,2} [A-Z][a-z]{2} \d{4}\. Their rank then, not at the time of this match$/);
      expect(shown).toMatch(/^((Flex|Solo) )?(Iron|Bronze|Silver|Gold|Plat|Emerald|Diamond|Master|GM|Chall)( [1-4])?( · [A-Z][a-z]{2}( \d{4})?)?$/);
    } else if (state === "unranked") {
      expect(shown).toBe("Unranked");
      expect(title).toMatch(/^Unranked: no Ranked Solo\/Duo or Flex entry when checked \d{1,2} [A-Z][a-z]{2} \d{4}$/);
    } else {
      expect(state).toBe("unknown");
      expect(shown).toBe("—");
      await expect(badge).toContainText("Rank not available");
    }
  }
  // The stand-in ranks most players; the account the history belongs to has its own synced rank.
  expect(states.filter((s) => s === "ranked").length).toBeGreaterThanOrEqual(5);
  await expect(page.locator('[data-testid="participant"][data-player] [data-testid="participant-rank"]')).toHaveAttribute("data-state", "ranked");
  // What the badges are, under the scoreboard.
  await expect(note).toContainText(/(Current|Last-known) Ranked (Solo\/Duo|Flex) ranks \((Flex|Solo\/Duo) where marked\)/);
  await expect(note).toContainText("not the ranks players had in this game, which Riot's match records do not include");
  if (states.includes("unknown")) await expect(note).toContainText("—: not available.");
  if (states.includes("unranked")) await expect(note).toContainText("Unranked: no ranked entry.");
});

test("a rank from the match's other ranked queue is marked, and only then", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the queue rules once; layout on every size below");
  await openHistory(page, "MID");
  let solo = false;
  let flex = false;
  for (let i = 0; i < 10 && !(solo && flex); i++) {
    await openMatch(page, i);
    const queue = (await page.locator("#match-detail-title + ul li").first().innerText()).trim();
    const own = queue === "Ranked Flex" ? "flex" : "solo";
    const mark = own === "flex" ? "Solo" : "Flex";
    const badges = page.locator('[data-testid="participant-rank"][data-state="ranked"]');
    for (let b = 0; b < (await badges.count()); b++) {
      const badge = badges.nth(b);
      const shown = (await badge.getByTestId("participant-rank-text").innerText()).trim();
      const inOwnQueue = (await badge.getAttribute("data-queue")) === own;
      expect(shown.startsWith(`${mark} `), `${queue}: "${shown}"`).toBe(!inOwnQueue);
      expect(shown.startsWith(`${own === "flex" ? "Flex" : "Solo"} `)).toBe(false);
    }
    if (queue === "Ranked Flex") flex = true;
    if (queue === "Ranked Solo/Duo") solo = true;
    await closeMatch(page);
  }
  expect(solo && flex, "a Solo/Duo and a Flex game among the first ten").toBe(true);
});

test("Riot is asked only for missing or stale ranks, once: a match opened again asks nothing", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one server, so once is enough");
  const seen = watchChecks(page);
  await openHistory(page, "JUNGLE");
  await openMatch(page, 4);
  await seen.settled();
  // The first opening asks at most the players of this one match (members' synced ranks are current).
  for (const c of seen.checks) expect(c.asked + c.skipped).toBeLessThanOrEqual(10);
  const before = await page.$$eval('[data-testid="participant-rank"]', (els) => els.map((e) => `${e.getAttribute("data-state")}:${e.getAttribute("title")}`));
  await closeMatch(page);
  // A fresh list (another visit) and the same match: stored ranks shown, nothing asked of Riot.
  const first = seen.checks.length;
  await page.reload();
  await page.waitForLoadState("networkidle");
  await openMatch(page, 4);
  await seen.settled();
  for (const c of seen.checks.slice(first)) expect(c.asked).toBe(0);
  const after = await page.$$eval('[data-testid="participant-rank"]', (els) => els.map((e) => `${e.getAttribute("data-state")}:${e.getAttribute("title")}`));
  expect(after).toEqual(before);
});

test("the badges keep the scoreboard's rows: inside their column, nothing overlapping, no sideways scroll", async ({ page }) => {
  await openHistory(page, "SUPPORT");
  await openMatch(page, 0);
  const rows = page.locator('[data-testid="participant"]:not([data-removed])');
  for (let i = 0; i < (await rows.count()); i++) {
    const row = rows.nth(i);
    const badge = (await row.getByTestId("participant-rank").boundingBox())!;
    const box = (await row.boundingBox())!;
    const name = (await row.getByTestId("participant-name").boundingBox())!;
    // Left of the KDA column, below the name.
    const kda = (await row.getByTestId("participant-kda").boundingBox())!;
    expect(badge.x).toBeGreaterThanOrEqual(box.x);
    expect(badge.x + badge.width).toBeLessThanOrEqual(kda.x + 0.5);
    expect(badge.y).toBeGreaterThanOrEqual(name.y + name.height - 1);
    expect(badge.height).toBeLessThanOrEqual(17);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
