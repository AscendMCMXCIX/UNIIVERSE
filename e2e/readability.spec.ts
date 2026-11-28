import { expect, test, type Page } from "./test";
import { pick } from "./select";
import { TABLE_FIGURES, TEXT_TIERS, readTableFigures, readTypeFacts, tableFigureVerdicts, tiersDeployed } from "../scripts/type-facts.mjs";

/*
  The text hierarchy (the owner's readability request, 25 Nov 2026; docs/STANDARDS.md, "Type"): four
  text tiers, figures primary, labels secondary in sentence case, metadata tertiary, and one disabled
  look. Read with the Production check's own reading (scripts/type-facts.mjs), so the demo here and
  production there are judged alike; then what the shared components draw: a disabled control in the
  disabled tone (never half transparent), All Champions' figures all primary with the sorted column
  semibold under a sentence-case heading (its narrow rows too: the sorted figure and the games count
  primary, the record secondary), and the InfoTip at the body text size.
*/

const DISABLED = "rgb(112, 117, 140)";
const PRIMARY = "rgb(238, 240, 246)";
const SECONDARY = "rgb(201, 205, 219)";
const TERTIARY = "rgb(162, 168, 188)";

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

  test("the four tiers are deployed; Team Overview, the profile and Settings draw no capitals outside a pill and no live text in the disabled tone", async ({ page }) => {
    const id = await midPlayer(page);
    await settle(page);
    const team = await page.evaluate(readTypeFacts);
    expect(tiersDeployed(team.tiers), JSON.stringify(team.tiers)).toBe(true);
    expect(team.tiers).toEqual(TEXT_TIERS);
    expect(team.disabledTone.live, "Team Overview: live text in the disabled tone").toBe(0);
    // Team Overview's labels are sentence case since 27 Nov 2026 (the owner's decision D4; its backdrop lettering, artwork hidden
    // from screen readers, and a member's own name style keep their capitals, and the reader leaves both out).
    expect(team.capitals, "Team Overview: text in capitals outside a pill").toEqual([]);
    for (const path of [`/players/${id}`, `/players/${id}/champions`, "/settings"]) {
      await page.goto(path);
      await settle(page);
      const f = await page.evaluate(readTypeFacts);
      expect(f.capitals, `${path}: text in capitals outside a pill`).toEqual([]);
      expect(f.disabledTone.live, `${path}: live text in the disabled tone`).toBe(0);
    }
  });

  test("a disabled control is drawn in the disabled tone with the not-allowed cursor, never half transparent", async ({ page }) => {
    // Settings' Password section (on a desktop window one section is shown at a time; the flow ignores ?section=).
    await page.goto("/settings?section=password");
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

  test("All Champions: every figure in a table column is primary, the sorted column's in semibold under its semibold heading; a dash or a zero is tertiary", async ({ page }) => {
    const id = await midPlayer(page);
    await page.goto(`/players/${id}/champions`);
    await expect(page.getByTestId("top-champion").first()).toBeVisible();
    await settle(page);
    test.skip(!(await page.getByTestId("all-champions-header").isVisible()), "narrow rows at this width (the next test)");
    // The table's figure cells, wherever this width shows them (medium or wide layout), by column.
    const FIGURES = ["champion-kda", "champion-cs", "champion-kills", "champion-double", "champion-triple", "champion-quadra", "champion-penta", "mastery-points"];
    const cells = () =>
      page.evaluate((ids) => {
        const out: Array<{ id: string; text: string; color: string; weight: string }> = [];
        for (const row of document.querySelectorAll("[data-testid=top-champion]")) {
          for (const id of ids) {
            const el = row.querySelector<HTMLElement>(`[data-testid=${id}]`);
            if (!el || el.getBoundingClientRect().width === 0) continue;
            const s = getComputedStyle(el);
            out.push({ id, text: (el.querySelector("[aria-hidden]")?.textContent ?? el.textContent ?? "").trim(), color: s.color, weight: s.fontWeight });
          }
        }
        return out;
      }, FIGURES);
    const heads = () =>
      page.getByTestId("all-champions-header").locator("[data-testid^=sort-]").evaluateAll((els) =>
        els.filter((el) => el.getBoundingClientRect().width > 0).map((el) => ({ id: el.getAttribute("data-testid")!, sorted: !!el.closest("[data-sort]"), weight: getComputedStyle(el).fontWeight, color: getComputedStyle(el).color })),
      );
    const check = async (sortedId: string | null) => {
      const found = await cells();
      expect(found.length, "the table shows figure columns at this width").toBeGreaterThan(0);
      for (const c of found) {
        if (c.text === "—" || c.text === "0") {
          expect(c.color, `${c.id} "${c.text}": a dash (not counted yet) or a zero count is tertiary`).toBe(TERTIARY);
          continue;
        }
        expect(c.color, `${c.id} ${c.text}: a figure is primary`).toBe(PRIMARY);
        expect(c.weight, `${c.id} ${c.text}: semibold only in the sorted column`).toBe(c.id === sortedId ? "600" : "400");
      }
      for (const h of await heads()) {
        expect(h.weight, `${h.id}: the sorted heading alone is semibold`).toBe(h.sorted ? "600" : "500");
        expect(h.color, `${h.id}: the sorted heading primary, the others secondary`).toBe(h.sorted ? PRIMARY : SECONDARY);
      }
    };
    // The Production check's own reading of the table (scripts/type-facts.mjs) agrees.
    const production = async () => {
      const facts = await page.evaluate(readTableFigures, TABLE_FIGURES);
      expect(facts.cells).toBeGreaterThan(0);
      expect(tableFigureVerdicts({ kind: "e2e", facts }).map((v) => v.status), JSON.stringify(facts)).toEqual(["PASS"]);
    };
    // Sorted by games (the default): no figure column is semibold. (Read again until the headings'
    // colour transition, 150ms, has ended.)
    await expect(() => check(null)).toPass({ timeout: 5_000 });
    await production();
    await page.getByTestId("sort-kda").click();
    await expect(page.getByTestId("all-champions-header").locator("[data-sort]")).toContainText("KDA");
    await page.mouse.move(0, 0);
    await expect(() => check("champion-kda")).toPass({ timeout: 5_000 });
    await production();
  });

  test("All Champions' narrow rows: the sorted figure under the name and the games count are primary, the record secondary", async ({ page }) => {
    const id = await midPlayer(page);
    await page.goto(`/players/${id}/champions`);
    const first = page.getByTestId("top-champion").first();
    await expect(first).toBeVisible();
    await settle(page);
    test.skip(await page.getByTestId("all-champions-header").isVisible(), "the table's columns at this width (the test above)");
    // Sorted by games: the count strong and primary; the line around it (the record) secondary.
    const games = first.getByTestId("champion-row-games");
    expect(await games.evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el).fontWeight])).toEqual([PRIMARY, "600"]);
    expect(await games.evaluate((el) => getComputedStyle(el.parentElement!).color)).toBe(SECONDARY);
    const select = page.locator("#all-champions-sort-by");
    await expect(async () => {
      await pick(select, "kda");
      await expect(first.getByTestId("champion-sorted-figure")).toContainText("KDA", { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    expect(await first.getByTestId("champion-sorted-figure").evaluate((el) => getComputedStyle(el).color)).toBe(PRIMARY);
    expect(await first.getByTestId("champion-role-line").evaluate((el) => getComputedStyle(el).color)).toBe(SECONDARY);
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
