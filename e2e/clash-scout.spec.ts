import { expect, test, type Locator, type Page } from "./test";
import { memberContext } from "./member-account";

/*
  CLASH SCOUT. Screenshots are "read" by a stand-in in browser tests (UNIIVERSE_FAKE_SCOUT_OCR: a
  file named ranked… or mastery… gives fixed readings with names in five scripts and one unsure
  name; see components/clash/fake-recognizer.ts for the other names); real OCR is tested in
  tests/clash. What is tested here is the workspace: pasting, dropping or choosing screenshots,
  reading both screens into five cards, an unsaved scout living in the page only (nothing in the
  browser's storage, no image in any request, a reload discards it, and what earlier versions
  kept in the browser is deleted), replacing, re-reading and removing a screenshot, correcting a name in its card and
  keeping the correction, champions recognised, suggested or unknown and chosen from the
  searchable list, correcting figures in a card's own editor, identifying a player (typing the
  Riot ID, or confirming an account seen before), OP.GG links only for verified accounts, "Open
  all verified profiles" and what it does when the browser blocks tabs, saving to the shared
  history, searching it, and who may change or delete what. The run shares one database, so each test names its
  opponent uniquely.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const NAMES = ["Пётр Пустота", "오징어게임", "ドラゴンの心", "我是大魔王", "xX_Sn1per_Xx"];
// A 1×1 PNG; bytes appended after its end make each file distinct (a different screenshot) without changing the picture.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const shot = (name: string, variant = "") => ({ name, mimeType: "image/png", buffer: Buffer.concat([PNG, Buffer.from(`${name}:${variant}`)]) });
const unique = (base: string) => `${base} ${Date.now().toString(36).slice(-5)}`;

/** Opens the workspace (a new scout, or a saved one's address) and waits until it is interactive: the page loads before it is hydrated, and a screenshot chosen before then is never seen. */
async function openScout(page: Page, path = "/clash") {
  await page.goto(path, { waitUntil: "load" });
  await expect(page.getByTestId("clash-workspace")).toHaveAttribute("data-ready", "true");
}
/** Opens a new scout: it always starts empty (nothing of an earlier one is kept). */
async function freshDraft(page: Page) {
  await openScout(page);
  await expect(page.getByTestId("clash-dropzone")).toBeVisible();
  await expect(page.getByTestId("clash-shot")).toHaveCount(0);
  await expect(page.getByTestId("clash-unsaved")).toHaveCount(0);
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
  // No profile link for a name that was only read: the name is plain text until Riot confirms an account.
  await expect(first.getByTestId("scout-card-name")).not.toHaveAttribute("href", /./);
  await expect(first.getByTestId("scout-card-identity")).not.toHaveAttribute("data-identity", "verified");
  // The unsure name: marked, with the screenshot's crop and a one-tap confirmation in its card.
  const unsure = cards(page).nth(4);
  await expect(unsure.getByTestId("scout-card-source")).toHaveAttribute("data-source", "check");
  await expect(unsure.getByTestId("scout-card-crop")).toBeVisible();
  await expect(first.getByTestId("scout-card-crop")).toHaveCount(0);
  await unsure.getByTestId("scout-card-confirm").click();
  await expect(unsure.getByTestId("scout-card-source")).toHaveAttribute("data-source", "confirmed");
  await expect(unsure.getByTestId("scout-card-check")).toHaveCount(0);
  // A row not read in full is marked for checking; an unrecognised champion stays unknown.
  await expect(cards(page).nth(2).getByTestId("scout-card-to-check")).toHaveText("1 row · 1 champion to check");
  await expect(cards(page).nth(2).locator("[data-testid='scout-champion'][data-state='unknown']")).toHaveCount(1);
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
  await expect(page.getByTestId("scout-mastery-row")).toHaveCount(25);
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

test("an unsaved scout lives in the page only: nothing in the browser's storage, no image sent anywhere, and a reload or Discard ends it", async ({ page }) => {
  // Every request body the page sends while screenshots are read and potential matches looked up.
  const bodies: string[] = [];
  page.on("request", (r) => {
    const body = r.postDataBuffer();
    if (body) bodies.push(body.toString("latin1"));
  });
  await freshDraft(page);
  await readBoth(page, "reload");
  const name = unique("Draft Only");
  await opponent(page).fill(name);
  await expect(page.getByTestId("clash-unsaved")).toContainText("Refreshing, leaving or closing the page discards it");
  // The same screenshot again is not read twice.
  await page.getByTestId("clash-file-input").setInputFiles([shot("ranked.png", "reload")]);
  await expect(page.getByText("This screenshot is already added.")).toBeVisible();
  // Potential matches were looked up for the names read (one request), and no request carried an image.
  await expect.poll(() => bodies.length).toBeGreaterThan(0);
  for (const body of bodies) expect(body).not.toMatch(/\x89PNG|IHDR|iVBORw0KGgo|data:image/);
  // Nothing of it is in the browser's storage.
  expect(
    await page.evaluate(async () => ({
      local: Object.keys(localStorage).filter((k) => /clash|scout/i.test(k) || (localStorage.getItem(k) ?? "").includes("Пётр")),
      session: sessionStorage.length,
      databases: typeof indexedDB.databases === "function" ? (await indexedDB.databases()).map((d) => d.name) : [],
    })),
  ).toEqual({ local: [], session: 0, databases: [] });
  // A reload ends it: nothing comes back, and the shared history does not have it.
  await page.reload();
  await expect(page.getByTestId("clash-workspace")).toHaveAttribute("data-ready", "true");
  await expect(page.getByTestId("clash-shot")).toHaveCount(0);
  await expect(opponent(page)).toHaveValue("");
  await expect(page.getByTestId("scout-card-name").first()).toHaveText("Not read");
  await expect(page.getByTestId("clash-unsaved")).toHaveCount(0);
  await page.getByTestId("clash-history-search").fill(name);
  await expect(page.getByTestId("clash-history-row")).toHaveCount(0);
  // Discard ends it too, after asking.
  await readBoth(page, "discard");
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("clash-discard").click();
  await expect(opponent(page)).toHaveValue("");
  await expect(page.getByTestId("scout-card-name").first()).toHaveText("Not read");
  await expect(page.getByTestId("clash-shot")).toHaveCount(0);
});

test("an unsaved scout an earlier version kept in the browser is deleted on the next visit, from any page", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "browser storage is the same at every size");
  await page.goto("/privacy");
  // What earlier versions left: the draft in localStorage, and the text recogniser's IndexedDB cache.
  await page.evaluate(async () => {
    localStorage.setItem("uniiverse.clash-scout.draft.v1", JSON.stringify({ teamId: "t", content: { opponentName: "Night Owls Gaming" }, shots: [], updatedAt: "" }));
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("keyval-store");
      open.onupgradeneeded = () => open.result.createObjectStore("keyval");
      open.onsuccess = () => (open.result.close(), resolve());
      open.onerror = () => reject(open.error);
    });
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(async () => ({ draft: localStorage.getItem("uniiverse.clash-scout.draft.v1"), cache: (await indexedDB.databases()).some((d) => d.name === "keyval-store") })))
    .toEqual({ draft: null, cache: false });
  // Opening Clash Scout afterwards starts empty.
  await freshDraft(page);
  await expect(opponent(page)).toHaveValue("");
});

