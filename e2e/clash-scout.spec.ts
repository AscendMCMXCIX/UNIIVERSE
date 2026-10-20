import { expect, test, type Locator, type Page } from "@playwright/test";
import { memberContext } from "./member-account";

/*
  CLASH SCOUT. Screenshots are "read" by a stand-in in browser tests (UNIIVERSE_FAKE_SCOUT_OCR: a
  file named ranked… or mastery… gives fixed readings with names in five scripts and one unsure
  name; see components/clash/fake-recognizer.ts for the other names); real OCR is tested in
  tests/clash. What is tested here is the workspace: pasting, dropping or choosing screenshots,
  reading both screens into five cards, the draft surviving a reload without being saved
  anywhere, replacing, re-reading and removing a screenshot, correcting a name in its card and
  keeping the correction, verifying a player, OP.GG links only for verified accounts, saving to
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
  await expect(page.getByTestId("clash-shot")).toHaveCount(0);
}
const cards = (page: Page) => page.getByTestId("scout-card");
const cardNames = (page: Page) => page.getByTestId("scout-card-name").allInnerTexts();
const tile = (page: Page, kind: "ranked" | "mastery") => page.locator(`[data-testid="clash-shot"][data-kind="${kind}"]`);
async function readBoth(page: Page, variant = "") {
  await page.getByTestId("clash-file-input").setInputFiles([shot("ranked.png", variant), shot("mastery.png", variant)]);
  await expect(tile(page, "ranked")).toHaveAttribute("data-status", "done");
  await expect(tile(page, "mastery")).toHaveAttribute("data-status", "done");
  await expect.poll(() => cardNames(page)).toEqual(NAMES);
}
const opponent = (page: Page) => page.getByTestId("clash-opponent");

/** A paste event, as Ctrl+V gives it, with an image file (and text, if given) on the clipboard. */
async function paste(page: Page, fileName: string, variant: string, opts: { text?: string; target?: string } = {}) {
  await page.evaluate(
    ({ b64, fileName, variant, text, target }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const data = new DataTransfer();
      if (fileName) data.items.add(new File([bytes, new TextEncoder().encode(`${fileName}:${variant}`)], fileName, { type: "image/png" }));
      if (text) data.setData("text/plain", text);
      const el = target ? document.querySelector(target) : document.body;
      el!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    },
    { b64: PNG.toString("base64"), fileName, variant, text: opts.text, target: opts.target },
  );
}

test("both screenshots fill five opponent cards, in every script, with each name's source shown", async ({ page }) => {
  await freshDraft(page);
  await expect(cards(page)).toHaveCount(5);
  await readBoth(page);
  await expect(opponent(page)).toHaveValue("Night Owls Gaming");
  const first = cards(page).first();
  await expect(first.getByTestId("scout-card-rank")).toHaveText("Gold II · 54 LP");
  await expect(first.getByTestId("scout-card-total")).toContainText("811");
  await expect(first.getByTestId("scout-ranked-row")).toHaveCount(3);
  await expect(first.getByTestId("scout-ranked-row").first()).toContainText("63% · 41 games");
  await expect(first.getByTestId("scout-ranked-row").first()).toContainText("3.21 KDA");
  await expect(first.getByTestId("scout-mastery-row").first()).toContainText("512.3k · Lv 7");
  // Read clearly: labelled as read, never as an account.
  await expect(first.getByTestId("scout-card-source")).toHaveAttribute("data-source", "read");
  await expect(page.getByTestId("scout-card-verified")).toHaveCount(0);
  await expect(page.getByTestId("scout-card-opgg")).toHaveCount(0);
  // The unsure name: marked, with the screenshot's crop and a one-tap confirmation in its card.
  const unsure = cards(page).nth(4);
  await expect(unsure.getByTestId("scout-card-source")).toHaveAttribute("data-source", "check");
  await expect(unsure.getByTestId("scout-card-crop")).toBeVisible();
  await expect(first.getByTestId("scout-card-crop")).toHaveCount(0);
  await unsure.getByTestId("scout-card-confirm").click();
  await expect(unsure.getByTestId("scout-card-source")).toHaveAttribute("data-source", "confirmed");
  await expect(unsure.getByTestId("scout-card-check")).toHaveCount(0);
  // A row not read in full is marked for checking; an unrecognised champion stays unknown.
  await expect(cards(page).nth(2)).toContainText("1 to check");
});

