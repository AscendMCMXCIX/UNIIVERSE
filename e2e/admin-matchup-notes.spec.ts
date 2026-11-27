import { expect, test, type Page } from "./test";
import { expectNoSeriousAxe } from "./axe";
import { memberContext } from "./member-account";
import { pick } from "./select";

/*
  Admin Mode → Platform Settings → Matchup notes (docs/MATCHUP_INTEL.md, "Curation"): the queue
  ranked by how often the team met each lane opponent and pairing, the editor (its refused words
  said with why, the abilities a point rests on, the sources), publishing to Matchup Intel in
  Champion Intel's Compare, the re-review and retiring; a member who is not an administrator is
  refused. On the in-memory demo: two published opponent notes (Zed in Mid, Darius in Top).
*/

// The second test re-reviews and retires the note the first one publishes (the demo's own notes stay as they are for Matchup Intel's tests).
test.describe.configure({ mode: "serial" });

const admin = async (page: Page, baseURL: string) => {
  await page.context().addCookies([{ name: "uniiverse_view", value: "admin", url: baseURL }]);
  await page.goto("/admin/matchup-notes");
  await expect(page.getByTestId("matchup-notes-admin")).toBeVisible();
};

test("the queue ranks what to write first; a note is written with the abilities it rests on, refused with why on a verdict word, published, and shown in Matchup Intel", async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on the desktop project");
  test.setTimeout(90_000);
  await admin(page, baseURL!);
  await expect(page.getByTestId("admin-settings-tabs").getByRole("link")).toHaveText(["Branding", "Previews", "Resources", "Matchup notes"]);
  const counts = page.getByTestId("matchup-notes-counts");
  await expect(counts).toHaveAttribute("data-published", "2");
  await expect(counts).toHaveAttribute("data-review", "0");
  // Sections in order: re-review, not written yet (opponents first, the most met first), fresh.
  const sections = await page.getByTestId("matchup-notes-queue").locator("section, details").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  expect(sections.slice(0, 2)).toEqual(["matchup-queue-review-section", "matchup-queue-unwritten-section"]);
  const unwritten = page.getByTestId("matchup-queue-unwritten-section").getByTestId("matchup-queue-row");
  await expect(unwritten.first()).toBeVisible();
  const games = await unwritten.getByTestId("matchup-queue-games").allTextContents();
  const n = games.map((t) => Number(/^(\d+)/.exec(t)?.[1] ?? 0));
  const opponents = await unwritten.evaluateAll((els) => els.map((e) => (e.getAttribute("data-key") ?? "").startsWith("opponent|")));
  // Opponents before pairings, each kind by games.
  expect(opponents.indexOf(false) === -1 || opponents.slice(opponents.indexOf(false)).every((o) => !o)).toBe(true);
  for (let i = 1; i < n.length; i++) if (opponents[i] === opponents[i - 1]) expect(n[i]!, "by games").toBeLessThanOrEqual(n[i - 1]!);
  // Champion names and counts only: no member named.
  expect(await page.getByTestId("matchup-notes-queue").textContent()).not.toMatch(/Demo (Top|Jungle|Mid|ADC|Support|Sub)/);
  await expectNoSeriousAxe(page, "Matchup notes' queue", ["[data-testid=matchup-notes-admin]"]);

  // A new pair note: Garen against Darius in Top.
  await page.getByTestId("matchup-notes-new").click();
  const editor = page.getByTestId("matchup-editor");
  await expect(editor).toBeVisible();
  await page.getByTestId("matchup-editor-scope-pair").click();
  await page.getByTestId("matchup-editor-role").getByTestId("matchup-editor-role-TOP").click();
  await pick(page.getByTestId("matchup-editor-champion"), "Garen");
  await pick(page.getByTestId("matchup-editor-opponent"), "Darius");
  await page.getByTestId("matchup-editor-text").fill("You should stay away from Darius's pull.");
  await page.getByTestId("matchup-editor-source-title").fill("Darius's E and Garen's Q tooltips");
  await page.getByTestId("matchup-editor-publish").click();
  await expect(page.locator('[data-testid="matchup-editor-problem"][data-field="points.0"]')).toContainText('"you" is an instruction to the player');
  await expect(page.locator('[data-testid="matchup-editor-problem"][data-field="points.0.refs"]')).toContainText("Name the abilities");
  await page.getByTestId("matchup-editor-text").fill("Darius's E pulls champions in front of him; Garen's Q removes the slows on Garen.");
  await page.locator('[data-testid="matchup-editor-ref"][data-ref="Darius.E"]').click();
  await page.locator('[data-testid="matchup-editor-ref"][data-ref="Garen.Q"]').click();
  await expect(page.locator('[data-testid="matchup-editor-ref"][data-ref="Darius.E"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("matchup-editor-preview")).toContainText("Darius E, Garen Q");
  // A change of scope keeps only the refs of champions still in it (27 Nov 2026: Garen Q stayed, with no toggle to remove it, and the save was refused).
  await page.getByTestId("matchup-editor-scope-opponent").click();
  await expect(page.locator('[data-testid="matchup-editor-ref"][data-ref="Garen.Q"]')).toHaveCount(0);
  await expect(page.getByTestId("matchup-editor-preview")).toContainText("Darius E");
  await expect(page.getByTestId("matchup-editor-preview")).not.toContainText("Garen Q");
  await page.getByTestId("matchup-editor-scope-pair").click();
  await pick(page.getByTestId("matchup-editor-champion"), "Garen");
  await page.locator('[data-testid="matchup-editor-ref"][data-ref="Garen.Q"]').click();
  await expect(page.getByTestId("matchup-editor-preview")).toContainText("Darius E, Garen Q");
  // A source's title is shown in the band: held to the refused words too (27 Nov 2026), and a player's profile is no source.
  await page.getByTestId("matchup-editor-source-title").fill("How to counter Darius");
  await pick(page.locator("#matchup-source-kind-0"), "wiki");
  await page.locator("#matchup-source-url-0").fill("https://www.op.gg/summoners/euw/Someone-EUW");
  await page.getByTestId("matchup-editor-publish").click();
  await expect(page.locator('[data-testid="matchup-editor-problem"][data-field="sources.0.title"]')).toContainText('"counter" is a verdict on the matchup');
  await expect(page.locator('[data-testid="matchup-editor-problem"][data-field="sources.0.url"]')).toContainText("player's profile");
  await page.getByTestId("matchup-editor-source-title").fill("Darius on the League of Legends Wiki");
  await page.locator("#matchup-source-url-0").fill("https://wiki.leagueoflegends.com/en-us/Darius");
  await expectNoSeriousAxe(page, "the note editor", ["dialog[open]"]);
  await page.getByTestId("matchup-editor-publish").click();
  await expect(editor).toHaveCount(0);
  await expect(counts).toHaveAttribute("data-published", "3");
  // On Champion Intel: the pair note first, then the opponent note on Darius.
  await page.goto("/lookup?champion=Garen&champion2=Darius&lane=TOP");
  const notes = page.getByTestId("matchup-band").getByTestId("matchup-notes");
  await expect(notes.getByTestId("matchup-point").first()).toHaveAttribute("data-scope", "pair");
  await expect(notes.getByTestId("matchup-point").first()).toContainText("Garen's Q removes the slows on Garen");
  await expect(notes.getByTestId("matchup-note")).toHaveCount(2);
  // The wiki source: its title links to the page and the credit to the licence, each a link by more than colour (underlined at rest).
  await notes.getByTestId("matchup-notes-more").locator("summary").click();
  const sources = notes.getByTestId("matchup-sources");
  await expect(sources.getByTestId("matchup-source-link")).toHaveAttribute("href", "https://wiki.leagueoflegends.com/en-us/Darius");
  await expect(sources.getByTestId("matchup-licence-link")).toHaveText("CC BY-SA 3.0");
  for (const link of [sources.getByTestId("matchup-source-link"), sources.getByTestId("matchup-licence-link")]) {
    const style = await link.evaluate((a) => {
      const own = getComputedStyle(a);
      return { line: own.textDecorationLine, color: own.color, around: getComputedStyle(a.parentElement!).color };
    });
    expect(style.line).toContain("underline");
    expect(style.color).not.toBe(style.around);
  }
  await expectNoSeriousAxe(page, "Matchup Intel's sources with links", ["[data-testid=matchup-band]"]);
});

test("a published note is re-reviewed (what changed, Riot's patch notes, Confirm) and retired, each recorded in Audit Logs", async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on the desktop project");
  await admin(page, baseURL!);
  await page.getByTestId("matchup-notes-tabs").getByRole("radio", { name: "All notes" }).click();
  const row = page.getByTestId("matchup-note-row").filter({ hasText: "Top: Garen vs Darius" });
  await row.getByTestId("matchup-note-review").click();
  const review = page.getByTestId("matchup-review");
  await expect(review).toBeVisible();
  await expect(review.getByTestId("matchup-review-changed")).toHaveText(["Garen: no change recorded", "Darius: no change recorded"]);
  await page.getByTestId("matchup-review-confirm").click();
  await expect(review).toHaveCount(0);
  await page.getByTestId("matchup-notes-tabs").getByRole("radio", { name: "All notes" }).click();
  await row.getByTestId("matchup-note-retire").click();
  await page.getByRole("dialog").getByRole("button", { name: "Retire" }).click();
  await expect(page.getByTestId("matchup-note-row").filter({ hasText: "Top: Garen vs Darius" }).first()).toHaveAttribute("data-status", "retired");
  // Retired: Matchup Intel shows the opponent note on Darius alone.
  await page.goto("/lookup?champion=Garen&champion2=Darius&lane=TOP");
  await expect(page.getByTestId("matchup-band").getByTestId("matchup-note")).toHaveCount(1);
  // Audit Logs: champion names only.
  await page.goto("/admin/audit");
  await expect(page.locator("main")).toContainText("retired the matchup note for Garen against Darius in Top");
  await expect(page.locator("main")).toContainText("confirmed the matchup note for Garen against Darius in Top");
});

test("a member who is not an administrator cannot open Matchup notes", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on the desktop project");
  const { context, page: member } = await memberContext(browser, page);
  try {
    await member.goto("/admin/matchup-notes");
    await expect(member).not.toHaveURL(/\/admin\/matchup-notes$/);
    await expect(member.getByTestId("matchup-notes-admin")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("on a phone, the editor docks as a sheet and nothing is wider than the screen", async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== "phone", "the phone");
  await admin(page, baseURL!);
  await page.getByTestId("matchup-notes-new").click();
  await expect(page.getByTestId("matchup-editor")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const small = await page.getByTestId("matchup-editor-ref").evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 44).length);
  expect(small).toBe(0);
});
