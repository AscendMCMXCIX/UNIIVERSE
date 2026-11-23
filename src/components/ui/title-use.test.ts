import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/*
  A native `title` (the browser's hover label) explains nothing (docs/STANDARDS.md, "Tooltips";
  DESIGN_SYSTEM §7, "Explain"): it never shows on a touch screen or to a keyboard, so a fact only in a
  title is a fact most members never see. A title only
    - names an icon-only control or mark (which also has its accessible name), or
    - shows a value whole where the page may truncate it.
  An explanation goes in visible text or an InfoTip.

  Found here in the source: every `title=` on an HTML element, or on a component that hands it to
  one (NATIVE). A short literal name (at most four words, no sentence punctuation) passes as it is;
  every other title is listed in NAMES with what it names or shows whole, so a new one is looked at.
  Admin Mode is in since S9c (20 Nov 2026).
*/

const ROOT = join(__dirname, "..", "..", "..");
const NATIVE = new Set(["Badge", "Link", "Button", "ChampionPortrait", "RemoteImage", "RoleIcon", "StatTile", "Stat"]);
const OUT_OF_SCOPE: RegExp[] = [];

type Kind = "name" | "truncation" | "passthrough";
/** Every title that is not a short literal, by file and a fragment of its value. */
const NAMES: Array<{ file: string; fragment: string; kind: Kind; what: string }> = [
  // Components that hand their caller's `title` on: the callers' titles are what is checked.
  { file: "src/components/ui/badge.tsx", fragment: "{title}", kind: "passthrough", what: "Badge's title prop" },
  { file: "src/components/champion-portrait.tsx", fragment: "title", kind: "passthrough", what: "the portrait's champion name, or the caller's name for it" },
  { file: "src/components/role-icon.tsx", fragment: "label", kind: "name", what: "the role's name on its icon" },
  { file: "src/components/match-history/icon-img.tsx", fragment: "icon.name", kind: "name", what: "an item's, rune's or spell's name on its icon" },
  // Names of icon-only controls and marks.
  { file: "src/components/mode-switch.tsx", fragment: "{label}", kind: "name", what: "the mode switch's name when only its icon shows" },
  { file: "src/components/nav-links.tsx", fragment: "{label}", kind: "name", what: "a destination's name in the collapsed sidebar" },
  { file: "src/components/mobile-nav.tsx", fragment: "d.label", kind: "name", what: "a destination's name" },
  { file: "src/components/collapsible-sidebar.tsx", fragment: "label", kind: "name", what: "the sidebar button's name and its shortcut" },
  { file: "src/components/ui/filter-bar.tsx", fragment: "resetLabel", kind: "name", what: "Reset, when only its icon shows" },
  { file: "src/components/ui/segmented.tsx", fragment: "ROLE_LABELS[r]", kind: "name", what: "a role's name when only its icon shows" },
  { file: "src/components/ui/segmented.tsx", fragment: "countTitle", kind: "name", what: "the count badge's name (\"12 games\")" },
  { file: "src/components/matches/bookmark-button.tsx", fragment: "label", kind: "name", what: "the bookmark button's name when only its icon shows" },
  { file: "src/components/champions/champion-grid.tsx", fragment: "ROLE_LABELS[o]", kind: "name", what: "a role filter's name on its icon" },
  { file: "src/components/match-history/history-summary.tsx", fragment: "g.win", kind: "name", what: "a result dot's name (\"Win · Ahri\")" },
  { file: "src/components/players/recent-form.tsx", fragment: "g.win", kind: "name", what: "a result dot's name (\"Win · Ahri\")" },
  { file: "src/components/match-history/scoreboard.tsx", fragment: "Banned:", kind: "name", what: "a ban's champion, on its portrait" },
  { file: "src/components/match-history/scoreboard.tsx", fragment: "x.champLevel", kind: "name", what: "the level badge on a portrait" },
  { file: "src/components/match-history/match-card.tsx", fragment: "Level ${level}", kind: "name", what: "the level badge on a portrait" },
  { file: "src/components/match-history/player-link.tsx", fragment: "${label}", kind: "name", what: "where a player's name or OP.GG mark leads" },
  { file: "src/components/players/social-links.tsx", fragment: "link.label", kind: "name", what: "a social link's site and handle, on its icon" },
  { file: "src/components/players/social-links.tsx", fragment: "Discord:", kind: "name", what: "the Discord button's handle and action, on its icon" },
  { file: "src/components/players/tier-badge.tsx", fragment: "EVIDENCE_TEXT[evidence]", kind: "name", what: "the evidence bars' name" },
  { file: "src/components/team/player-data-panel.tsx", fragment: "pool · ${ROLE_LABELS[c.role]}", kind: "name", what: "the pool's role icon" },
  { file: "src/components/team/riot-accounts-panel.tsx", fragment: "Move up", kind: "name", what: "the arrow buttons' names" },
  { file: "src/components/profile/profile-editor.tsx", fragment: "ROLE_LABELS[role]", kind: "name", what: "the remove button's name" },
  { file: "src/components/resources/resources-manager.tsx", fragment: "{label}", kind: "name", what: "an icon button's name" },
  { file: "src/components/resources/resources-view.tsx", fragment: "favourite ?", kind: "name", what: "the star button's name" },
  { file: "src/components/section-tabs.tsx", fragment: "team.name", kind: "name", what: "the team's tab, its name whole" },
  { file: "src/components/players/customise-card.tsx", fragment: "{label}", kind: "name", what: "a swatch's colour name" },
  { file: "src/components/players/customise-card.tsx", fragment: "emblemName(e)", kind: "name", what: "an emblem's name" },
  { file: "src/components/players/customise-card.tsx", fragment: "s.name", kind: "name", what: "a style's name" },
  { file: "src/components/ui/page-toolbar.tsx", fragment: "{label}", kind: "name", what: "a filter's name, whole" },
  { file: "src/components/ui/sub-tabs.tsx", fragment: "t.label", kind: "name", what: "a tab's name, whole" },
  { file: "src/components/champions/champion-grid.tsx", fragment: "{c.name}", kind: "truncation", what: "a champion's name, cut to two lines" },
  { file: "src/components/match-history/history-summary.tsx", fragment: "champ(c.championId).name", kind: "name", what: "a most-played portrait's champion" },
  { file: "src/components/matches/played-together.tsx", fragment: "{c.name}", kind: "name", what: "a member's champion, on its portrait" },
  { file: "src/components/matches/bookmark-button.tsx", fragment: "Bookmark this game", kind: "name", what: "the bookmark button's name (where it goes is the toast's)" },
  { file: "src/components/players/player-card.tsx", fragment: "more on the profile", kind: "name", what: "the \"+3\" mark after a pool's portraits" },
  { file: "src/components/profile/profile-editor.tsx", fragment: "Drag to change your role order", kind: "name", what: "a role's drag handle" },
  { file: "src/components/team/team-roster.tsx", fragment: "bench.start.label", kind: "name", what: "Make starter's full name (who takes the role)" },
  { file: "src/components/ui/data-status.tsx", fragment: "Check Riot for new games, rank and mastery now", kind: "name", what: "Refresh's name where only its icon shows" },
  { file: "src/components/ui/data-list.tsx", fragment: "{unplaced}", kind: "name", what: "the dash where a row has no place (\"Provisional\")" },
  { file: "src/components/ui/data-list.tsx", fragment: "words ??", kind: "name", what: "a tie's \"=4\" mark in words (\"Tied for 4th\")" },
  { file: "src/components/leaderboards/recent-leaderboards.tsx", fragment: "r.note", kind: "name", what: "the gap's short token (\"−1\") in words (\"1 win behind 3rd\")" },
  { file: "src/components/leaderboards/recent-leaderboards.tsx", fragment: "roleTitle", kind: "name", what: "the main role's badge: the role and its games" },
  { file: "src/components/matchup-intel/matchup-frame.tsx", fragment: "Copy link", kind: "name", what: "Copy link's name when only its icon shows" },
  { file: "src/components/players/all-champions.tsx", fragment: "in these filters", kind: "name", what: "the games' share bar, its value in words" },
  // Values shown whole where the page may cut them short.
  { file: "src/components/team/team-roster.tsx", fragment: "sg.reasons.join", kind: "truncation", what: "a suggestion's reasons, cut to one line" },
  { file: "src/components/match-history/scoreboard.tsx", fragment: "damage to champions", kind: "truncation", what: "the damage shown short (\"18.2k\") whole" },
  { file: "src/components/players/player-card.tsx", fragment: "mastery points", kind: "truncation", what: "the mastery shown short (\"189K\") whole" },
  { file: "src/components/leaderboards/records.tsx", fragment: "said(m)", kind: "truncation", what: "a milestone chip whole (its champion's name is cut, or left out on phones)" },
  { file: "src/components/match-history/match-history-view.tsx", fragment: "With team members:", kind: "truncation", what: "the members line, cut to one line" },
  { file: "src/components/match-history/rank-short.tsx", fragment: "label.title", kind: "truncation", what: "a short rank (\"G2\") whole" },
  { file: "src/components/match-history/scoreboard.tsx", fragment: "{title}", kind: "truncation", what: "a rank badge whole where it shrinks" },
  { file: "src/components/match-history/team-composition.tsx", fragment: "t.title", kind: "truncation", what: "a player's name and rank, cut short in the slot" },
  { file: "src/components/matches/played-together.tsx", fragment: "SOLO_CAVEAT", kind: "truncation", what: "the Solo/Duo sentence the narrow column shortens" },
  { file: "src/components/matches/played-together.tsx", fragment: "{extra}", kind: "truncation", what: "the CS and damage a narrow row leaves out" },
  { file: "src/components/players/all-champions.tsx", fragment: "mastery points", kind: "truncation", what: "the mastery shown short (\"189K\") whole" },
  { file: "src/components/players/rank-emblem.tsx", fragment: "rank.leaguePoints", kind: "truncation", what: "the rank, cut short in a row, whole with its LP" },
  { file: "src/components/players/recent-form.tsx", fragment: "Filtered: ${narrowed}", kind: "truncation", what: "the filters line, cut to one line" },
  { file: "src/components/resources/resources-view.tsx", fragment: "e.description", kind: "truncation", what: "a site's description, clamped to two lines" },
  { file: "src/components/app-shell.tsx", fragment: "b.teamName", kind: "truncation", what: "the team's name" },
  { file: "src/components/app-shell.tsx", fragment: "riotLegal(", kind: "truncation", what: "Riot's notice, clamped in the sidebar" },
  { file: "src/components/mobile-nav.tsx", fragment: "shortName", kind: "truncation", what: "the team's name" },
  { file: "src/components/mobile-nav.tsx", fragment: "legal.title", kind: "truncation", what: "Riot's notice, clamped" },
  { file: "src/components/account-menu.tsx", fragment: "legal.title", kind: "truncation", what: "Riot's notice, clamped" },
  { file: "src/components/ui/relative-time.tsx", fragment: "formatDateTime(at)", kind: "truncation", what: "the date and time behind \"2h ago\"" },
  { file: "src/components/match-history/encounters-view.tsx", fragment: "{name}", kind: "truncation", what: "a player's name" },
  { file: "src/components/match-history/scoreboard.tsx", fragment: "x.name", kind: "truncation", what: "a player's name" },
  { file: "src/components/match-history/match-history-view.tsx", fragment: "champion.name", kind: "truncation", what: "the champion's name" },
  { file: "src/components/match-history/match-history-view.tsx", fragment: "row.riotId", kind: "truncation", what: "the Riot ID a game was played on" },
  { file: "src/components/players/ranked-progress.tsx", fragment: "a.riotId", kind: "truncation", what: "the account's Riot ID" },
  { file: "src/components/players/ranked-progress.tsx", fragment: "{path}", kind: "truncation", what: "the climb, whole" },
  { file: "src/components/players/profile-header.tsx", fragment: "tagline", kind: "truncation", what: "the card's tagline" },
  { file: "src/components/profile/profile-editor.tsx", fragment: "c.name", kind: "truncation", what: "a champion's name" },
  // Admin Mode (S9c).
  { file: "src/components/admin/preview-studio.tsx", fragment: "preview, ${d.label}", kind: "name", what: "the preview frame's name (its page and screen size)" },
  { file: "src/components/settings/diagnostics-panel.tsx", fragment: "{e.error}", kind: "truncation", what: "a job's error, cut to one line" },
  { file: "src/components/ui/data-list.tsx", fragment: "{hint}", kind: "name", what: "a row's marks in words (its tie, gap or milestones), anywhere on the row" },
  { file: "src/components/leaderboards/leaderboards-peek.tsx", fragment: "{hint}", kind: "name", what: "a Peek row's marks in words, as RowLink's hint layer (the same row, opening the Peek)" },
];

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(path);
  }
  return out;
}