test("Ctrl+V reads a screenshot without a picker; a paste meant for a text field is left to the field", async ({ page }) => {
  await freshDraft(page);
  // Text pasted into a field goes into the field, even with an image on the clipboard too.
  await opponent(page).focus();
  await paste(page, "ranked.png", "field", { text: "Pasted Team", target: "#clash-opponent" });
  await expect(page.getByTestId("clash-shot")).toHaveCount(0);
  // An image alone, pasted anywhere (here with the focus on the page), is read.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await paste(page, "ranked.png", "paste");
  await expect(tile(page, "ranked")).toHaveAttribute("data-status", "done");
  await expect.poll(() => cardNames(page)).toEqual(NAMES);
  // The next one, pasted after it, fills its own place.
  await paste(page, "mastery.png", "paste");
  await expect(tile(page, "mastery")).toHaveAttribute("data-status", "done");
  await expect(page.getByTestId("scout-mastery-row")).toHaveCount(15);
  // The same screenshot pasted again is noticed and not read twice.
  await paste(page, "mastery.png", "paste");
  await expect(page.getByText("This screenshot is already added.")).toBeVisible();
  await expect(page.getByTestId("clash-shot")).toHaveCount(2);
  await expect(page.getByTestId("clash-announce")).toContainText("Mastery screenshot read");
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("clash-discard").click();
});

test("screenshots dropped anywhere on the page are read", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "dragging files is a desktop gesture");
  await freshDraft(page);
  await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes, new TextEncoder().encode("ranked.png:drop")], "ranked.png", { type: "image/png" }));
    window.dispatchEvent(new DragEvent("dragenter", { dataTransfer: data, bubbles: true, cancelable: true }));
    window.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  }, PNG.toString("base64"));
  await expect(tile(page, "ranked")).toHaveAttribute("data-status", "done");
  await expect.poll(() => cardNames(page)).toEqual(NAMES);
  await expect(page.getByTestId("clash-drop-overlay")).toHaveCount(0);
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("clash-discard").click();
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
  // Both screenshots are still listed (without their pictures, which are never kept).
  await expect(tile(page, "ranked")).toHaveAttribute("data-status", "done");
  await expect(tile(page, "mastery")).toHaveAttribute("data-status", "done");
  // Not saved anywhere: the shared history does not have it.
  await page.getByTestId("clash-history-search").fill(name);
  await expect(page.getByTestId("clash-history-row")).toHaveCount(0);
  // The same screenshot again is not read twice.
  await page.getByTestId("clash-file-input").setInputFiles([shot("ranked.png", "reload")]);
  await expect(page.getByText("This screenshot is already added.")).toBeVisible();
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("clash-discard").click();
  await expect(opponent(page)).toHaveValue("");
  await expect(page.getByTestId("scout-card-name").first()).toHaveText("Not read");
  await page.reload();
  await expect(page.getByTestId("scout-card-name").first()).toHaveText("Not read");
});

test("one screenshot is replaced without resetting the other, and a name corrected in its card is kept", async ({ page }) => {
  await freshDraft(page);
  await page.getByTestId("clash-file-input").setInputFiles([shot("ranked.png", "r1")]);
  await expect.poll(() => cardNames(page)).toEqual(NAMES);
  await expect(tile(page, "ranked")).toHaveAttribute("data-status", "done");
  await expect(page.getByTestId("clash-slot-mastery")).toBeVisible();
  await expect(page.getByTestId("scout-mastery-row")).toHaveCount(0);
  await page.getByTestId("clash-file-input").setInputFiles([shot("mastery.png", "m1")]);
  await expect(page.getByTestId("scout-mastery-row")).toHaveCount(15);
  // Corrected right in the card.
  const first = cards(page).first();
  await first.getByTestId("scout-card-edit-name").click();
  await first.getByTestId("scout-card-name-input").fill("Пётр");
  // The Enter that ends an input method's composition (Korean, Japanese, Chinese) is not the end of the editing.
  await first.getByTestId("scout-card-name-input").dispatchEvent("keydown", { key: "Enter", isComposing: true });
  await expect(first.getByTestId("scout-card-name-input")).toBeVisible();
  await first.getByTestId("scout-card-name-input").press("Enter");
  await expect(first.getByTestId("scout-card-name")).toHaveText("Пётр");
  await expect(first.getByTestId("scout-card-source")).toHaveAttribute("data-source", "corrected");
  await expect(first.getByTestId("scout-card-source")).toContainText("read as “Пётр Пустота”");
  // A newer mastery screenshot replaces the earlier one only: ranked figures and the correction stay.
  // (This one takes a moment to read: its tile says so meanwhile.)
  await page.getByTestId("clash-file-input").setInputFiles([shot("slow-mastery.png", "m2")]);
  await expect(page.locator('[data-testid="clash-shot"][data-status="reading"]')).toBeVisible();
  await expect(page.locator('[data-testid="clash-shot"]')).toHaveCount(2);
  await expect(tile(page, "mastery")).toHaveAttribute("data-status", "done");
  await expect(page.getByTestId("scout-mastery-row")).toHaveCount(15);
  await expect(page.getByTestId("scout-ranked-row")).toHaveCount(15);
  await expect(first.getByTestId("scout-card-name")).toHaveText("Пётр");
  // Removing the ranked screenshot removes what it filled in, and nothing else.
  await tile(page, "ranked").getByRole("button", { name: /Options for the ranked screenshot/ }).click();
  await page.getByRole("menuitem", { name: "Remove" }).click();
  await expect(page.getByTestId("scout-ranked-row")).toHaveCount(0);
  await expect(page.getByTestId("scout-card-rank")).toHaveCount(0);
  await expect(page.getByTestId("scout-mastery-row")).toHaveCount(15);
  await expect(first.getByTestId("scout-card-name")).toHaveText("Пётр");
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("clash-discard").click();
});

