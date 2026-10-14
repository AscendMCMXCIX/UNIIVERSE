import { defineJob } from "./registry";
import { applyAction, type DraftState } from "@/domain/draft";
import { recommend, type PickRecommendation, type RecommendationResult } from "@/domain/engine";
import { legalRolesFor, poolFor } from "@/domain/roster";
import { ROLES, type Role } from "@/domain/roles";
import { getChampionMap } from "@/server/engine/service";
import { loadStatsProvider } from "@/server/stats/loader";
import { getProficiencyLookup, invalidateProficiencyCache } from "@/server/proficiency/service";
import { getActiveLineupProfiles, getOrCreateTeam } from "@/server/repositories/team";
import { listAccountsForPlayers } from "@/server/accounts/repository";

/**
 * Read-only end-to-end check that real Riot player data reaches the draft engine: for the current
 * main lineup it reports each player's strongest pool champions as the proficiency model sees them
 * (games by queue, combined mastery, tier, confidence), then runs the engine on the same first pick
 * twice, with and without that player data, and reports what changed. Players appear by lineup
 * role only; no names, Riot IDs or PUUIDs. Changes nothing.
 */
defineJob({
  key: "engine-probe",
  description: "Read-only: shows the proficiency each lineup player gets from their Riot data and whether it changes the draft engine's recommendation. Changes nothing.",
  defaultIntervalMinutes: null,
  allowConcurrent: true,
  run: async (ctx) => {
    const db = ctx.db;
    const team = await getOrCreateTeam(db);
    const lineup = await getActiveLineupProfiles(db, team.id);
    if (!lineup) return { ok: true, degraded: true, error: "The main lineup is incomplete; assign all five roles to run the probe.", summary: { lineupComplete: false } };
    invalidateProficiencyCache();
    const ids = lineup.players.map((p) => p.id);
    const [champions, stats, proficiency, accounts] = await Promise.all([getChampionMap(db), loadStatsProvider(db), getProficiencyLookup(db, ids), listAccountsForPlayers(db, ids)]);
    const roleOf = new Map(ROLES.map((r) => [lineup.assignment[r], r] as const));
    const players = lineup.players.map((p) => {
      const role = roleOf.get(p.id) as Role;
      const linked = accounts.filter((a) => a.playerId === p.id);
      const pool = legalRolesFor(p).flatMap((r) => poolFor(p, r).map((c) => ({ championId: c, role: r })));
      const estimates = pool
        .map(({ championId, role: r }) => proficiency(p.id, championId, r))
        .filter((e): e is NonNullable<typeof e> => !!e)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((e) => ({ champion: champions.get(e.championId)?.name ?? e.championId, role: e.role, tier: e.tier, score: Math.round(e.score * 100) / 100, confidence: Math.round(e.confidence * 100) / 100, games: e.games, rankedGames: e.rankedGames, normalGames: e.normalGames, masteryPoints: e.mastery?.points ?? null, masteryAccounts: e.mastery?.accounts ?? null }));
      return { lineupRole: role, linkedAccounts: linked.length, syncedAccounts: linked.filter((a) => a.syncStatus === "ok").length, hasData: proficiency.hasData(p.id), poolChampions: pool.length, strongestPoolChampions: estimates };
    });

    // The same first pick (Ranked Flex, no bans) with and without the players' Riot data.
    let state: DraftState = { side: "blue", formatId: "ranked-flex", actions: [], assignments: { ...lineup.assignment } };
    for (let i = 0; i < 10; i++) {
      const r = applyAction(state, { championId: null });
      if (r.ok) state = r.state;
    }
    const base = { players: lineup.players, draft: state, champions, stats, config: team.engineConfig as never };
    const withData = recommend({ ...base, proficiency });
    const withoutData = recommend({ ...base, proficiency: null });
    const pick = (r: RecommendationResult) => {
      const p = r.primary?.kind === "pick" ? (r.primary as PickRecommendation) : r.primary?.kind === "pair" ? r.primary.picks[0] : null;
      return p ? { champion: champions.get(p.championId)?.name ?? p.championId, role: p.role, proficiencyContribution: Math.round((p.breakdown?.proficiencyContribution ?? 0) * 10000) / 100, decidedByPlayerData: !!p.breakdown?.proficiencyDecisive } : null;
    };
    const team5 = (r: RecommendationResult) => Object.fromEntries(r.bestFit.map((m) => [m.role, champions.get(m.championId)?.name ?? m.championId]));
    const changedRoles = ROLES.filter((r) => team5(withData)[r] !== team5(withoutData)[r]);
    return {
      ok: true,
      summary: {
        statsGames: Math.round(stats.describe().totalGames),
        statsSources: stats.describe().sources,
        players,
        engine: {
          playersWithData: withData.playerData.withData.length,
          withPlayerData: { primary: pick(withData), projectedTeam: team5(withData) },
          withoutPlayerData: { primary: pick(withoutData), projectedTeam: team5(withoutData) },
          projectedRolesChangedByPlayerData: changedRoles,
          primaryChanged: JSON.stringify(pick(withData)?.champion) !== JSON.stringify(pick(withoutData)?.champion),
          computeMs: withData.computeMs,
        },
      },
    };
  },
});
