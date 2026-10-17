import { defineJob } from "./registry";
import { applyAction, type DraftState } from "@/domain/draft";
import { recommend, type PickRecommendation, type RecommendationResult } from "@/domain/engine";
import { legalRolesFor, poolFor, type PlayerProfile } from "@/domain/roster";
import { ROLES, type Role } from "@/domain/roles";
import { getChampionMap } from "@/server/engine/service";
import { loadStatsProvider } from "@/server/stats/loader";
import { getProficiencyLookup, invalidateProficiencyCache } from "@/server/proficiency/service";
import { getCurrentLineup, getOrCreateTeam, listRolePlayers, type PlayerRecord } from "@/server/repositories/team";
import { listAccountsForPlayers } from "@/server/accounts/repository";

/**
 * Read-only end-to-end check that real Riot player data reaches the draft engine: for the current
 * main lineup it reports each player's strongest pool champions as the proficiency model sees them
 * (games by queue, combined mastery, tier, confidence), then runs the engine on the same first pick
 * twice, with and without that player data, and reports what changed. Roles the main lineup
 * leaves empty are filled, for the probe only, by other active players who can play them (players
 * with synced Riot accounts first); the lineup itself is not touched. Players appear by role only;
 * no names, Riot IDs or PUUIDs.
 */
defineJob({
  key: "engine-probe",
  description: "Read-only: shows the proficiency each lineup player gets from their Riot data and whether it changes the draft engine's recommendation. Changes nothing.",
  defaultIntervalMinutes: null,
  allowConcurrent: true,
  run: async (ctx) => {
    const db = ctx.db;
    const team = await getOrCreateTeam(db);
    const [champions, stats] = await Promise.all([getChampionMap(db), loadStatsProvider(db)]);
    // A placeholder's pool: the role's most-played champions that genuinely belong in the role.
    const roleChampions = (role: Role) => stats.topChampionsInRole(role, 60).filter((c) => (champions.get(c)?.profile.rolePrior[role] ?? 0) >= 0.3).slice(0, 5);
    const lineup = await probeLineup(db, team.id, roleChampions);
    invalidateProficiencyCache();
    // Placeholder ids are not database ids: only real players are looked up.
    const ids = lineup.players.filter((p) => !p.id.startsWith("placeholder-")).map((p) => p.id);
    const [proficiency, accounts] = await Promise.all([getProficiencyLookup(db, ids), listAccountsForPlayers(db, ids)]);
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
      if (lineup.placeholders.includes(role)) return { lineupRole: role, source: "placeholder (no active player covers this role; most-played champions in the role)", poolChampions: legalRolesFor(p).flatMap((r) => poolFor(p, r)).map((c) => champions.get(c)?.name ?? c) };
      return { lineupRole: role, source: lineup.fromLineup.includes(role) ? "main lineup" : "other active player", linkedAccounts: linked.length, syncedAccounts: linked.filter((a) => a.syncStatus === "ok").length, hasData: proficiency.hasData(p.id), poolChampions: pool.length, strongestPoolChampions: estimates };
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
        roleCoverage: lineup.coverage,
        placeholderRoles: lineup.placeholders,
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

/**
 * The main lineup, with empty roles filled by other active players who can play them (synced Riot
 * data first). A role nobody active can play gets a clearly labelled placeholder (no Riot data,
 * the role's most-played champions as its pool) so the engine still runs for the real players.
 */
export async function probeLineup(db: Parameters<typeof getCurrentLineup>[0], teamId: string, topChampions: (role: Role) => string[]) {
  const [current, all] = await Promise.all([getCurrentLineup(db, teamId), listRolePlayers(db, teamId)]);
  const active = all.filter((p) => !p.archivedAt);
  const accounts = await listAccountsForPlayers(db, active.map((p) => p.id));
  const synced = new Set(accounts.filter((a) => a.syncStatus === "ok").map((a) => a.playerId));
  const assignment: Partial<Record<Role, string>> = {};
  const fromLineup: Role[] = [];
  for (const r of ROLES) {
    const id = current.slots[r];
    if (id && active.some((p) => p.id === id)) {
      assignment[r] = id;
      fromLineup.push(r);
    }
  }
  // Primary-role players before secondary-role ones; synced Riot data before none.
  const rank = (p: PlayerRecord, r: Role) => (p.primaryRole === r ? 0 : 2) + (synced.has(p.id) ? 0 : 1);
  for (const r of ROLES) {
    if (assignment[r]) continue;
    const taken = new Set(Object.values(assignment));
    const pick = active.filter((p) => !taken.has(p.id) && legalRolesFor(p).includes(r)).sort((a, b) => rank(a, r) - rank(b, r))[0];
    if (pick) assignment[r] = pick.id;
  }
  const players: Array<PlayerRecord & PlayerProfile> = [];
  const placeholders: Role[] = [];
  const byId = new Map(active.map((p) => [p.id, p]));
  for (const r of ROLES) {
    const real = assignment[r] ? byId.get(assignment[r]!) : undefined;
    if (real) {
      players.push(real);
      continue;
    }
    const id = `placeholder-${r.toLowerCase()}`;
    placeholders.push(r);
    assignment[r] = id;
    const now = new Date();
    players.push({ id, displayName: `Placeholder ${r}`, group: "main", setupPending: false, primaryRole: r, secondaryRole: null, primaryPool: topChampions(r), secondaryPool: [], additionalRoles: [], featuredChampionId: null, featuredSkinNum: null, cardAccent: null, cardStyle: null, cardBannerVersion: null, riotId: null, notes: "", archivedAt: null, sortOrder: 99, createdAt: now, updatedAt: now });
  }
  // How many active players list each role (primary / secondary), to explain any placeholder.
  const coverage = Object.fromEntries(ROLES.map((r) => [r, { primary: active.filter((p) => p.primaryRole === r).length, secondary: active.filter((p) => p.secondaryRole === r).length }]));
  return { players, assignment: assignment as Record<Role, string>, fromLineup, placeholders, coverage };
}