test("an image that is not a Clash screen is explained, read as the screen the member says, or read again after a failure", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one pass is enough for the screenshot states");
  await freshDraft(page);
  // Nothing recognised: said so on its tile, which can be removed.
  await page.getByTestId("clash-file-input").setInputFiles([shot("holiday.png")]);
  const holiday = page.locator('[data-testid="clash-shot"][data-status="unreadable"]');
  await expect(holiday.getByTestId("clash-shot-message")).toContainText("No players could be read");
  await holiday.getByRole("button", { name: "Remove this screenshot" }).click();
  await expect(page.getByTestId("clash-shot")).toHaveCount(0);
  // A screen whose kind cannot be told: read as the one the member chooses.
  await page.getByTestId("clash-file-input").setInputFiles([shot("other-screen.png")]);
  await page.getByTestId("clash-shot-as-mastery").click();
  await expect(tile(page, "mastery")).toHaveAttribute("data-status", "done");
  await expect(page.getByTestId("scout-mastery-row")).toHaveCount(15);
  // Read as the other screen from its menu: the mastery figures go, the ranked ones come.
  await tile(page, "mastery").getByRole("button", { name: /Options for the mastery screenshot/ }).click();
  await page.getByRole("menuitem", { name: "It is the Ranked screen" }).click();
  await expect(tile(page, "ranked")).toHaveAttribute("data-status", "done");
  await expect(page.getByTestId("scout-ranked-row")).toHaveCount(15);
  await expect(page.getByTestId("scout-mastery-row")).toHaveCount(0);
  // Recognition that fails (a blocked download): a clear message, and trying again reads it.
  await page.getByTestId("clash-file-input").setInputFiles([shot("flaky-mastery.png")]);
  const failed = page.locator('[data-testid="clash-shot"][data-status="failed"]');
  await expect(failed.getByTestId("clash-shot-message")).toContainText("could not run");
  await expect(page.getByTestId("scout-ranked-row")).toHaveCount(15);
  await failed.getByTestId("clash-shot-retry").click();
  await expect(tile(page, "mastery")).toHaveAttribute("data-status", "done");
  await expect(page.getByTestId("scout-mastery-row")).toHaveCount(15);
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("clash-discard").click();
});

test("names the two screenshots read differently are marked, with the other reading one tap away", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one pass is enough");
  await freshDraft(page);
  await page.getByTestId("clash-file-input").setInputFiles([shot("ranked.png", "alt"), shot("mastery-alt.png", "alt")]);
  await expect(tile(page, "mastery")).toHaveAttribute("data-status", "done");
  const last = cards(page).nth(4);
  // The surer reading is shown, marked, with the other reading offered.
  await expect(last.getByTestId("scout-card-name")).toHaveText("xX_Snlper_Xx");
  await expect(last.getByTestId("scout-card-source")).toHaveAttribute("data-source", "check");
  await last.getByTestId("scout-card-use-alt").click();
  await expect(last.getByTestId("scout-card-name")).toHaveText("xX_Sn1per_Xx");
  await expect(last.getByTestId("scout-card-source")).toHaveAttribute("data-source", "confirmed");
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("clash-discard").click();
});