test("one screenshot is replaced without resetting the other, and a name corrected in its card is kept", async ({ page }) => {
  await freshDraft(page);
  await page.getByTestId("clash-file-input").setInputFiles([shot("ranked.png", "r1")]);
  await expect.poll(() => cardNames(page)).toEqual(NAMES);
  await expect(tile(page, "ranked")).toHaveAttribute("data-status", "done");
  await expect(page.getByTestId("clash-slot-mastery")).toBeVisible();
  await expect(page.getByTestId("scout-mastery-row")).toHaveCount(0);
  await page.getByTestId("clash-file-input").setInputFiles([shot("mastery.png", "m1")]);
  await expect(page.getByTestId("scout-mastery-row")).toHaveCount(25);
  // Corrected right in the card: the pencil turns it into its own editor.
  const first = cards(page).first();
  await first.getByTestId("scout-card-edit").click();
  await first.getByTestId("scout-card-name-input").fill("Пётр");
  // The Enter that ends an input method's composition (Korean, Japanese, Chinese) is not the end of the editing.
  await first.getByTestId("scout-card-name-input").dispatchEvent("keydown", { key: "Enter", isComposing: true });
  await expect(first.getByTestId("scout-card-name-input")).toHaveValue("Пётр");
  await first.getByTestId("scout-card-name-input").press("Enter");
  await first.getByTestId("scout-card-edit").click();
  await expect(first.getByTestId("scout-card-name")).toHaveText("Пётр");
  await expect(first.getByTestId("scout-card-source")).toHaveAttribute("data-source", "corrected");
  await expect(first.getByTestId("scout-card-source")).toContainText("read as “Пётр Пустота”");
  // A newer mastery screenshot replaces the earlier one only: ranked figures and the correction stay.
  // (This one takes a moment to read: its tile says so meanwhile.)
  await page.getByTestId("clash-file-input").setInputFiles([shot("slow-mastery.png", "m2")]);
  await expect(page.locator('[data-testid="clash-shot"][data-status="reading"]')).toBeVisible();
  await expect(page.locator('[data-testid="clash-shot"]')).toHaveCount(2);
  await expect(tile(page, "mastery")).toHaveAttribute("data-status", "done");
  await expect(page.getByTestId("scout-mastery-row")).toHaveCount(25);
  await expect(page.getByTestId("scout-ranked-row")).toHaveCount(15);
  await expect(first.getByTestId("scout-card-name")).toHaveText("Пётр");
  // Removing the ranked screenshot removes what it filled in, and nothing else.
  await tile(page, "ranked").getByRole("button", { name: /Options for the ranked screenshot/ }).click();
  await page.getByRole("menuitem", { name: "Remove" }).click();
  await expect(page.getByTestId("scout-ranked-row")).toHaveCount(0);
  await expect(page.getByTestId("scout-card-rank")).toHaveCount(0);
  await expect(page.getByTestId("scout-mastery-row")).toHaveCount(25);
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
  await expect(page.getByTestId("scout-mastery-row")).toHaveCount(25);
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
  await expect(page.getByTestId("scout-mastery-row")).toHaveCount(25);
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

test("a player is identified in their card, linked to OP.GG, opened with the others, saved, and offered again next time", async ({ page }) => {
  await freshDraft(page);
  await readBoth(page, "verify");
  const name = unique("Owls");
  await opponent(page).fill(name);
  const card = cards(page).nth(4);
  await expect(card.getByTestId("scout-card-crop")).toBeVisible();
  await card.getByTestId("scout-card-confirm").click();
  await expect(card.getByTestId("scout-card-check")).toHaveCount(0);
  // Not identified: the name is plain text, never a profile link, and "Open all verified profiles" says who is missing.
  await expect(card.getByTestId("scout-card-identity")).toHaveAttribute("data-identity", "unresolved");
  await expect(card.getByTestId("scout-card-name")).not.toHaveAttribute("href", /.*/);
  await expect(page.getByTestId("clash-open-status")).toContainText("0 of 5 identified");
  await expect(page.getByTestId("clash-multisearch")).toHaveCount(0);
  // The tag is never guessed: the field holds the name and "#", and checking needs a tag.
  await card.getByTestId("scout-card-add-riot-id").click();
  await expect(card.getByTestId("scout-card-riot-input")).toHaveValue("xX_Sn1per_Xx#");
  await expect(card.getByTestId("scout-card-verify")).toBeDisabled();
  await card.getByTestId("scout-card-riot-input").fill("xX_Sn1per_Xx#OCE");
  await card.getByTestId("scout-card-verify").click();
  await expect(card.getByTestId("scout-card-riot-id")).toHaveText("xX_Sn1per_Xx#OCE");
  await expect(card.getByTestId("scout-card-verified")).toBeVisible();
  // Verified: the name itself opens the OP.GG profile, in a new tab, on the scout's server.
  const link = card.getByTestId("scout-card-name");
  await expect(link).toHaveAttribute("href", /^https:\/\/op\.gg\/lol\/summoners\/[a-z]+\/xX_Sn1per_Xx-OCE$/);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
  await expect(page.getByTestId("clash-open-status")).toContainText("1 of 5 identified");
  await expect(page.getByTestId("clash-open-status")).toContainText("not identified: Пётр Пустота, 오징어게임, ドラゴンの心, 我是大魔王");

  // Open all verified profiles: the verified profile opens; the others are listed with a search and a way to identify them.
  await expect(page.getByTestId("clash-open-all")).toHaveText("Open all verified profiles");
  await page.evaluate(() => {
    (window as unknown as { opened: string[] }).opened = [];
    window.open = ((url?: string | URL) => ((window as unknown as { opened: string[] }).opened.push(String(url)), { opener: window }) as unknown as Window) as typeof window.open;
  });
  await page.getByTestId("clash-open-all").click();
  expect(await page.evaluate(() => (window as unknown as { opened: string[] }).opened)).toEqual([await link.getAttribute("href")]);
  await expect(page.getByTestId("clash-open-blocked")).toHaveCount(0);
  await expect(page.getByTestId("clash-open-unresolved")).toHaveCount(4);
  await page.getByTestId("clash-open-identify").first().click();
  await expect(cards(page).first().getByTestId("scout-card-riot-input")).toBeFocused();
  await page.getByTestId("clash-open-close").click();

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
  // A new scout starts empty.
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

  // The next scout with that name: the account verified before is offered as a potential match (not
  // verified, not linked) with what agrees; one tap confirms it with Riot, and the earlier scout is named.
  await freshDraft(page);
  await readBoth(page, "again");
  const again = cards(page).nth(4);
  await expect(again.getByTestId("scout-card-identity")).toHaveAttribute("data-identity", "possible", { timeout: 15_000 });
  const candidate = again.getByTestId("scout-card-candidate").first();
  await expect(candidate).toContainText(/xx_sn1per_xx#OCE/i);
  await expect(candidate).toHaveAttribute("data-strength", "strong");
  await expect(candidate).toContainText(name);
  await expect(again.getByTestId("scout-card-name")).not.toHaveAttribute("href", /.*/);
  await expect(async () => {
    await candidate.getByTestId("scout-card-candidate-confirm").click({ timeout: 2000 });
    await expect(again.getByTestId("scout-card-verified")).toBeVisible({ timeout: 3000 });
  }).toPass();
  await expect(again.getByText("Seen before")).toBeVisible();
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("clash-discard").click();
});

test("champions: recognised ones show their portrait, a suggestion and an unknown one are chosen from the searchable list, and figures are corrected in the card", async ({ page }, info) => {
  test.skip(info.project.name === "tablet", "phone and desktop cover the card");
  await freshDraft(page);
  await readBoth(page, "champions");
  const first = cards(page).first();
  const ranked = first.getByTestId("scout-ranked-row");
  await expect(ranked.nth(0).getByTestId("scout-champion")).toHaveAttribute("data-state", "sure");
  // The browser tests run offline, so the portrait is the champion's lettered tile, named in its title.
  await expect(ranked.nth(0).getByTestId("scout-champion")).toHaveAttribute("data-champion", "Ahri");
  await expect(ranked.nth(0).getByTitle("Ahri")).toBeVisible();
  // A suggestion: marked, and confirmed (or changed) from the list, which offers it first.
  const suggested = ranked.nth(1).getByTestId("scout-champion");
  await expect(suggested).toHaveAttribute("data-state", "suggested");
  await suggested.click();
  const picker = page.getByRole("dialog", { name: "Is it Akali?" });
  await expect(picker).toBeVisible();
  await picker.locator('button[data-champion="Akali"]').first().click();
  await expect(ranked.nth(1).getByTestId("scout-champion")).toHaveAttribute("data-state", "chosen");
  // Unknown: chosen by searching.
  const unknown = cards(page).nth(2).getByTestId("scout-ranked-row").nth(2).getByTestId("scout-champion");
  await expect(unknown).toHaveAttribute("data-state", "unknown");
  await unknown.click();
  const list = page.getByRole("dialog", { name: "Which champion is it?" });
  await list.getByRole("searchbox").fill("lux");
  await list.locator('button[data-champion="Lux"]').click();
  await expect(cards(page).nth(2).getByTestId("scout-ranked-row").nth(2).getByTestId("scout-champion")).toHaveAttribute("data-champion", "Lux");
  // A newer screenshot keeps what the member chose.
  await page.getByTestId("clash-file-input").setInputFiles([shot("ranked.png", "champions-again")]);
  await expect(tile(page, "ranked")).toHaveAttribute("data-status", "done");
  await expect(cards(page).nth(2).getByTestId("scout-ranked-row").nth(2).getByTestId("scout-champion")).toHaveAttribute("data-champion", "Lux");
  // Figures: corrected in the card's own editor, no window.
  await first.getByTestId("scout-card-edit").click();
  const winRate = first.getByTestId("scout-ranked-row").first().getByLabel("Win rate %");
  await winRate.fill("64");
  await winRate.blur();
  await first.getByTestId("scout-card-edit").click();
  await expect(first.getByTestId("scout-ranked-row").first()).toContainText("64% · 41 games");
  await expect(page.getByTestId("scout-detail")).toHaveCount(0);
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("clash-discard").click();
});

test("Open all verified profiles: when the browser blocks the tabs, the remaining profiles stay one tap away", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one pass is enough");
  await freshDraft(page);
  await readBoth(page, "blocked");
  // Identify two players.
  for (const [i, riotId] of [[0, "Пётр Пустота#RU1"], [1, "오징어게임#KR1"]] as const) {
    const card = cards(page).nth(i);
    await card.getByTestId("scout-card-add-riot-id").click();
    await card.getByTestId("scout-card-riot-input").fill(riotId);
    await expect(async () => {
      await card.getByTestId("scout-card-verify").click({ timeout: 2000 });
      await expect(card.getByTestId("scout-card-verified")).toBeVisible({ timeout: 3000 });
    }).toPass();
  }
  // A browser that allows one new tab per click.
  await page.evaluate(() => {
    let left = 1;
    window.open = (() => (left-- > 0 ? ({ opener: window } as unknown as Window) : null)) as typeof window.open;
  });
  await page.getByTestId("clash-open-all").click();
  const blocked = page.getByTestId("clash-open-blocked");
  await expect(blocked).toHaveCount(1);
  await expect(blocked).toHaveAttribute("href", /op\.gg\/lol\/summoners\/[a-z]+\/%EC%98%A4%EC%A7%95%EC%96%B4%EA%B2%8C%EC%9E%84-KR1$/);
  await expect(blocked).toHaveAttribute("target", "_blank");
  await expect(page.getByTestId("clash-open-unresolved")).toHaveCount(3);
  // Nothing was lost meanwhile: the scout is as it was.
  await expect.poll(() => cardNames(page)).toEqual(NAMES);
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("clash-discard").click();
});

test("a saved scout: the member who saved it and lineup managers edit or delete it, after confirming; other members read it", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop", "one pass is enough for permissions");
  await openScout(page);
  const member = await memberContext(browser, page);
  // The member saves a scout.
  const mp = member.page;
  await openScout(mp);
  await mp.getByTestId("clash-file-input").setInputFiles([shot("ranked.png", "perm")]);
  await expect.poll(() => mp.getByTestId("scout-card-name").allInnerTexts()).toEqual(NAMES);
  const name = unique("Member Scout");
  await mp.getByTestId("clash-opponent").fill(name);
  await mp.getByTestId("clash-save").click();
  await expect(mp).toHaveURL(/\/clash\/[0-9a-f-]{36}$/);
  const url = mp.url();
  // Their own: editable (a name too, in its card).
  await mp.getByTestId("clash-opponent").fill(`${name} (edited)`);
  const first = mp.getByTestId("scout-card").first();
  await first.getByTestId("scout-card-edit").click();
  await first.getByTestId("scout-card-name-input").fill("Пётр");
  await first.getByTestId("scout-card-name-input").press("Enter");
  await first.getByTestId("scout-card-edit").click();
  await mp.getByTestId("clash-save-changes").click();
  await expect(mp.getByTestId("clash-save-changes")).toHaveText(/Saved/);
  await mp.reload();
  await expect(mp.getByTestId("scout-card-name").first()).toHaveText("Пётр");
  await expect(mp.getByTestId("scout-card-source").first()).toHaveAttribute("data-source", "corrected");

  // The whole team sees it in the history; there is no archive any more, only Delete.
  await page.goto(`/clash?q=${encodeURIComponent(name)}`);
  await expect(page.getByTestId("clash-history-row")).toHaveCount(1);
  await expect(page.getByTestId("clash-history-archived")).toHaveCount(0);
  // The Owner (the demo's local account) is a lineup manager: Delete is offered on the member's scout.
  await openScout(page, url);
  await expect(page.getByTestId("clash-opponent")).toHaveValue(`${name} (edited)`);
  await expect(page.getByTestId("clash-archive")).toHaveCount(0);
  await expect(page.getByTestId("clash-delete")).toBeVisible();

  // An Owner's scout is read-only for the member: no name editing in the cards, no Delete.
  await openScout(page);
  await page.getByTestId("clash-file-input").setInputFiles([shot("ranked.png", "owner")]);
  await expect.poll(() => cardNames(page)).toEqual(NAMES);
  await page.getByTestId("clash-opponent").fill(unique("Owner Scout"));
  await page.getByTestId("clash-save").click();
  await expect(page).toHaveURL(/\/clash\/[0-9a-f-]{36}$/);
  await openScout(mp, page.url());
  await expect(mp.getByTestId("clash-opponent")).toBeDisabled();
  await expect(mp.getByTestId("clash-save-changes")).toHaveCount(0);
  await expect(mp.getByTestId("scout-card-edit")).toHaveCount(0);
  await expect(mp.getByTestId("clash-delete")).toHaveCount(0);
  await expect(mp.getByTestId("clash-saved-meta")).toContainText("Only the member who saved it, or a lineup manager, can change or delete it.");

  // Delete asks first: Cancel keeps the scout; Delete scout removes it for the whole team.
  await openScout(mp, url);
  await mp.getByTestId("clash-delete").click();
  const confirm = mp.getByRole("dialog", { name: "Delete this scout?" });
  await expect(confirm).toContainText("This cannot be undone.");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
  await expect(mp).toHaveURL(url);
  await mp.getByTestId("clash-delete").click();
  await mp.getByTestId("confirm-dialog-confirm").click();
  await expect(mp).toHaveURL(/\/clash$/);
  await expect(mp.getByText("Scout deleted")).toBeVisible();
  await page.goto(`/clash?q=${encodeURIComponent(name)}`);
  await expect(page.getByTestId("clash-history-row")).toHaveCount(0);
  await page.goto(url);
  await expect(page.getByTestId("not-found")).toContainText("This page does not exist");
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