/** The element or component a `title=` at `at` belongs to: the nearest opening tag before it, outside any `{…}`. */
function tagOf(code: string, at: number): string | null {
  let depth = 0;
  for (let i = at - 1; i > 0; i--) {
    const ch = code[i];
    if (ch === "}") depth++;
    else if (ch === "{") depth = Math.max(0, depth - 1);
    else if (ch === "<" && depth === 0 && /[A-Za-z]/.test(code[i + 1] ?? "")) return /^[\w.]+/.exec(code.slice(i + 1))?.[0] ?? null;
  }
  return null;
}

/** The attribute's value as written: a "literal" or a {…} expression. */
function valueAt(code: string, start: number): string {
  if (code[start] === '"') return code.slice(start, code.indexOf('"', start + 1) + 1);
  let depth = 0;
  for (let j = start; j < code.length; j++) {
    if (code[j] === "{") depth++;
    else if (code[j] === "}" && --depth === 0) return code.slice(start, j + 1);
  }
  return code.slice(start);
}

/** A short literal name: at most four words and no sentence punctuation. */
export const shortName = (value: string) => /^"[^":.;()—]*"$/.test(value) && value.slice(1, -1).trim().split(/\s+/).length <= 4;

function nativeTitles(): Array<{ file: string; line: number; value: string }> {
  const out: Array<{ file: string; line: number; value: string }> = [];
  for (const path of sources(join(ROOT, "src"))) {
    const file = relative(ROOT, path).split("\\").join("/");
    if (OUT_OF_SCOPE.some((re) => re.test(file))) continue;
    const code = readFileSync(path, "utf8");
    for (const m of code.matchAll(/\stitle=/g)) {
      const tag = tagOf(code, m.index);
      if (!tag || !(/^[a-z]/.test(tag) || NATIVE.has(tag))) continue;
      out.push({ file, line: code.slice(0, m.index).split("\n").length, value: valueAt(code, m.index + 7).replace(/\s+/g, " ") });
    }
  }
  return out;
}

const listed = (t: { file: string; value: string }) => NAMES.find((n) => n.file === t.file && t.value.includes(n.fragment));

describe("a title names or shows whole; it never explains", () => {
  const titles = nativeTitles();

  it("finds the titles it checks", () => {
    expect(titles.length).toBeGreaterThan(60);
    expect(shortName('"Change role"')).toBe(true);
    expect(shortName('"The enemy in the same recorded position"')).toBe(false);
    expect(shortName('"Main account: shown on the profile"')).toBe(false);
  });

  it("every title is a short name, or listed with what it names or shows whole", () => {
    const unlisted = titles.filter((t) => !shortName(t.value) && !listed(t)).map((t) => `${t.file}:${t.line} ${t.value.slice(0, 120)}`);
    expect(unlisted).toEqual([]);
  });

  it("every entry still matches a title", () => {
    for (const n of NAMES) expect(titles.some((t) => t.file === n.file && t.value.includes(n.fragment)), `${n.file} ${n.fragment}: remove it`).toBe(true);
  });
});
