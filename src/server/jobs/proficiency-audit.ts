import { defineJob } from "./registry";
import { comparePatches } from "@/domain/patch";
import { estimateProficiency, type ChampionHistoryEvidence, type MasteryEvidence, type ProficiencyEstimate } from "@/domain/proficiency";
import { legalRolesFor, poolFor } from "@/domain/roster";
import { ROLES, type Role } from "@/domain/roles";
import { listPlayers, getOrCreateTeam } from "@/server/repositories/team";
import { listAccountsForPlayers, loadHistoryForAccounts, loadMasteryForAccounts } from "@/server/accounts/repository";
import { listPatchesDesc } from "@/server/repositories/champions";

/**
 * Read-only audit of champion proficiency on real data: for every active player and every
 * champion with games or mastery, the rating under the previous model (revision 1) and the
 * current one (revision 2), in every role the player has games in or a pool for, with the evidence
 * behind it and flags for the cases worth a look (big mastery without recent games, small samples
 * with high win rates, old experience, one champion in several roles, mostly Normal games).
 * Players appear as P1, P2… only: no names, Riot IDs or PUUIDs. Changes nothing.
 */
defineJob({
  key: "proficiency-audit",
  description: "Read-only: champion proficiency on real data under the previous and the current model, with the evidence and flagged edge cases. Changes nothing.",
  defaultIntervalMinutes: null,
  allowConcurrent: true,
  run: async (ctx) => {
    const db = ctx.db;
    const now = new Date();
    const team = await getOrCreateTeam(db);
    const players = (await listPlayers(db, team.id)).filter((p) => !p.archivedAt);
    const accounts = await listAccountsForPlayers(db, players.map((p) => p.id));
    const ids = accounts.map((a) => a.id);
    const [history, mastery, patches] = await Promise.all([loadHistoryForAccounts(db, ids), loadMasteryForAccounts(db, ids), listPatchesDesc(db)]);
    const ownerOf = new Map(accounts.map((a) => [a.id, a.playerId!]));

    const rowsBy = new Map<string, ChampionHistoryEvidence[]>();
    const totals = new Map<string, { wins: number; games: number }>();
    for (const h of history) {
      const owner = ownerOf.get(h.accountId);
      if (!owner) continue;
      const distance = patches.length ? Math.max(0, patches.findIndex((p) => comparePatches(p, h.patch) <= 0)) : null;
      rowsBy.set(owner, [...(rowsBy.get(owner) ?? []), { championId: h.championId, role: (h.role as Role | "UNKNOWN") ?? "UNKNOWN", games: h.games, wins: h.wins, lastPlayedAt: h.lastPlayedAt, patchDistance: distance, queueGroup: h.queueGroup }]);
      if (h.queueGroup === "normal") continue;
      const t = totals.get(owner) ?? { wins: 0, games: 0 };
      t.wins += h.wins;
      t.games += h.games;
      totals.set(owner, t);
    }
    const masteryBy = new Map<string, Map<string, MasteryEvidence>>();
    for (const m of mastery) {
      const owner = ownerOf.get(m.accountId);
      if (!owner) continue;
      const map = masteryBy.get(owner) ?? new Map<string, MasteryEvidence>();
      const prev = map.get(m.championId);
      map.set(m.championId, prev ? { championId: m.championId, points: prev.points + m.points, level: Math.max(prev.level, m.level), lastPlayedAt: !prev.lastPlayedAt || (m.lastPlayedAt && m.lastPlayedAt > prev.lastPlayedAt) ? m.lastPlayedAt : prev.lastPlayedAt, accounts: (prev.accounts ?? 1) + 1 } : { championId: m.championId, points: m.points, level: m.level, lastPlayedAt: m.lastPlayedAt, accounts: 1 });
      masteryBy.set(owner, map);
    }

    const r2 = (n: number) => Math.round(n * 100) / 100;
    const days = (d: Date | null) => (d ? Math.round((now.getTime() - d.getTime()) / 86_400_000) : null);
    const transitions = new Map<string, number>();
    const examples: Array<Record<string, unknown> & { interest: number }> = [];
    let evaluated = 0;
    let scoreChanged = 0;
    players.forEach((p, i) => {
      const rows = rowsBy.get(p.id) ?? [];
      const m = masteryBy.get(p.id) ?? new Map<string, MasteryEvidence>();
      const baseline = totals.get(p.id);
      const options = { now, playerBaselineWinRate: baseline && baseline.games > 0 ? baseline.wins / baseline.games : 0.5 };
      const champions = new Set([...rows.map((r) => r.championId), ...m.keys()]);
      for (const championId of champions) {
        const own = rows.filter((r) => r.championId === championId);
        const rolesPlayed = new Set(own.map((r) => r.role).filter((r): r is Role => r !== "UNKNOWN"));
        const poolRoles = legalRolesFor(p).filter((role) => poolFor(p, role).includes(championId));
        const roles = ROLES.filter((r) => rolesPlayed.has(r) || poolRoles.includes(r));
        if (roles.length === 0) roles.push(p.primaryRole ?? "TOP");
        for (const role of roles) {
          const before: ProficiencyEstimate = estimateProficiency(championId, role, rows, m.get(championId) ?? null, { ...options, config: { revision: 1 } });
          const after: ProficiencyEstimate = estimateProficiency(championId, role, rows, m.get(championId) ?? null, options);
          evaluated += 1;
          if (Math.abs(after.score - before.score) >= 0.02) scoreChanged += 1;
          const t = `${before.tier}→${after.tier}`;
          transitions.set(t, (transitions.get(t) ?? 0) + 1);
          const games = own.reduce((s, r) => s + r.games, 0);
          const wins = own.reduce((s, r) => s + r.wins, 0);
          const lastGame = own.reduce<Date | null>((x, r) => (r.lastPlayedAt && (!x || r.lastPlayedAt > x) ? r.lastPlayedAt : x), null);
          const mp = m.get(championId)?.points ?? 0;
          const flags = [
            mp >= 100_000 && after.recentGames === 0 ? "high mastery, no recent games" : null,
            games >= 30 && games > 0 && Math.abs(wins / games - 0.5) < 0.04 ? "many games, average results" : null,
            games > 0 && games <= 5 && wins / games >= 0.8 ? "small sample, high win rate" : null,
            games >= 20 && (days(lastGame) ?? 0) > 90 ? "old experience" : null,
            rolesPlayed.size >= 2 ? `played in ${rolesPlayed.size} roles` : null,
            games >= 10 && after.normalGames / games >= 0.6 ? "mostly Normal games" : null,
            !poolRoles.includes(role) ? "not in this role's pool" : null,
          ].filter((f): f is string => !!f);
          const changed = before.tier !== after.tier;
          examples.push({
            player: `P${i + 1}`,
            champion: championId,
            role,
            inPool: poolRoles.includes(role),
            before: `${before.tier} ${r2(before.score)}`,
            after: `${after.tier} ${r2(after.score)}`,
            confidence: r2(after.confidence),
            games,
            roleGames: after.roleGames,
            recent30d: after.recentGames,
            normal: after.normalGames,
            winRate: games ? r2(wins / games) : null,
            masteryPoints: mp,
            daysSinceGame: days(lastGame),
            daysSinceMastery: days(m.get(championId)?.lastPlayedAt ?? null),
            flags,
            interest: (changed ? 10 : 0) + flags.length * 2 + (poolRoles.includes(role) ? 1 : 0) + Math.min(3, games / 50),
          });
        }
      }
    });
    examples.sort((a, b) => b.interest - a.interest);
    const flagged = (flag: string) => examples.filter((e) => (e.flags as string[]).some((f) => f.startsWith(flag))).slice(0, 4).map(({ interest: _i, ...e }) => e);
    return {
      ok: true,
      summary: {
        players: players.length,
        playersWithData: players.filter((p) => rowsBy.has(p.id) || masteryBy.has(p.id)).length,
        evaluated,
        tierChanged: examples.filter((e) => String(e.before).split(" ")[0] !== String(e.after).split(" ")[0]).length,
        scoreChangedBy2Points: scoreChanged,
        transitions: Object.fromEntries([...transitions.entries()].sort((a, b) => b[1] - a[1])),
        changedExamples: examples.filter((e) => String(e.before).split(" ")[0] !== String(e.after).split(" ")[0]).slice(0, 25).map(({ interest: _i, ...e }) => e),
        byCase: {
          highMasteryNoRecent: flagged("high mastery"),
          manyGamesAverage: flagged("many games"),
          smallSampleHighWinRate: flagged("small sample"),
          oldExperience: flagged("old experience"),
          multipleRoles: flagged("played in"),
          mostlyNormal: flagged("mostly Normal"),
        },
      },
    };
  },
});
