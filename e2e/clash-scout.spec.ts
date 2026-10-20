import { expect, test, type Locator, type Page } from "@playwright/test";
import { memberContext } from "./member-account";

/*
  CLASH SCOUT. Screenshots are "read" by a stand-in in browser tests (UNIIVERSE_FAKE_SCOUT_OCR: a
  file named ranked… or mastery… gives fixed readings with names in five scripts and one unsure
  name); real OCR is tested in tests/clash. What is tested here is the workspace: reading both
  screens into five cards, the draft surviving a reload without being saved anywhere, replacing a
  screenshot, correcting and verifying a player, OP.GG links only for verified accounts, saving to
  the shared history, searching it, and who may change what. The run shares one database, so each
  test names its opponent uniquely.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const NAMES = ["Пётр Пустота", "오징어게임", "ドラゴンの心", "我是大魔王", "xX_Sn1per_Xx"];
// A 1×1 PNG; bytes appended after its end make each file distinct (a different screenshot) without changing the picture.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const shot = (name: string, variant = "") => ({ name, mimeType: "image/png", buffer: Buffer.concat([PNG, Buffer.from(`${name}:${variant}`)]) });
const unique = (base: string) => `${base} ${Date.now().toString(36).slice(-5)}`;

async function openScout(page: Page) {
  await page.goto("/clash", { waitUntil: "load" });
  await expect(page.getByTestId("clash-workspace")).toBeVisible();
}
/** Starts from an empty draft (a previous test in this browser may have left one). */
async function freshDraft(page: Page) {
  await openScout(page);
  const discard = page.getByTestId("clash-discard");
  if (await discard.count()) {
    page.once("dialog", (d) => void d.accept());
    await discard.click();
  }
  await expect(page.getByTestId("clash-dropzone")).toBeVisible();
}
const cards = (page: Page) => page.getByTestId("scout-card");
const cardNames = (page: Page) => page.getByTestId("scout-card-name").allInnerTexts();
async function readBoth(page: Page, variant = "") {
  await page.getByTestId("clash-file-input").setInputFiles([shot("ranked.png", variant), shot("mastery.png", variant)]);
  await expect(page.getByTestId("clash-shots-bar")).toBeVisible();
  await expect.poll(() => cardNames(page)).toEqual(NAMES);
}
const opponent = (page: Page) => page.getByTestId("clash-opponent");

test("both screenshots fill five opponent cards, in every script, and the upload area folds away", async ({ page }) => {
  await freshDraft(page);
  await expect(cards(page)).toHaveCount(5);
  await readBoth(page);
  await expect(opponent(page)).toHaveValue("Night Owls Gaming");
  const first = cards(page).first();
  await expect(first.getByTestId("scout-card-rank")).toHaveText("Gold II · 54 LP");
  await expect(first.getByTestId("scout-ranked-row")).toHaveCount(3);
  await expect(first.getByTestId("scout-ranked-row").first()).toContainText("63% · 41 games");
  await expect(first.getByTestId("scout-ranked-row").first()).toContainText("3.21 KDA");
  await expect(first.getByTestId("scout-mastery-row").first()).toContainText("M7 · 512k");
  // Nothing is verified by reading a screenshot, and no profile is linked from a name.
  await expect(page.getByTestId("scout-card-verified")).toHaveCount(0);
  await expect(page.getByTestId("scout-card-opgg")).toHaveCount(0);
  // The unsure name: marked, with the screenshot's crop beside it.
  const unsure = cards(page).nth(4);
  await expect(unsure.getByText("Check name")).toBeVisible();
  await expect(unsure.getByTestId("scout-card-crop")).toBeVisible();
  await expect(cards(page).first().getByTestId("scout-card-crop")).toHaveCount(0);
  // An unrecognised champion stays unknown and is counted for checking.
  await expect(cards(page).nth(2)).toContainText("1 champion to check");
});

test("a draft survives a reload, is not in the history until saved, and can be discarded", async ({ page }) => {
  await freshDraft(page);
  await readBoth(page, "reload");
  const name = unique("Draft Only");
  await opponent(page).fill(name);
  await page.waitForTimeout(400);
  await page.reload();
  await expect.poll(() => cardNames(page)).toEqual(NAMES);
  await expect(opponent(page)).toHaveValue(name);
  await expect(page.getByTestId("clash-shots-bar")).toBeVisible();
  // Not saved anywhere: the shared history does not have it.
  await page.getByTestId("clash-history-search").fill(name);
  await expect(page.getByTestId("clash-history-row")).toHaveCount(0);
  // The same screenshot again is not read twice.
  await page.getByTestId("clash-file-input").setInputFiles([shot("ranked.png", "reload")]);
  await expect(page.getByText("This screenshot has already been read.")).toBeVisible();
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("clash-discard").click();
  await expect(opponent(page)).toHaveValue("");
  await expect(page.getByTestId("scout-card-name").first()).toHaveText("Not read yet");
  await page.reload();
  await expect(page.getByTestId("scout-card-name").first()).toHaveText("Not read yet");
});

