import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ChampionProficiencyRow, PlayerDataReport } from "@/server/proficiency/provenance";
import { PlayerDataPanel, TierWhy } from "./player-data-panel";

/*
  The champion data panel's figures say what the code counts (R7 review C3, C4): the recent count is
  by patch, queue and role (never "in the last 30 days" as if each game were dated), and the role
  share shows whenever any game's role is known, 0% included. The phone list draws its figures
  primary, as the table's cells are (25 Nov 2026 review); the experience label's why is the shared
  breakdown, never a giant tip.
*/

const row = (over: Partial<ChampionProficiencyRow>): ChampionProficiencyRow => ({
  championId: "Riven",
  role: "TOP",
  inPool: "primary",
  tier: "regular",
  tierLabel: "Played regularly",
  score: 0.5,
  confidence: 0.5,
  confidenceWord: "medium",
  games: 20,
  recentGames: 10,
  patchGames: 4,
  roleShare: 0,
  roleGames: 0,
  knownRoleGames: 20,
  lastPlayedAt: null,
  mastery: null,
  notes: [],
  ...over,
} as ChampionProficiencyRow);

const report = (champions: ChampionProficiencyRow[]): PlayerDataReport =>
  ({ playerId: "p", accounts: [], summary: { state: "synced", label: "Up to date" }, gamesAnalysed: 20, currentPatch: "26.22", currentPatchGames: 4, championsWithData: champions.length, lastSyncAt: null, champions, hasData: true }) as unknown as PlayerDataReport;

const markup = (c: ChampionProficiencyRow[]) => renderToStaticMarkup(createElement(PlayerDataPanel, { report: report(c), championsById: {}, playerName: "Player A", showAccounts: false }));
const render = (c: ChampionProficiencyRow[]) => markup(c).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

/** Every InfoTip's text in the markup (its description, always in the page for screen readers). */
function tipTexts(html: string): string[] {
  const ids = [...html.matchAll(/aria-describedby="([^"]+)"/g)].map((m) => m[1]!);
  return ids.map((id) => {
    const at = html.indexOf(`id="${id}"`);
    const open = html.indexOf(">", at) + 1;
    // The description is a span of text (and spans): read up to its own closing tag.
    let depth = 1;
    let i = open;
    while (depth > 0 && i < html.length) {
      const next = html.indexOf("<", i);
      if (next < 0) break;
      depth += html.startsWith("</", next) ? -1 : html.startsWith("<span", next) ? 1 : 0;
      i = html.indexOf(">", next) + 1;
    }
    return html.slice(open, i).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  });
}

/** The longest note set the estimate gives a champion (domain/proficiency estimateProficiency). */
const LONGEST_NOTES = [
  "Played a lot: 95 games, played recently",
  "95 recent games (from patches played in the last 30 days)",
  "Strong personal results (58% win rate)",
  "10 of 95 games are Normal games (counted at 60% weight)",
  "Mastery combined from 2 accounts",
];

describe("the champion data panel's figures", () => {
  it("shows a 0% role share when every game with a known role was in another role", () => {
    const t = render([row({ roleShare: 0, roleGames: 0, knownRoleGames: 20 })]);
    expect(t).toContain("0% of its games with a known role in Top");
    expect(t).toMatch(/ 0% in Top /);
  });

  it("shows no share when no game's role is known", () => {
    const t = render([row({ roleShare: 1, roleGames: 0, knownRoleGames: 0 })]);
    expect(t).not.toContain("with a known role in");
    expect(t).not.toContain("100% in Top");
  });

  it("never dates the recent count to the day: it is counted by patch, queue and role", () => {
    const t = render([row({})]);
    expect(t).not.toContain("in the last 30 days");
    expect(t).toContain("10 recent");
  });

  it("draws the phone list's figures primary, each beside its label in the secondary grey (the table's cells are primary)", () => {
    const html = markup([row({ recentGames: 10, patchGames: 4, games: 20, roleShare: 0.5, roleGames: 10, mastery: { points: 333000, level: 10 } as ChampionProficiencyRow["mastery"] })]);
    const line = /data-testid="player-data-figures">(.*?)<\/div>/.exec(html)![1]!;
    const fig = (v: string) => `<span class="font-medium tabular-nums text-fg">${v}</span>`;
    expect(line).toContain(`${fig("10")} recent`);
    expect(line).toContain(`${fig("4")} this patch`);
    expect(line).toContain(`${fig("20")} on record`);
    expect(line).toContain(`${fig("333,000")} mastery · ${fig("M10")}`);
    expect(line).toContain(`${fig("50%")} of its games with a known role in Top`);
    expect(line).toContain(`${fig("medium")} confidence`);
    expect(html).toMatch(/class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-fg-muted" data-testid="player-data-figures"/);
  });

  it("lays the Riot data metrics out in as many columns as fit, never two fixed columns on a phone", () => {
    const html = markup([row({})]);
    const grid = /class="([^"]*)" data-testid="player-data-metrics"/.exec(html)![1]!;
    expect(grid).toContain("grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))]");
    expect(grid).not.toMatch(/(^|\s)grid-cols-2(\s|$)/);
  });

  it("explains the experience label in the shared breakdown, not a tip: the label opens it, and no tip in the panel runs past 25 words", () => {
    const html = markup([row({ tier: "core", tierLabel: "Played a lot", notes: LONGEST_NOTES })]);
    const tips = tipTexts(html);
    // The metrics' and the columns' ⓘ are there and read whole.
    expect(tips.length).toBeGreaterThan(5);
    expect(tips).toContain("Champions with at least one game or some mastery.");
    for (const t of tips) expect(t.split(/\s+/).length, t).toBeLessThanOrEqual(25);
    // The notes are drawn only while the breakdown is open: none of them is in the page as a tip.
    for (const n of LONGEST_NOTES) expect(html).not.toContain(n);
    const trigger = renderToStaticMarkup(createElement(TierWhy, { tier: "core", label: "Played a lot", notes: LONGEST_NOTES }));
    expect(trigger).toContain('aria-haspopup="dialog"');
    expect(trigger).toContain('aria-label="Played a lot: why"');
    expect(trigger).toContain('data-testid="tier-why"');
    expect(trigger).not.toContain("aria-describedby");
  });
});
