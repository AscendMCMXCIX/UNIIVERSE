import { expect, test } from "./test";
import { memberContext } from "./member-account";
import { accountsPageVerdict, bookmarkVerdict, MANAGEMENT_CONTROLS, managementVerdict, readBookmarkControls, readManagementControls } from "../scripts/boundary-facts.mjs";

/*
  The Production check's permission boundaries (Release 19; scripts/boundary-facts.mjs) on the demo,
  so the controls those facts look for are the ones the app draws: a standard member, as the
  verification account is, is offered no control to manage the lineup, a teammate's profile, card
  or Riot accounts, or a teammate's bookmark, and a session never opens the jobs endpoint; the
  local owner, who may manage everything, is offered them, so the facts cannot pass on nothing.
  Desktop only: the facts read the same markup at every width.
*/

test.skip(({ isMobile, viewport }) => !!isMobile || (viewport?.width ?? 0) < 1200, "desktop only");

test("a standard member is offered no management control on Team, a teammate's profile and Riot accounts, or Team Matches; the owner is", async ({ page, browser }) => {
  // The local owner first: the same readings find the controls, so the member's zero means something.
  await page.goto("/team");
  await expect(page.getByTestId("edit-lineup")).toBeVisible();
  const teammate = await page.locator("[data-testid^=lineup-row-][data-player-id]").first().getAttribute("data-player-id");
  expect(teammate).toBeTruthy();
  expect(managementVerdict("desktop", "team", await page.evaluate(readManagementControls, MANAGEMENT_CONTROLS.team)).status).toBe("FAIL");
  await page.goto(`/players/${teammate}`);
  await expect(page.getByTestId("profile-header")).toBeVisible();
  expect(managementVerdict("desktop", "profile", await page.evaluate(readManagementControls, MANAGEMENT_CONTROLS.profile)).status).toBe("FAIL");

  const member = await memberContext(browser, page, { width: 1440, height: 900 }, { base: "Bound" });
  try {
    const m = member.page;
    await m.goto("/team");
    await expect(m.locator("[data-testid^=lineup-row-]").first()).toBeVisible();
    const team = managementVerdict("desktop", "team", await m.evaluate(readManagementControls, MANAGEMENT_CONTROLS.team));
    expect(team.status, JSON.stringify(team.detail)).toBe("PASS");
    await m.goto(`/players/${teammate}`);
    await expect(m.getByTestId("profile-header")).toBeVisible();
    const profile = managementVerdict("desktop", "profile", await m.evaluate(readManagementControls, MANAGEMENT_CONTROLS.profile));
    expect(profile.status, JSON.stringify(profile.detail)).toBe("PASS");
    await m.goto("/matches");
    await expect(m.getByTestId("matches-summary")).toBeVisible();
    const bookmarks = bookmarkVerdict("desktop", await m.evaluate(readBookmarkControls));
    expect(bookmarks.status, JSON.stringify(bookmarks.detail)).toBe("PASS");
    const accounts = await m.request.get(`/players/${teammate}/accounts`, { maxRedirects: 0 });
    const verdict = accountsPageVerdict({ status: accounts.status(), text: await accounts.text() });
    expect(verdict.status, JSON.stringify(verdict.detail)).toBe("PASS");
    // A session never runs a job: refused before the database is opened (401 with the scheduler's
    // secret configured, as in production; 503 on a server without one, as here).
    const tick = await m.request.get("/api/jobs/tick", { maxRedirects: 0 });
    expect([401, 503]).toContain(tick.status());
  } finally {
    await member.context.close();
  }
});