test("one screenshot is replaced without resetting the other; an image that is not a Clash screen is explained", async ({ page }) => {
  await freshDraft(page);
  await page.getByTestId("clash-file-input").setInputFiles([shot("holiday.png")]);
  await expect(page.getByTestId("clash-problem")).toContainText("No players could be read");
  await page.getByTestId("clash-file-input").setInputFiles([shot("ranked.png", "r1")]);
  await expect.poll(() => cardNames(page)).toEqual(NAMES);
  await expect(page.getByTestId("clash-shot-ranked")).toHaveAttribute("data-done", "true");
  await expect(page.getByTestId("clash-shot-mastery")).toHaveAttribute("data-done", "false");
  await expect(page.getByTestId("scout-mastery-row")).toHaveCount(0);
  await page.getByTestId("clash-file-input").setInputFiles([shot("mastery.png", "m1")]);
  await expect(page.getByTestId("scout-mastery-row")).toHaveCount(15);
  // A correction survives replacing the screenshot it came from.
  await cards(page).first().getByTestId("scout-card-open").click();
  await page.getByTestId("scout-detail-name").fill("Пётр");
  await page.keyboard.press("Escape");
  await page.getByTestId("clash-show-upload").click();
  await page.getByTestId("clash-file-input").setInputFiles([shot("mastery.png", "m2")]);
  await expect(page.getByTestId("scout-mastery-row")).toHaveCount(15);
  await expect(page.getByTestId("scout-ranked-row")).toHaveCount(15);
  await expect(page.getByTestId("scout-card-name").first()).toHaveText("Пётр");
});

test("pasting a screenshot reads it", async ({ page }) => {
  await freshDraft(page);
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes, new TextEncoder().encode("ranked.png:paste")], "ranked.png", { type: "image/png" }));
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data }));
  }, PNG.toString("base64"));
  await expect.poll(() => cardNames(page)).toEqual(NAMES);
});

