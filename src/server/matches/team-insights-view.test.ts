import { describe, expect, it } from "vitest";
import { teamInsights, type InsightGame, type InsightPresence } from "@/domain/team-insights";
import { TEAM_INSIGHTS_AUDIENCE, buildTeamInsightsPage, canOpenTeamInsights } from "./team-insights-view";

const NOW = Date.UTC(2026, 10, 4);
const DAY = 86_400_000;
const names = { a: "Ace", b: "Bea", c: "Cy" };

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A season where playing with teammates clearly wins more (and nobody in particular matters). */
function strongSeason() {
  const random = seeded(21);
  const games: InsightGame[] = [];
  const presences: InsightPresence[] = [];
  const members = ["a", "b", "c"];
  for (let i = 0; i < 2400; i += 1) {
    const lead = members[i % 3]!;
    const side = [lead, ...members.filter((m) => m !== lead && random() < 0.35)];
    const win = random() < (side.length > 1 ? 0.64 : 0.46);
    for (const m of side) {
      games.push({ matchId: `M${i}`, playerId: m, queueId: 400, role: ["TOP", "JUNGLE", "MID"][members.indexOf(m)]!, win, gameCreation: NOW - (i % 200) * DAY, durationS: 1800, patch: "16.20" });
      presences.push({ matchId: `M${i}`, playerId: m, teamId: 100 });
    }
  }
  return teamInsights({ games, presences, memberIds: members, season: 16, now: NOW });
}

describe("who opens Team insights", () => {
  it("is an administrators' preview until the owner activates it", () => {
    expect(TEAM_INSIGHTS_AUDIENCE).toBe("admins");
    expect(canOpenTeamInsights({ role: "owner", admin: false })).toBe(true);
    expect(canOpenTeamInsights({ role: "player", admin: true })).toBe(true);
    expect(canOpenTeamInsights({ role: "player", admin: false })).toBe(false);
    expect(canOpenTeamInsights(null)).toBe(false);
  });
});

describe("buildTeamInsightsPage", () => {
  it("says plainly that there is nothing to compare when there are no games", () => {
    const page = buildTeamInsightsPage({ insights: teamInsights({ games: [], presences: [], memberIds: ["a"], season: 16, now: NOW }), names, computedAt: NOW });
    expect(page.findings).toEqual([]);
    expect(page.nothing).toMatch(/no games to compare yet/);
    expect(page.rows).toEqual([]);
    expect(page.scope).toBe("Season 2026 · 0 games of 0 members, 0 played together");
  });

  it("says how many games are still needed when nothing could be tested", () => {
    const games: InsightGame[] = [{ matchId: "M1", playerId: "a", queueId: 400, role: "TOP", win: true, gameCreation: NOW, durationS: 1800, patch: "16.20" }];
    const page = buildTeamInsightsPage({ insights: teamInsights({ games, presences: [{ matchId: "M1", playerId: "a", teamId: 100 }], memberIds: ["a"], season: 16, now: NOW }), names, computedAt: NOW });
    expect(page.nothing).toBe("Nothing has enough games to compare yet: a comparison needs 20 games on each side.");
    expect(page.rows[0]).toMatchObject({ label: "Ace with teammates, against alone", records: "With teammates: no games · Alone: 100% of 1 game", status: "untested", result: "Needs 20 comparable games on each side (has 0)" });
  });

  it("writes findings as plain statements with their records, interval and dates", () => {
    const page = buildTeamInsightsPage({ insights: strongSeason(), names, computedAt: NOW });
    expect(page.findings.length).toBeGreaterThan(0);
    const ace = page.findings.find((f) => f.key === "with-team:a")!;
    expect(ace.headline).toBe("Ace has won more often with teammates than alone.");
    expect(ace.detail).toMatch(/^\d+% of [\d,]+ games with teammates, \d+% of [\d,]+ games alone\. Within the same game mode and role: \+\d+ points, likely between [+-]\d+ and \+\d+\.$/);
    expect(ace.span).toMatch(/^\d+ \w{3} 2026 – \d+ \w{3} 2026$/);
    expect(ace.direction).toBe("more");
    // Never causal words.
    for (const f of page.findings) expect(`${f.headline} ${f.detail}`).not.toMatch(/because|better|worse|should|predict/i);
    expect(page.nothing).toBeNull();
    // Every comparison is listed, findings first.
    expect(page.rows[0]!.status).toBe("finding");
    expect(page.rows.map((r) => r.key).sort()).toEqual(page.rows.map((r) => r.key).sort());
  });

  it("explains its method, including what it does not say", () => {
    const page = buildTeamInsightsPage({ insights: strongSeason(), names, computedAt: NOW });
    expect(page.method.join(" ")).toMatch(/do not say why/);
    expect(page.method.join(" ")).toMatch(/5% false discovery rate/);
  });

  it("names a member it does not know as 'A member', never an id", () => {
    const page = buildTeamInsightsPage({ insights: strongSeason(), names: {}, computedAt: NOW });
    for (const r of page.rows) expect(r.label).not.toMatch(/\b[abc]\b/);
  });
});
