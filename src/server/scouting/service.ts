import type { Db } from "@/server/db/types";
import { comparePatches } from "@/domain/patch";
import type { Role } from "@/domain/roles";
import type { ScoutedPlayer } from "@/domain/scouting";
import { listAccountsForOpponentPlayers, loadHistoryForAccounts, loadMasteryForAccounts, type RiotAccountRecord } from "@/server/accounts/repository";
import { getOpponentTeam } from "@/server/repositories/opponents";
import { listPatchesDesc } from "@/server/repositories/champions";

export interface ScoutedTeamView {
  team: { id: string; name: string; aliases: string[]; notes: string };
  players: ScoutedPlayer[];
  accountsByPlayer: Record<string, RiotAccountRecord[]>;
}

/** Builds the domain view of a scouted opponent team from stored players, accounts and history. */
export async function loadScoutedTeam(db: Db, opponentTeamId: string): Promise<ScoutedTeamView | null> {
  const team = await getOpponentTeam(db, opponentTeamId);
  if (!team) return null;
  const accounts = await listAccountsForOpponentPlayers(db, team.players.map((p) => p.id));
  const [history, mastery, patches] = await Promise.all([loadHistoryForAccounts(db, accounts.map((a) => a.id)), loadMasteryForAccounts(db, accounts.map((a) => a.id)), listPatchesDesc(db)]);
  const accountsByPlayer: Record<string, RiotAccountRecord[]> = {};
  for (const a of accounts) if (a.opponentPlayerId) accountsByPlayer[a.opponentPlayerId] = [...(accountsByPlayer[a.opponentPlayerId] ?? []), a];
  const players: ScoutedPlayer[] = team.players.map((p) => {
    const accs = accountsByPlayer[p.id] ?? [];
    const ids = new Set(accs.map((a) => a.id));
    const best = accs.filter((a) => a.tier).sort((a, b) => (b.rankedWins ?? 0) + (b.rankedLosses ?? 0) - ((a.rankedWins ?? 0) + (a.rankedLosses ?? 0)))[0];
    return {
      id: p.id,
      label: p.label,
      likelyRole: p.likelyRole,
      altRole: p.altRole,
      identityConfidence: p.confidence,
      accountsTotal: accs.length,
      accountsResolved: accs.filter((a) => a.puuid).length,
      lastSyncAt: accs.reduce<Date | null>((m, a) => (a.lastSyncAt && (!m || a.lastSyncAt > m) ? a.lastSyncAt : m), null),
      history: history
        .filter((h) => ids.has(h.accountId))
        .map((h) => ({ championId: h.championId, role: (h.role as Role | "UNKNOWN") ?? "UNKNOWN", games: h.games, wins: h.wins, lastPlayedAt: h.lastPlayedAt, patchDistance: patches.length ? Math.max(0, patches.findIndex((x) => comparePatches(x, h.patch) <= 0)) : null })),
      mastery: mastery.filter((m) => ids.has(m.accountId)).map((m) => ({ championId: m.championId, points: m.points, level: m.level, lastPlayedAt: m.lastPlayedAt })),
      rank: best ? { tier: best.tier, division: best.division, lp: best.leaguePoints, wins: best.rankedWins, losses: best.rankedLosses } : null,
      notes: p.notes,
    };
  });
  return { team: { id: team.id, name: team.name, aliases: team.aliases, notes: team.notes }, players, accountsByPlayer };
}
