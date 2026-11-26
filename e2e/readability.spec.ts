import { expect, test, type Page } from "./test";
import { TEXT_TIERS, readTypeFacts, tiersDeployed } from "../scripts/type-facts.mjs";

/*
  The text hierarchy (the owner's readability request, 25 Nov 2026; docs/STANDARDS.md, "Type"): four
  text tiers, figures primary, labels secondary in sentence case, metadata tertiary, and one disabled
  look. Read with the Production check's own reading (scripts/type-facts.mjs), so the demo here and
  production there are judged alike; then what the shared components draw: a disabled control in the
  disabled tone (never half transparent), All Champions' figures all primary with the sorted column
  semibold under a sentence-case heading, and the InfoTip at the body text size.
*/

const DISABLED = "rgb(112, 117, 140)";

async function midPlayer(page: Page) {
  await page.goto("/team");
  return (await page.getByTestId("lineup-row-MID").getAttribute("data-player-id"))!;
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}

test.describe("the text hierarchy", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  });

  test("the four tiers are deployed; the profile and Settings draw no capitals outside a pill and no live text in the disabled tone; Team Overview keeps its capitals", async ({ page }) => {
    const id = await midPlayer(page);
    await settle(page);
    const team = await page.evaluate(readTypeFacts);
    expect(tiersDeployed(team.tiers), JSON.stringify(team.tiers)).toBe(true);
    expect(team.tiers).toEqual(TEXT_TIERS);
    expect(team.disabledTone.live, "Team Overview: live text in the disabled tone").toBe(0);
    // Team Overview is approved with its capitals (the card's labels): they are still there.
    expect(team.capitals.length, "Team Overview keeps its approved capitals").toBeGreaterThan(0);
    for (const path of [`/players/${id}`, `/players/${id}/champions`, "/settings"]) {
      await page.goto(path);
      await settle(page);
      const f = await page.evaluate(readTypeFacts);
      expect(f.capitals, `${path}: text in capitals outside a pill`).toEqual([]);
      expect(f.disabledTone.live, `${path}: live text in the disabled tone`).toBe(0);
    }
  });

  test("a disabled control is drawn in the disabled tone with the not-allowed cursor, never half transparent", async ({ page }) => {
    await page.goto("/settings");
    // Change password is disabled until the fields are filled; the device rows' Clear while nothing is kept.
    const change = page.getByRole("button", { name: "Change password" });
    await expect(change).toBeDisabled();
    const look = await change.evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, cursor: s.cursor, opacity: s.opacity };
    });
    expect(look).toEqual({ color: DISABLED, cursor: "not-allowed", opacity: "1" });
    // Hovered, it does not light up.
    await change.hover({ force: true });
    expect(await change.evaluate((el) => getComputedStyle(el).color)).toBe(DISABLED);
  });

  test("the InfoTip's bubble is at the body text size", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "the bubble opens on hover; one size is enough for its type");
    await page.goto("/team");
    const tip = page.getByTestId("team-header").getByTestId("info-tip").first();
    await tip.hover();
    const bubble = page.getByTestId("info-tip-bubble");
    await expect(bubble).toBeVisible();
    expect(await bubble.evaluate((el) => getComputedStyle(el).fontSize)).toBe("14px");
  });
});
