import { expect, test, type Page } from "./test";
import { expectNoSeriousAxe } from "./axe";
import { highElo, openMatchupIntel } from "./matchup-intel";

/*
  Matchup Intel's observed Master+ games (docs/HIGH_ELO_EVIDENCE.md, "What the page shows"), over
  the in-memory demo's counts (src/server/demo/high-elo.ts) with the browser-test cookie, while the
  real collection is switched off: the third section of the evidence fold, all regions first, every
  line with its n and interval, a region one press away, under a threshold said as such, and
  observed statistics kept apart from the curated briefing. With the switch off (no cookie), the page
  says the evidence is not collected, as production does.
*/

async function openEvidence(page: Page) {
  const tips = page.getByTestId("matchup-riot-tips");
  await tips.getByTestId("matchup-riot-tips-summary").click();
  const panel = tips.getByTestId("matchup-evidence-panel");
  await expect(panel).toBeVisible();
  return { tips, panel };
}

test("with the collection off, the page says high-elo evidence is not collected and shows none", async ({ page }) => {
  await openMatchupIntel(page, "Riven", "Darius");
  const { panel } = await openEvidence(page);
  await expect(panel.getByTestId("matchup-evidence-high-elo")).toHaveText("Runes, items and skill order: No high-elo evidence (not collected)");
  await expect(panel.getByTestId("evidence-high")).toHaveCount(0);
});

test("the observed Master+ games: all regions first, each line with its n and interval, a region one press away", async ({ page }) => {
  await highElo(page, "on");
  await openMatchupIntel(page, "Riven", "Darius");
  const { tips, panel } = await openEvidence(page);
  const high = panel.getByTestId("evidence-high");
  await expect(high.getByTestId("high-elo-tier")).toHaveText("Observed in Master+ ranked games · all regions (n = 640)");
  await expect(tips.getByTestId("matchup-evidence-tiers")).toContainText("Master+ games (n = 640)");
  // Observed, not advice; and the "not collected" line is gone.
  await expect(high.getByTestId("high-elo-not-advice")).toContainText("Observed shares, not advice");
  await expect(panel.getByTestId("matchup-evidence-high-elo")).toHaveCount(0);
  const line = (key: string) => high.locator(`[data-testid="evidence-line"][data-key="${key}"]`);
  await expect(line("record")).toContainText(/Riven in Top: \d+\.\d% won \(95% interval \d+\.\d%–\d+\.\d%/);
  await expect(line("record")).toContainText(/n = 640 \(effective \d+\) · patch 26\.22/);
  await expect(line("pair")).toContainText(/^Against Darius: /);
  await expect(line("ks")).toContainText(/^Keystone: Conqueror \d+% · /);
  await expect(line("end")).toContainText(/^Lane end: the middle half between \d+:\d\d and \d+:\d\d, median \d+:\d\d/);
  // A region: its own games and n.
  const regions = high.getByTestId("high-elo-regions");
  await expect(regions.getByRole("radio", { name: "All regions" })).toHaveAttribute("aria-checked", "true");
  await regions.getByRole("radio", { name: "Southeast Asia and Oceania" }).click();
  await expect(high.getByTestId("high-elo-tier")).toHaveText("Observed in Master+ ranked games · Southeast Asia and Oceania (n = 60)");
  await expect(line("pair")).toContainText(/fewer than the 100 a result against one opponent needs/);
});

test("under a threshold the section says how many games there are and how many it needs", async ({ page }) => {
  await highElo(page, "on");
  await openMatchupIntel(page, "Ambessa", "Renekton");
  const { panel } = await openEvidence(page);
  const high = panel.getByTestId("evidence-high");
  await expect(high.getByTestId("high-elo-empty")).toHaveText(/^Master\+ games: 20 for Ambessa in Top on patch 26\.22 \(effective \d+\), fewer than the 30 a result needs\.$/);
  await expect(high.getByTestId("evidence-line")).toHaveCount(0);
  await high.getByTestId("high-elo-regions").getByRole("radio", { name: "Southeast Asia and Oceania" }).click();
  await expect(high.getByTestId("high-elo-empty")).toHaveText("Master+ games: none counted for Ambessa in Top on patch 26.22 yet.");
});

test("the section fits: no sideways scroll at 320 with 200% text, 44px region targets on touch, and axe finds nothing", async ({ page }, info) => {
  await highElo(page, "on");
  // A phone at 320 with its text at 200%, as the other large-text tests set it (html's font size: the page's sizes are in rem).
  if (info.project.name === "phone") await page.setViewportSize({ width: 320, height: 640 });
  await openMatchupIntel(page, "Riven", "Darius");
  if (info.project.name === "phone") await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  const { panel } = await openEvidence(page);
  const high = panel.getByTestId("evidence-high");
  await expect(high).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  if (info.project.use.hasTouch) {
    for (const box of await high.getByTestId("high-elo-regions").getByRole("radio").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(box).toBeGreaterThanOrEqual(44);
  }
  await expectNoSeriousAxe(page, "matchup intel with high-elo evidence", ['[data-testid="evidence-high"]']);
});
