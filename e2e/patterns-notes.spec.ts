import { expect, test } from "@playwright/test";
import { memberContext } from "./member-account";

/*
  Patterns & Notes (in-memory demo): on a member's own Solo Queue Blocks and own profile, marked as
  theirs alone; never on a teammate's profile. Notes save as you type and are there after a reload.
  A new member has no games yet, so the patterns say what they need instead of guessing.
*/

test.skip(({ isMobile }) => !!isMobile, "one desktop pass is enough; phones are covered in the layout checks");

test("your patterns and notes are yours: on your own pages only, saved as you type", async ({ browser, page, context, baseURL }) => {
  // A teammate's profile never shows patterns (the demo owner is the Mid player; Top is a teammate).
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}`);
  await expect(page.getByTestId("profile-progress")).toBeVisible();
  await expect(page.getByTestId("patterns-summary")).toHaveCount(0);

  const member = await memberContext(browser, page);
  const p = member.page;
  try {
    await p.goto("/overview/blocks");
    const both = p.getByTestId("patterns-and-notes");
    await expect(both).toBeVisible();
    await expect(both.getByTestId("patterns-full")).toContainText("Only you");
    await expect(both.getByTestId("patterns-empty")).toContainText(/at least 10 Ranked games/);
    const notes = p.getByTestId("notes-input");
    await notes.fill("Track the enemy jungler.\nPing before roaming.");
    await expect(p.getByTestId("notes-save-status")).toHaveAttribute("data-state", "saved", { timeout: 10_000 });
    await p.reload();
    await expect(p.getByTestId("notes-input")).toHaveValue("Track the enemy jungler.\nPing before roaming.");
    // Your own profile: the compact patterns, linking to Patterns & Notes.
    await p.goto("/overview");
    const summary = p.getByTestId("patterns-summary");
    await expect(summary).toBeVisible();
    await expect(summary.getByTestId("patterns-more")).toHaveAttribute("href", "/overview/blocks#patterns");
    expect(await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  } finally {
    await member.context.close();
  }
});
