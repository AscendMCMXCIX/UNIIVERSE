import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ChampionProficiencyRow, PlayerDataReport } from "@/server/proficiency/provenance";
import { PlayerDataPanel } from "./player-data-panel";

/*
  The champion data panel's figures say what the code counts (R7 review C3, C4): the recent count is
  by patch, queue and role (never "in the last 30 days" as if each game were dated), and the role
  share shows whenever any game's role is known, 0% included.
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

const render = (c: ChampionProficiencyRow[]) => renderToStaticMarkup(createElement(PlayerDataPanel, { report: report(c), championsById: {}, playerName: "Player A", showAccounts: false })).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

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
});
