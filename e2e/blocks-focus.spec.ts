import { expect, test, type Page } from "@playwright/test";
import { memberContext } from "./member-account";

/*
  Solo Queue Blocks focus, on a real member account (in-memory demo): the champions follow the
  Primary Role pool until the player chooses one, and the objective saves itself: "Saving…", then
  "Saved" only once the server confirmed it; a failed save says so, keeps the text and saves on
  "Try again"; leaving the page right after typing still saves.
*/

test.skip(({ isMobile }) => !!isMobile, "one desktop pass is enough; phones are covered in the layout checks");

const objective = (page: Page) => page.getByTestId("focus-objective");
const status = (page: Page) => page.getByTestId("focus-save-status");

test("the focus follows the pool and saves itself, honestly", async ({ browser, page }) => {
  await page.goto("/team");
  const member = await memberContext(browser, page);
  const p = member.page;
  try {
    await p.goto("/overview/blocks");
    const focus = p.getByTestId("ranked-focus");
    await expect(focus).toBeVisible();
    // Nothing chosen yet: the featured champion is the first of the Mid pool set up at sign-up.
    const featured = p.getByTestId("focus-slot-champion1");
    await expect(featured).toHaveAttribute("data-source", "pool");
    await expect(featured).toContainText("Mid pool #1");
    await expect(focus).toHaveAttribute("data-follows-pool", "true");
    await expect(p.getByTestId("focus-pool-note")).toContainText("Following your Mid pool");

    // Typing saves after a pause: Saving…, then Saved; there is no Save button.
    await expect(focus.getByRole("button", { name: /^Save$/ })).toHaveCount(0);
    await objective(p).fill("Ward the river before the second back.");
    await expect(status(p)).toHaveAttribute("data-state", "saved", { timeout: 10_000 });
    await expect(status(p)).toHaveText("Saved");
    await p.reload();
    await expect(objective(p)).toHaveValue("Ward the river before the second back.");

    // A failed save: never "Saved"; the text stays; "Try again" saves it once the server answers.
    await p.route("**/overview/blocks", (route) => (route.request().method() === "POST" && route.request().headers()["next-action"] ? route.abort() : route.continue()));
    await objective(p).fill("Track the enemy jungler.");
    await objective(p).blur();
    await expect(status(p)).toHaveAttribute("data-state", "error", { timeout: 10_000 });
    await expect(status(p)).toContainText("Couldn't save");
    await expect(status(p)).not.toContainText("Saved");
    await expect(objective(p)).toHaveValue("Track the enemy jungler.");
    await p.unroute("**/overview/blocks");
    await p.getByTestId("focus-retry").click();
    await expect(status(p)).toHaveAttribute("data-state", "saved", { timeout: 10_000 });
    await p.reload();
    await expect(objective(p)).toHaveValue("Track the enemy jungler.");

    // Leaving the field (Tab) saves at once, before the typing pause.
    await objective(p).fill("Trade around cooldowns.");
    await p.keyboard.press("Tab");
    await expect(status(p)).toHaveAttribute("data-state", "saved", { timeout: 10_000 });
    await p.goto("/overview");
    await p.goto("/overview/blocks");
    await expect(objective(p)).toHaveValue("Trade around cooldowns.");

    // Clearing the featured champion empties it on purpose; "Use my pool order" brings the pool back.
    await featured.getByRole("button", { name: /^Remove / }).click();
    await expect(featured).toHaveAttribute("data-source", "none");
    await expect(status(p)).toHaveAttribute("data-state", "saved", { timeout: 10_000 });
    await p.reload();
    await expect(p.getByTestId("focus-slot-champion1")).toHaveAttribute("data-source", "none");
    await p.getByTestId("focus-use-pool").click();
    await expect(p.getByTestId("focus-slot-champion1")).toHaveAttribute("data-source", "pool");
    await expect(status(p)).toHaveAttribute("data-state", "saved", { timeout: 10_000 });
  } finally {
    await member.context.close();
  }
});