test("a player is checked, verified with a full Riot ID, linked to OP.GG, saved and found again", async ({ page }) => {
  await freshDraft(page);
  await readBoth(page, "verify");
  const name = unique("Owls");
  await opponent(page).fill(name);
  const card = cards(page).nth(4);
  await card.getByTestId("scout-card-lookup").click();
  const detail = page.getByTestId("scout-detail");
  await expect(detail.getByTestId("scout-detail-crop")).toBeVisible();
  await detail.getByTestId("scout-detail-confirm-name").click();
  await expect(card.getByText("Check name")).toHaveCount(0);
  // Unverified: copy and Multi-Search only, never a profile.
  await expect(detail.getByTestId("scout-detail-opgg")).toHaveCount(0);
  await expect(detail.getByTestId("scout-detail-multisearch")).toHaveAttribute("href", "https://op.gg/lol/multisearch");
  // The tag is never guessed: the field holds the name and "#", and checking needs a tag.
  await expect(detail.getByTestId("scout-detail-riot-input")).toHaveValue("xX_Sn1per_Xx#");
  await expect(detail.getByTestId("scout-detail-verify")).toBeDisabled();
  await detail.getByTestId("scout-detail-riot-input").fill("xX_Sn1per_Xx#OCE");
  await detail.getByTestId("scout-detail-verify").click();
  await expect(detail.getByTestId("scout-detail-riot-id")).toHaveText("xX_Sn1per_Xx#OCE");
  const profile = detail.getByTestId("scout-detail-opgg");
  await expect(profile).toHaveAttribute("href", /^https:\/\/op\.gg\/lol\/summoners\/[a-z]+\/xX_Sn1per_Xx-OCE$/);
  await expect(profile).toHaveAttribute("target", "_blank");
  await page.keyboard.press("Escape");
  await expect(card.getByTestId("scout-card-verified")).toBeVisible();
  await expect(card.getByTestId("scout-card-opgg")).toHaveAttribute("href", /xX_Sn1per_Xx-OCE$/);

  await page.getByTestId("clash-save").click();
  await expect(page).toHaveURL(/\/clash\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Scout saved to the team's history")).toBeVisible();
  await expect.poll(() => cardNames(page)).toEqual(NAMES);
  await expect(cards(page).nth(4).getByTestId("scout-card-verified")).toBeVisible();
  const url = page.url();

  // In the shared history: searchable by opponent and by a player's name, with the verified count.
  await openScout(page);
  // Saving cleared the draft.
  await expect(page.getByTestId("scout-card-name").first()).toHaveText("Not read yet");
  await page.getByTestId("clash-history-search").fill(name);
  const row = page.getByTestId("clash-history-row");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("5/5 players");
  await expect(row).toContainText("1 verified");
  await page.getByTestId("clash-history-search").fill("오징어");
  await expect(page.getByTestId("clash-history-row").first()).toBeVisible();
  await page.getByTestId("clash-history-search").fill("nobody-scouted-this");
  await expect(page.getByTestId("clash-history-row")).toHaveCount(0);
  // A shareable address: it opens the same scout.
  await page.goto(url);
  await expect(opponent(page)).toHaveValue(name);

  // Recognised later by the verified account (never by a similar name).
  await freshDraft(page);
  await readBoth(page, "again");
  await cards(page).nth(4).getByTestId("scout-card-lookup").click();
  await page.getByTestId("scout-detail-riot-input").fill("xX_Sn1per_Xx#OCE");
  await expect(async () => {
    await page.getByTestId("scout-detail-verify").click({ timeout: 2000 });
    await expect(page.getByTestId("scout-detail-earlier")).toContainText(name, { timeout: 3000 });
  }).toPass();
  await page.keyboard.press("Escape");
  await expect(cards(page).nth(4).getByText("Seen before")).toBeVisible();
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("clash-discard").click();
});

test("a saved scout: its owner and lineup managers edit it, other members read it; archive and delete are for managers and the Owner", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop", "one pass is enough for permissions");
  await openScout(page);
  const member = await memberContext(browser, page);
  // The member saves a scout.
  const mp = member.page;
  await mp.goto("/clash", { waitUntil: "load" });
  await mp.getByTestId("clash-file-input").setInputFiles([shot("ranked.png", "perm")]);
  await expect.poll(() => mp.getByTestId("scout-card-name").allInnerTexts()).toEqual(NAMES);
  const name = unique("Member Scout");
  await mp.getByTestId("clash-opponent").fill(name);
  await mp.getByTestId("clash-save").click();
  await expect(mp).toHaveURL(/\/clash\/[0-9a-f-]{36}$/);
  const url = mp.url();
  // Their own: editable, but no archive or delete.
  await mp.getByTestId("clash-opponent").fill(`${name} (edited)`);
  await mp.getByTestId("clash-save-changes").click();
  await expect(mp.getByTestId("clash-save-changes")).toHaveText(/Saved/);
  await expect(mp.getByTestId("clash-archive")).toHaveCount(0);
  await expect(mp.getByTestId("clash-delete")).toHaveCount(0);

  // The Owner (the demo's local account) sees it in the team's history, may archive, restore and delete.
  await page.goto(url, { waitUntil: "load" });
  await expect(page.getByTestId("clash-opponent")).toHaveValue(`${name} (edited)`);
  await page.getByTestId("clash-archive").click();
  await expect(page.getByText("Scout archived")).toBeVisible();
  await page.goto(`/clash?archived=1&q=${encodeURIComponent(name)}`);
  await expect(page.getByTestId("clash-history-row")).toHaveCount(1);
  await page.goto(url, { waitUntil: "load" });
  await page.getByTestId("clash-archive").click();
  await expect(page.getByText("Scout restored")).toBeVisible();

  // An Owner's scout is read-only for the member.
  await page.goto("/clash", { waitUntil: "load" });
  await page.getByTestId("clash-file-input").setInputFiles([shot("ranked.png", "owner")]);
  await expect.poll(() => cardNames(page)).toEqual(NAMES);
  await page.getByTestId("clash-opponent").fill(unique("Owner Scout"));
  await page.getByTestId("clash-save").click();
  await expect(page).toHaveURL(/\/clash\/[0-9a-f-]{36}$/);
  await mp.goto(page.url(), { waitUntil: "load" });
  await expect(mp.getByTestId("clash-opponent")).toBeDisabled();
  await expect(mp.getByTestId("clash-save-changes")).toHaveCount(0);
  await expect(mp.getByTestId("clash-saved-meta")).toContainText("Only the member who saved it, or a lineup manager, can change it.");

  // Delete: the Owner only, after confirming.
  await page.goto(url, { waitUntil: "load" });
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("clash-delete").click();
  await expect(page).toHaveURL(/\/clash$/);
  await page.goto(url);
  await expect(page.getByText(/could not be found|not found/i).first()).toBeVisible();
  await member.context.close();
});

test("phones swipe through the five opponents, one card at a time", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the phone layout");
  await freshDraft(page);
  await readBoth(page, "phone");
  const track: Locator = page.getByTestId("clash-cards");
  expect(await track.evaluate((el) => el.scrollWidth > el.clientWidth + 50)).toBe(true);
  await expect(page.getByTestId("clash-dots")).toBeVisible();
  // No page-wide sideways scroll: only the track scrolls.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.getByTestId("clash-dots").getByRole("button", { name: "Show player 3" }).click();
  await expect(page.getByTestId("clash-dots").getByRole("button", { name: "Show player 3" })).toHaveAttribute("aria-current", "true");
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("clash-discard").click();
});

test("desktop shows the five opponents side by side in one row", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the desktop layout");
  await freshDraft(page);
  const boxes = await cards(page).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  expect(new Set(boxes.map((t) => Math.round(t))).size).toBe(1);
  await expect(page.getByTestId("clash-dots")).toBeHidden();
  // Clash Scout is its own sidebar entry, marked here; it is not one of Team's tabs.
  await expect(page.locator("aside").getByTestId("nav-clash")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("team-tabs")).toHaveCount(0);
});