test("players nothing could be read for keep their place, and the cards stay aligned", async ({ page }) => {
  await freshDraft(page);
  await page.getByTestId("clash-file-input").setInputFiles([shot("partial-ranked.png")]);
  await expect(tile(page, "ranked")).toHaveAttribute("data-status", "done");
  await expect.poll(() => cardNames(page)).toEqual([NAMES[0], "Not read", NAMES[2], "Not read", NAMES[4]]);
  await expect(cards(page).nth(1)).toContainText("No rank shown");
  await expect(cards(page).nth(1)).toContainText("No ranked champions read");
  if (test.info().project.name === "desktop") {
    // Side by side, every card is as tall as the others, its sections level with theirs.
    const boxes = await cards(page).evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
    expect(new Set(boxes.map((b) => Math.round(b.top))).size).toBe(1);
    expect(new Set(boxes.map((b) => Math.round(b.height))).size).toBe(1);
    // Each section starts at the same height in every card: rank, ranked champions, mastery, actions.
    const sections = await cards(page).evaluateAll((els) => els.map((e) => [...e.children].map((c) => Math.round(c.getBoundingClientRect().top))));
    for (let k = 0; k < sections[0]!.length; k++) expect(new Set(sections.map((s) => s[k])).size, `section ${k + 1}`).toBe(1);
  }
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("clash-discard").click();
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
  await expect(card.getByTestId("scout-card-check")).toHaveCount(0);
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
  await expect(card.getByTestId("scout-card-source")).toHaveAttribute("data-source", "verified");
  await expect(card.getByTestId("scout-card-opgg")).toHaveAttribute("href", /xX_Sn1per_Xx-OCE$/);

  await page.getByTestId("clash-save").click();
  await expect(page).toHaveURL(/\/clash\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Scout saved to the team's history")).toBeVisible();
  await expect.poll(() => cardNames(page)).toEqual(NAMES);
  await expect(cards(page).nth(4).getByTestId("scout-card-verified")).toBeVisible();
  // Saved: values only, no screenshot (the saved view has no screenshots at all).
  await expect(page.getByTestId("clash-dropzone")).toHaveCount(0);
  const url = page.url();

  // In the shared history: searchable by opponent and by a player's name, with the verified count.
  await openScout(page);
  // Saving cleared the draft.
  await expect(page.getByTestId("scout-card-name").first()).toHaveText("Not read");
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
  // Their own: editable (a name too, in its card), but no archive or delete.
  await mp.getByTestId("clash-opponent").fill(`${name} (edited)`);
  const first = mp.getByTestId("scout-card").first();
  await first.getByTestId("scout-card-edit-name").click();
  await first.getByTestId("scout-card-name-input").fill("Пётр");
  await first.getByTestId("scout-card-name-input").press("Enter");
  await mp.getByTestId("clash-save-changes").click();
  await expect(mp.getByTestId("clash-save-changes")).toHaveText(/Saved/);
  await expect(mp.getByTestId("clash-archive")).toHaveCount(0);
  await expect(mp.getByTestId("clash-delete")).toHaveCount(0);
  await mp.reload();
  await expect(mp.getByTestId("scout-card-name").first()).toHaveText("Пётр");
  await expect(mp.getByTestId("scout-card-source").first()).toHaveAttribute("data-source", "corrected");

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

  // An Owner's scout is read-only for the member: no name editing in the cards either.
  await page.goto("/clash", { waitUntil: "load" });
  await page.getByTestId("clash-file-input").setInputFiles([shot("ranked.png", "owner")]);
  await expect.poll(() => cardNames(page)).toEqual(NAMES);
  await page.getByTestId("clash-opponent").fill(unique("Owner Scout"));
  await page.getByTestId("clash-save").click();
  await expect(page).toHaveURL(/\/clash\/[0-9a-f-]{36}$/);
  await mp.goto(page.url(), { waitUntil: "load" });
  await expect(mp.getByTestId("clash-opponent")).toBeDisabled();
  await expect(mp.getByTestId("clash-save-changes")).toHaveCount(0);
  await expect(mp.getByTestId("scout-card-edit-name")).toHaveCount(0);
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
  // Choosing screenshots is the phone's way in (no keyboard to paste with).
  await expect(page.getByTestId("clash-choose")).toBeVisible();
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
