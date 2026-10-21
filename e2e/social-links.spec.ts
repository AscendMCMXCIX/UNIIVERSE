import { expect, test } from "./test";
import { memberContext } from "./member-account";

/*
  Social links (domain/social-links): a member adds a YouTube, Twitch and Discord in Settings and
  chooses who may see each. Nothing shows until they choose an audience; a link kept to "Only me"
  never reaches anyone else; YouTube and Twitch open the channel in a new tab, Discord copies the
  username; only YouTube and Twitch addresses are accepted.
*/

test("a member chooses who sees each link; teammates see only those, and nothing else", async ({ browser, page: admin }, info) => {
  test.skip(info.project.name !== "desktop", "one size is enough for the flow; the chips wrap like any text");
  const { context, page, username } = await memberContext(browser, admin);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/settings");
  const form = page.getByTestId("social-links-form");
  await expect(form).toBeVisible();

  // Only these sites' own addresses are accepted, checked as typed.
  await form.getByLabel("YouTube", { exact: true }).fill("https://evil.example/@E2EChannel");
  await expect(form.getByText(/Enter your channel's address on youtube\.com/)).toBeVisible();
  await expect(page.getByTestId("social-links-save")).toBeDisabled();

  await form.getByLabel("YouTube", { exact: true }).fill("youtube.com/@E2EChannel");
  await form.getByLabel("Who can see it").nth(0).selectOption("team");
  await form.getByLabel("Twitch", { exact: true }).fill("e2e_live_stream");
  // Twitch stays "Only me" (the default): it must not show anywhere.
  await form.getByLabel("Discord", { exact: true }).fill("@E2E.Player");
  await form.getByLabel("Who can see it").nth(2).selectOption("team");
  // The preview shows what each audience will see, before saving: the team two, the public none.
  const [forTeam, forPublic] = [form.getByTestId("social-preview-team"), form.getByTestId("social-preview-public")];
  await expect(forTeam.getByTestId("social-youtube")).toBeVisible();
  await expect(forTeam.getByTestId("social-discord")).toHaveAttribute("aria-label", /e2e\.player/);
  await expect(forTeam.getByTestId("social-twitch")).toHaveCount(0);
  await expect(forPublic).toContainText("nothing");
  await page.getByTestId("social-links-save").click();
  await expect(page.getByText("Social links saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("social-links-form").getByLabel("YouTube", { exact: true })).toHaveValue("youtube.com/@E2EChannel");
  await expect(page.getByTestId("social-links-form").getByLabel("Discord", { exact: true })).toHaveValue("e2e.player");

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

  // A teammate opening the profile: the same two, never the Twitch kept to "Only me".
  await admin.goto("/players");
  await admin.locator("main a[data-testid='player-card']", { hasText: username }).first().click();
  const seen = admin.getByTestId("profile-header").getByTestId("social-links");
  await expect(seen.getByTestId("social-youtube")).toBeVisible();
  await expect(seen.getByTestId("social-discord")).toHaveAttribute("aria-label", /e2e\.player/);
  await expect(seen.getByTestId("social-twitch")).toHaveCount(0);
  expect(await admin.content()).not.toContain("e2e_live_stream");
  await context.close();
});
