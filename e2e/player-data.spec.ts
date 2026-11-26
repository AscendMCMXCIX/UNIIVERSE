import { expect, test, type Page } from "./test";

/*
  Riot data (src/components/team/player-data-panel.tsx), in a profile's Riot accounts tab under "Data
  diagnostics" (for those who manage data): the metrics as many columns as fit 10rem each, so a label
  at 150–200% text never runs into the next column (two fixed columns on a phone did, the release's
  review); the phone list's figures primary beside their secondary words, as the table's cells are;
  and the experience label's why in the shared breakdown (BreakdownPopover), never a giant tip.
*/

const PRIMARY = "rgb(238, 240, 246)";
const SECONDARY = "rgb(201, 205, 219)";

async function openDiagnostics(page: Page) {
  await page.goto("/team");
  const id = await page.getByTestId("lineup-row-MID").getAttribute("data-player-id");
  await page.goto(`/players/${id}/accounts`);
  const fold = page.getByTestId("data-diagnostics");
  await expect(fold).toHaveCount(1);
  await fold.locator("summary").click();
  await expect(fold).toHaveAttribute("open", "");
  const metrics = fold.getByTestId("player-data-metrics");
  await expect(metrics).toBeVisible();
  return { fold, metrics };
}

/** Each metric's box, and whether any two overlap or any runs past the panel or the screen. */
function layout(page: Page) {
  return page.getByTestId("player-data-metrics").evaluate((grid) => {
    const items = [...grid.children].map((el) => {
      // A metric's label and value: the widest of its parts (a word that cannot break runs past its box).
      const parts = [...el.querySelectorAll("*")].filter((p) => p.getClientRects().length > 0 && !p.closest(".sr-only"));
      const r = el.getBoundingClientRect();
      const right = Math.max(r.right, ...parts.map((p) => p.getBoundingClientRect().right));
      return { left: r.left, top: r.top, right, bottom: r.bottom };
    });
    const overlaps = items.some((a, i) => items.some((b, j) => i !== j && Math.abs(a.top - b.top) < 1 && a.left < b.left && a.right > b.left + 0.5));
    const box = grid.getBoundingClientRect();
    return { columns: new Set(items.map((i) => Math.round(i.left))).size, overlaps, pastPanel: Math.max(...items.map((i) => i.right)) > box.right + 0.5, sideways: document.documentElement.scrollWidth > innerWidth + 1 };
  });
}

test("Riot data's metrics: as many columns as fit, one on a phone; none runs into the next at 150% or 200% text", async ({ page }, info) => {
  await openDiagnostics(page);
  const normal = await layout(page);
  expect(normal.overlaps, "no metric runs into the next").toBe(false);
  expect(normal.sideways, "nothing wider than the screen").toBe(false);
  if (info.project.name === "phone") expect(normal.columns, "one column on a phone").toBe(1);
  else expect(normal.columns, "side by side on a tablet or computer").toBeGreaterThan(1);
  // A phone at a larger text size (the root's size, as a browser's text setting sets it), 320px wide too.
  if (info.project.name !== "phone") return;
  for (const [width, text] of [[375, 1.5], [375, 2], [320, 2]] as const) {
    await page.setViewportSize({ width, height: 700 });
    await page.addStyleTag({ content: `html { font-size: ${text * 100}% !important; }` });
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const at = await layout(page);
    expect(at.columns, `${width}px at ${text * 100}%: one column`).toBe(1);
    expect(at.overlaps, `${width}px at ${text * 100}%: no metric runs into the next`).toBe(false);
  }
});

test("Riot data's champions: the phone list's figures primary beside secondary words; the experience label opens its why in the shared breakdown", async ({ page }, info) => {
  const { fold } = await openDiagnostics(page);
  const phone = (page.viewportSize()?.width ?? 1000) < 768;
  if (phone) {
    const line = fold.getByTestId("player-data-figures").first();
    await expect(line).toBeVisible();
    expect(await line.evaluate((el) => getComputedStyle(el).color)).toBe(SECONDARY);
    const figures = await line.locator("span.tabular-nums").evaluateAll((els) => els.map((el) => getComputedStyle(el).color));
    expect(figures.length).toBeGreaterThanOrEqual(4);
    for (const c of figures) expect(c).toBe(PRIMARY);
  }
  // The label is the trigger: a press opens the breakdown, headed by the label, the tier's rule then its notes; no tip.
  const trigger = fold.locator("[data-testid=tier-why]:visible").first();
  await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
  const label = (await trigger.innerText()).trim();
  await expect(trigger).toHaveAccessibleName(`${label}: why`);
  await trigger.click();
  const breakdown = page.getByTestId("tier-why-breakdown");
  await expect(breakdown).toBeVisible();
  await expect(breakdown.getByRole("heading", { name: label })).toBeVisible();
  await expect(page.getByTestId("info-tip-bubble")).toHaveCount(0);
  const box = (await breakdown.boundingBox())!;
  const view = page.viewportSize()!;
  expect(box.x >= -0.5 && box.x + box.width <= view.width + 0.5, "inside the screen").toBe(true);
  await page.keyboard.press("Escape");
  await expect(breakdown).toHaveCount(0);
  if (!phone || info.project.name === "phone") await expect(trigger).toBeFocused();
});
