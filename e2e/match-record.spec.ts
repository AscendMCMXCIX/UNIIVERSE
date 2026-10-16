import { expect, test, type Page } from "@playwright/test";
import { startDraft } from "./draft-flow";

/*
  D1/D2 in a real browser: a match record open in one tab must not undo a Riot link made in
  another (or by "Link this game") when it is saved, and saving must not move the match's date.
  Desktop only: the editor is the same component at every size, and one full draft is enough.
*/

async function finishDraft(page: Page) {
  const done = page.getByTestId("final-board");
  const rec = page.getByTestId("recommendation").getByRole("button").first();
  const tile = page.getByTestId("champion-grid").locator("button[data-champion]:not([disabled])").first();
  for (let n = 0; n < 24; n++) {
    // Wait for the room to settle into a state: finished, or something to act on.
    await expect(done.or(rec).or(tile).first()).toBeVisible({ timeout: 30_000 });
    if (await done.count()) break;
    if ((await rec.isVisible().catch(() => false)) && (await rec.isEnabled().catch(() => false))) await rec.click();
    else {
      await tile.click();
      await page.getByTestId("confirm-action").click();
    }
    await page.getByText("Updating recommendation").waitFor({ state: "hidden", timeout: 30_000 }).catch(() => undefined);
  }
  await expect(done).toBeVisible({ timeout: 30_000 });
}

test("a save from a stale tab never undoes a Riot link, and saving keeps the date", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop only");
  test.setTimeout(180_000);
  await startDraft(page);
  await finishDraft(page);
  await page.goto("/matches?view=drafted");
  await page.getByTestId("match-find-riot").first().click();
  await page.waitForURL(/\/matches\/[0-9a-f-]+/);
  const record = new URL(page.url()).pathname;
  const date = await page.getByTestId("match-played-on").inputValue();
  expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  // Tab A has the record open with an unsaved note. Tab B links the Riot game meanwhile.
  await page.getByPlaceholder("What happened, what to remember next time…").fill("Lost lane early.");
  const b = await context.newPage();
  await b.goto(record);
  await b.getByTestId("match-riot-id").fill("OC1_123456789");
  await b.getByRole("button", { name: "Link", exact: true }).click();
  await expect(b.getByText("Match ID saved")).toBeVisible();
  await b.close();

  // A's save is made against the version before the link: refused, nothing written, edits kept.
  await page.getByTestId("match-save").click();
  await expect(page.getByText("This match changed after you opened it")).toBeVisible();
  await expect(page.getByTestId("match-riot-id")).toHaveValue("OC1_123456789");
  await expect(page.getByPlaceholder("What happened, what to remember next time…")).toHaveValue("Lost lane early.");

  // Saving again now succeeds and keeps the link and the date.
  await page.getByTestId("match-save").click();
  await expect(page.getByText("Match saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("match-riot-id")).toHaveValue("OC1_123456789");
  await expect(page.getByPlaceholder("What happened, what to remember next time…")).toHaveValue("Lost lane early.");
  await expect(page.getByTestId("match-played-on")).toHaveValue(date);
});
