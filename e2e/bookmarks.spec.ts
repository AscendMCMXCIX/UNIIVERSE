import { expect, test } from "./test";

/*
  R6 team bookmarks on the demo roster: bookmark a game played together, find it under
  Matches → Bookmarked, and remove it again (the list is empty afterwards). Shared state on the
  one demo server, so it runs once, on the desktop project, and leaves nothing behind.
*/

test.beforeEach(async ({ context, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on the desktop project");
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

test("bookmark a game played together, find it under Bookmarked, remove it", async ({ page }) => {
  await page.goto("/matches");
  const first = page.getByTestId("together-game").first();
  const matchId = await first.getAttribute("data-match-id");
  expect(matchId).toBeTruthy();
  await first.getByTestId("bookmark-game").click();
  await expect(first.getByTestId("bookmark-game")).toHaveAttribute("data-bookmarked", "true");

  await page.getByTestId("together-saved").click();
  await expect(page).toHaveURL(/saved=1/);
  await expect(page.getByTestId("together-saved")).toHaveAttribute("aria-current", "page");
  const saved = page.getByTestId("together-game");
  await expect(saved).toHaveCount(1);
  await expect(saved.first()).toHaveAttribute("data-match-id", matchId!);
  // The member-count filter does not apply to bookmarks.
  await expect(page.getByTestId("together-min")).toHaveCount(0);

  await saved.first().getByTestId("bookmark-game").click();
  await page.reload();
  await expect(page.getByTestId("together-empty")).toContainText("No bookmarked games yet");
});
