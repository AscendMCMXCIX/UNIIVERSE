import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ACCOUNT_CONTROLS, accountsPageVerdict, bookmarkVerdict, jobsSessionVerdict, MANAGEMENT_CONTROLS, managementVerdict, NO_PROFILE, noProfileVerdict } from "../../../scripts/boundary-facts.mjs";

/*
  The Production check's permission boundaries as the verification account (scripts/boundary-facts.mjs,
  Release 19): no control to manage a teammate's lineup, pool, profile, card, Riot accounts or
  bookmarks reaches its pages; My Profile for an account with no profile shows no one's profile as
  its own; and a session never opens the jobs endpoint. The markers it looks for must be the ones the
  app writes, so a rename in a component fails here rather than letting the fact pass on nothing.
*/

const ROOT = path.resolve(__dirname, "../../..");
const source = (file: string) => readFileSync(path.join(ROOT, file), "utf8");
/** Every component's source, joined: where the app writes its test ids. */
function components(dir = path.join(ROOT, "src/components")): string {
  return readdirSync(dir)
    .map((name) => path.join(dir, name))
    .map((p) => (statSync(p).isDirectory() ? components(p) : /\.tsx?$/.test(p) && !/\.test\./.test(p) ? readFileSync(p, "utf8") : ""))
    .join("\n");
}

describe("the permission boundary facts", () => {
  it("look for markers the app's components actually write", () => {
    const owners = ["src/components/team/team-roster.tsx", "src/components/team/riot-accounts-panel.tsx", "src/components/matches/bookmark-button.tsx"].map(source).join("\n");
    for (const id of ["edit-lineup", "riot-account-move-", "riot-account-menu", "bookmark-game", "bookmark-state"]) expect(owners, id).toContain(id);
    for (const words of ACCOUNT_CONTROLS.filter((m) => !m.startsWith("riot-account"))) expect(source("src/components/team/riot-accounts-panel.tsx"), words).toContain(words);
    expect(source("src/app/(app)/overview/layout.tsx")).toContain(NO_PROFILE);
    // Every management control the facts look for is a test id some component writes.
    const all = components();
    for (const prefix of [...MANAGEMENT_CONTROLS.team, ...MANAGEMENT_CONTROLS.profile]) expect(all.includes(`data-testid="${prefix}`) || all.includes(`data-testid={\`${prefix}`) || all.includes(`testId="${prefix}`), prefix).toBe(true);
  });

  it("pass with no control offered, and fail on any", () => {
    expect(managementVerdict("desktop", "team", { "edit-lineup": 0, "lineup-sheet-": 0, "lineup-change-": 0 }).status).toBe("PASS");
    const v = managementVerdict("phone", "profile", { "pools-edit": 0, "profile-editor": 1 });
    expect(v.status).toBe("FAIL");
    expect(v.detail).toMatchObject({ offered: ["profile-editor"] });
    expect(bookmarkVerdict("desktop", { removable: 0, states: 2 }).status).toBe("PASS");
    expect(bookmarkVerdict("desktop", { removable: 1, states: 1 }).status).toBe("FAIL");
  });

  it("a teammate's accounts page: opens with no reorder, menu or add control; counts only, never the page's words", () => {
    const viewOnly = '<li data-testid="riot-account-row" data-label="main"><span data-testid="riot-account-id">Made Up#OCE</span></li>';
    expect(accountsPageVerdict({ status: 200, text: viewOnly })).toMatchObject({ status: "PASS", detail: { status: 200, offered: [], rows: 1 } });
    expect(JSON.stringify(accountsPageVerdict({ status: 200, text: viewOnly }))).not.toContain("Made Up");
    expect(accountsPageVerdict({ status: 200, text: `${viewOnly}<button data-testid="riot-account-move-down">` }).status).toBe("FAIL");
    expect(accountsPageVerdict({ status: 200, text: `${viewOnly}<label>Add a Riot ID</label>` }).status).toBe("FAIL");
    expect(accountsPageVerdict({ status: 307, text: "" }).status).toBe("FAIL");
  });

  it("My Profile with no profile: says so, with no profile header or account rows", () => {
    expect(noProfileVerdict("/overview", { status: 200, text: `<p>${NO_PROFILE}. Player profiles are created by an administrator.</p>` }).status).toBe("PASS");
    expect(noProfileVerdict("/overview", { status: 200, text: '<header data-testid="profile-header"></header>' }).status).toBe("FAIL");
    expect(noProfileVerdict("/overview/accounts", { status: 200, text: `<p>${NO_PROFILE}</p><li data-testid="riot-account-row"></li>` }).status).toBe("FAIL");
  });

  it("the jobs endpoint with a session cookie and no secret must answer 401", () => {
    expect(jobsSessionVerdict({ status: 401 }).status).toBe("PASS");
    for (const status of [200, 202, 302, 403, 500]) expect(jobsSessionVerdict({ status }).status).toBe("FAIL");
  });

  it("the live check runs each of them, the cookie-only jobs request among the member's refusals", () => {
    const script = source("scripts/live-check.mjs");
    const refusals = /async function memberRefusals[\s\S]*?\n}\n/.exec(script)?.[0] ?? "";
    expect(refusals).toContain("/api/jobs/tick");
    expect(refusals).toContain("jobsSessionVerdict");
    expect(refusals).toContain("accountsPageVerdict");
    expect(refusals).toContain("noProfileVerdict");
    for (const call of ['managementFacts(page, kind, "team")', 'managementFacts(page, kind, "profile")', "bookmarkVerdict(kind", "riotFiguresOnPage(team.text)", "leaderboardScopeVerdicts("]) expect(script, call).toContain(call);
  });
});
