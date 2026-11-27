/*
  Permission boundaries the Production check proves as the verification account (Release 19, the
  owner's request of 26 Nov 2026, item 7; docs/LIVE_VALIDATION.md, "What it checks"): a member with
  view-team, view-players, view-teammate-stats and view-matches, and no player profile, and none of
  manage-lineup, manage-players, manage-matches or any admin right (server/auth/permissions.ts,
  STANDARD_PLAYER). So none of the controls that change someone else's lineup, pools, profile,
  Riot accounts or bookmarks may reach its pages, no profile is shown to it as its own, and its
  session never opens the jobs endpoint. Nothing is clicked or submitted: the pages already loaded
  are read, and GET requests are made. Only counts, statuses and true/false are reported: the
  accounts page holds Riot IDs, and none of its text is quoted.
*/

/** The controls each page must not offer the verification account, by data-testid prefix. */
export const MANAGEMENT_CONTROLS = {
  team: ["edit-lineup", "lineup-sheet-", "lineup-change-"],
  profile: ["pools-edit", "edit-pool-on-profile", "pool-remove", "profile-avatar-edit", "profile-editor", "add-secondary-role", "card-studio", "preview-studio"],
};

/**
 * In the page (self-contained, for page.evaluate): how many elements carry each data-testid prefix,
 * and on Team Matches how many bookmark buttons offer to remove a bookmark (`data-bookmarked`).
 */
export function readManagementControls(prefixes) {
  const counts = {};
  for (const p of prefixes) counts[p] = document.querySelectorAll(`[data-testid^="${p}"]`).length;
  return counts;
}

/** Team Matches, in the page: bookmark removal controls (a bookmarked game's button), and the bookmarks shown as a state. */
export function readBookmarkControls() {
  return { removable: document.querySelectorAll("[data-testid=bookmark-game][data-bookmarked], [data-testid=share-game][data-bookmarked]").length, states: document.querySelectorAll("[data-testid=bookmark-state]").length };
}

const verdict = (name, ok, detail) => ({ name, status: ok ? "PASS" : "FAIL", detail });

/** No management control on a page the verification account opened. */
export function managementVerdict(kind, where, counts) {
  const offered = Object.entries(counts).filter(([, n]) => n > 0).map(([p]) => p);
  const words = { team: "Team: no lineup controls", profile: "a teammate's profile: no pool, profile, picture or card controls" }[where] ?? `${where}: no management controls`;
  return verdict(`${kind}: ${words} for a member without the right to manage them`, offered.length === 0, { offered, checked: Object.keys(counts).length });
}

/** Team Matches: a bookmark the verification account did not make shows as a state, with no control to remove it. */
export function bookmarkVerdict(kind, read) {
  return verdict(`${kind}: Team Matches: no control to remove a teammate's bookmark (a bookmarked game shows the state alone)`, read.removable === 0, read);
}

/**
 * Markers of the controls a teammate's Riot accounts page shows only to someone who may manage them
 * (components/team/riot-accounts-panel.tsx, `editable`): reorder, the account's menu (rename, unlink),
 * and adding an account (its form's label, or its button).
 */
export const ACCOUNT_CONTROLS = ["riot-account-move-", "riot-account-menu", "Add a Riot ID", "Add Riot account"];

/** A teammate's Riot accounts page (GET, signed in): it opens, with no control to reorder, unlink or add an account. Counts only. */
export function accountsPageVerdict(res) {
  const html = String(res.text ?? "");
  const offered = ACCOUNT_CONTROLS.filter((m) => html.includes(m));
  const rows = (html.match(/data-testid="riot-account-row"/g) ?? []).length;
  return verdict("signed in as a member: a teammate's Riot accounts page opens with no control to reorder, unlink or add an account", res.status === 200 && offered.length === 0, { status: res.status, offered, rows });
}

/** The fixed sentence My Profile shows an account with no player profile (app/(app)/overview/layout.tsx). */
export const NO_PROFILE = "This account has no player profile";

/** My Profile for an account with no profile: it says so, and shows no one else's profile or accounts as its own. */
export function noProfileVerdict(path, res) {
  const html = String(res.text ?? "");
  const said = html.includes(NO_PROFILE);
  const accounts = (html.match(/data-testid="riot-account-row"/g) ?? []).length;
  const header = html.includes('data-testid="profile-header"');
  return verdict(`signed in as a member with no player profile: ${path} says so and shows no one's profile or accounts as its own`, res.status === 200 && said && accounts === 0 && !header, { status: res.status, says: said, accountRows: accounts, profileHeader: header });
}

/** The jobs endpoint with a member's session cookie and no scheduler's secret: a session never authorises a job. */
export function jobsSessionVerdict(res) {
  return verdict("signed in as a member: the jobs endpoint with the session cookie and no secret answers 401", res.status === 401, { status: res.status });
}
