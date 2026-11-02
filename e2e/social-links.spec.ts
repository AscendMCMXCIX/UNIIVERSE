import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "./test";
import { memberContext } from "./member-account";

/*
  Social links (domain/social-links): a member adds a YouTube, Twitch and Discord in Settings, each
  with one switch, "Show publicly". Every switch starts off, and a link switched off never reaches
  anyone else; switched on, teammates and the public team page see it. YouTube and Twitch open the
  channel in a new tab, Discord copies the username; only YouTube and Twitch addresses are accepted.
*/

const toggle = (form: Locator, platform: string) => form.getByRole("switch", { name: `Show publicly: ${platform}` });

test("a member switches on the links to show; teammates see only those, and nothing else", async ({ browser, page: admin }, info) => {
  test.skip(info.project.name !== "desktop", "one size is enough for the flow; the touch layout has its own check below");
  const { context, page, username } = await memberContext(browser, admin);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/settings");
  const form = page.getByTestId("social-links-form");
  await expect(form).toBeVisible();
  // Nothing is shown until its owner says so; each switch on its platform's line, no row of its own.
  for (const [platform, kind] of [["YouTube", "youtube"], ["Twitch", "twitch"], ["Discord", "discord"]] as const) {
    await expect(toggle(form, platform)).not.toBeChecked();
    expect((await expectOnLabelLine(page, platform, kind)).height).toBeGreaterThanOrEqual(32);
  }
  await expect(form.getByTestId("social-links-preview")).toContainText("nothing");

  // Only these sites' own addresses are accepted, checked as typed.
  await form.getByLabel("YouTube", { exact: true }).fill("https://evil.example/@E2EChannel");
  await expect(form.getByText(/Enter your channel's address on youtube\.com/)).toBeVisible();
  await expect(page.getByTestId("social-links-save")).toBeDisabled();

  await form.getByLabel("YouTube", { exact: true }).fill("youtube.com/@E2EChannel");
  // The whole switch, its words included, is the target.
  await form.getByTestId("social-public-youtube").getByText("Show publicly").click();
  await expect(toggle(form, "YouTube")).toBeChecked();
  await form.getByLabel("Twitch", { exact: true }).fill("e2e_live_stream");
  // Twitch stays off (the default): it must not show anywhere.
  await form.getByLabel("Discord", { exact: true }).fill("@E2E.Player");
  await form.getByTestId("social-public-discord").click();
  await expect(toggle(form, "Discord")).toBeChecked();
  // The preview shows, before saving, what everyone else will see: the two switched on.
  const preview = form.getByTestId("social-links-preview");
  await expect(preview.getByTestId("social-youtube")).toBeVisible();
  await expect(preview.getByTestId("social-discord")).toHaveAttribute("aria-label", /e2e\.player/);
  await expect(preview.getByTestId("social-twitch")).toHaveCount(0);
  // The switches, on and off, as an accessibility checker reads them: named, with enough contrast.
  const scan = await new AxeBuilder({ page }).include("[data-testid=social-links-form]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(scan.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")})`)).toEqual([]);
  await page.getByTestId("social-links-save").click();
  await expect(page.getByText("Social links saved.")).toBeVisible();
  await page.reload();
  const saved = page.getByTestId("social-links-form");
  await expect(saved.getByLabel("YouTube", { exact: true })).toHaveValue("youtube.com/@E2EChannel");
  await expect(saved.getByLabel("Discord", { exact: true })).toHaveValue("e2e.player");
  await expect(saved.getByLabel("Twitch", { exact: true })).toHaveValue("twitch.tv/e2e_live_stream");
  await expect(toggle(saved, "YouTube")).toBeChecked();
  await expect(toggle(saved, "Twitch")).not.toBeChecked();
  await expect(toggle(saved, "Discord")).toBeChecked();

  // Their own profile shows what teammates see.
  await page.goto("/overview");
  const chips = page.getByTestId("profile-header").getByTestId("social-links");
  await expect(chips.getByTestId("social-youtube")).toHaveAttribute("href", "https://www.youtube.com/@E2EChannel");
  await expect(chips.getByTestId("social-youtube")).toHaveAttribute("target", "_blank");
  await expect(chips.getByTestId("social-youtube")).toHaveAttribute("rel", /noopener/);
  await expect(chips.getByTestId("social-twitch")).toHaveCount(0);
  await chips.getByTestId("social-discord").click();
  await expect(page.getByText("Discord username copied.")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("e2e.player");

  // A teammate opening the profile: the same two, never the Twitch kept private.
  await admin.goto("/players");
  await admin.locator("main a[data-testid='player-card']", { hasText: username }).first().click();
  const seen = admin.getByTestId("profile-header").getByTestId("social-links");
  await expect(seen.getByTestId("social-youtube")).toBeVisible();
  await expect(seen.getByTestId("social-discord")).toHaveAttribute("aria-label", /e2e\.player/);
  await expect(seen.getByTestId("social-twitch")).toHaveCount(0);
  expect(await admin.content()).not.toContain("e2e_live_stream");

  // Switched off again: gone for teammates too.
  await page.goto("/settings");
  await page.getByTestId("social-public-youtube").click();
  await expect(toggle(page.getByTestId("social-links-form"), "YouTube")).not.toBeChecked();
  await page.getByTestId("social-links-save").click();
  await expect(page.getByText("Social links saved.")).toBeVisible();
  await admin.reload();
  await expect(admin.getByTestId("profile-header").getByTestId("social-discord")).toBeVisible();
  await expect(admin.getByTestId("profile-header").getByTestId("social-youtube")).toHaveCount(0);
  await context.close();
});

/** Each platform's switch sits on its label's line, at the right, with no row of its own. */
async function expectOnLabelLine(page: Page, platform: string, kind: string) {
  const field = page.getByTestId(`social-field-${kind}`);
  const label = await field.locator(`label[for$='-${kind}']`).first().boundingBox();
  const target = await field.getByTestId(`social-public-${kind}`).boundingBox();
  const input = await field.getByLabel(platform, { exact: true }).boundingBox();
  expect(label && target && input).toBeTruthy();
  // On the label's line (centres level), above the field, and ending at the field's right edge.
  expect(Math.abs(label!.y + label!.height / 2 - (target!.y + target!.height / 2))).toBeLessThan(4);
  expect(target!.y + target!.height).toBeLessThanOrEqual(input!.y + 1);
  expect(Math.abs(target!.x + target!.width - (input!.x + input!.width))).toBeLessThan(8);
  return target!;
}

test("on touch screens each switch is a finger-sized target on its platform's line, and its words toggle it", async ({ browser, page: admin }, info) => {
  test.skip(info.project.name === "desktop", "the touch sizes; the desktop flow above covers the rest");
  // The member's session, opened again as this project's phone or tablet (touch, its own size).
  const member = await memberContext(browser, admin);
  const { viewport, isMobile, hasTouch, deviceScaleFactor } = info.project.use;
  const context = await browser.newContext({ viewport, isMobile, hasTouch, deviceScaleFactor, storageState: await member.context.storageState() });
  await member.context.close();
  const page = await context.newPage();
  await page.goto("/settings");
  const form = page.getByTestId("social-links-form");
  await expect(form).toBeVisible();
  for (const [platform, kind] of [["YouTube", "youtube"], ["Twitch", "twitch"], ["Discord", "discord"]] as const) {
    const box = await expectOnLabelLine(page, platform, kind);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(toggle(form, platform)).not.toBeChecked();
  }
  // A tap on the words, not only the knob, switches it, and the state reads without the colour.
  const youtube = form.getByTestId("social-public-youtube");
  await youtube.getByText("Show publicly").tap();
  await expect(toggle(form, "YouTube")).toBeChecked();
  await expect(youtube).toHaveAttribute("data-state", "on");
  await youtube.tap();
  await expect(toggle(form, "YouTube")).not.toBeChecked();
  await expect(youtube).toHaveAttribute("data-state", "off");
  // Nothing wider than the screen.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await context.close();
});
