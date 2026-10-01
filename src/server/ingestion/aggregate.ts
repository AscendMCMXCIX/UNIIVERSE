import { eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { championBanStats, championMatchups, championRoleStats, championSynergies, champions, proGameBans, proGamePicks, proGames, rankedBans, rankedMatches, rankedParticipants, statPeriods } from "@/server/db/schema";
import { RIOT_POSITION_TO_ROLE, type Role } from "@/domain/roles";
import { bumpStatsVersion } from "@/server/stats/loader";

type Source = "ranked" | "pro";

interface Counter {
  games: number;
  wins: number;
}

class Accumulator {
  readonly role = new Map<string, Counter>();
  readonly bans = new Map<string, number>();
  readonly matchups = new Map<string, Counter>();
  readonly synergies = new Map<string, Counter>();
  readonly periods = new Map<string, { games: number; first: Date | null; last: Date | null }>();

  private bump(map: Map<string, Counter>, key: string, win: boolean) {
    const c = map.get(key) ?? { games: 0, wins: 0 };
    c.games += 1;
    if (win) c.wins += 1;
    map.set(key, c);
  }

  addGame(patch: string, source: Source, playedAt: Date | null, teams: Array<{ members: Array<{ championId: string; role: Role }>; win: boolean }>, bans: string[]) {
    const p = this.periods.get(`${patch}|${source}`) ?? { games: 0, first: null, last: null };
    p.games += 1;
    if (playedAt) {
      p.first = p.first && p.first < playedAt ? p.first : playedAt;
      p.last = p.last && p.last > playedAt ? p.last : playedAt;
    }
    this.periods.set(`${patch}|${source}`, p);
    for (const b of bans) this.bans.set(`${patch}|${source}|${b}`, (this.bans.get(`${patch}|${source}|${b}`) ?? 0) + 1);
    for (const team of teams) {
      for (const m of team.members) this.bump(this.role, `${patch}|${source}|${m.championId}|${m.role}`, team.win);
      // Ally pairs, canonical order.
      for (let i = 0; i < team.members.length; i++) {
        for (let j = i + 1; j < team.members.length; j++) {
          const a = team.members[i]!;
          const b = team.members[j]!;
          const [x, y] = a.championId < b.championId ? [a, b] : [b, a];
          this.bump(this.synergies, `${patch}|${source}|${x.championId}|${x.role}|${y.championId}|${y.role}`, team.win);
        }
      }
    }
    // Matchups from each champion's perspective against every enemy champion.
    if (teams.length === 2) {
      for (const [ours, theirs] of [[teams[0]!, teams[1]!], [teams[1]!, teams[0]!]] as const) {
        for (const m of ours.members) {
          for (const e of theirs.members) this.bump(this.matchups, `${patch}|${source}|${m.championId}|${m.role}|${e.championId}|${e.role}`, ours.win);
        }
      }
    }
  }

  async flush(db: Db) {
    const chunk = async <T>(rows: T[], fn: (batch: T[]) => Promise<unknown>) => {
      for (let i = 0; i < rows.length; i += 400) await fn(rows.slice(i, i + 400));
    };
    const now = new Date();
    await chunk(
      [...this.periods.entries()].map(([k, v]) => {
        const [patch, source] = k.split("|") as [string, Source];
        return { patch, source, games: v.games, firstGameAt: v.first, lastGameAt: v.last, updatedAt: now };
      }),
      (batch) =>
        db
          .insert(statPeriods)
          .values(batch)
          .onConflictDoUpdate({
            target: [statPeriods.patch, statPeriods.source],
            set: {
              games: sql`${statPeriods.games} + excluded.games`,
              firstGameAt: sql`LEAST(${statPeriods.firstGameAt}, excluded.first_game_at)`,
              lastGameAt: sql`GREATEST(${statPeriods.lastGameAt}, excluded.last_game_at)`,
              updatedAt: now,
            },
          }),
    );
    await chunk(
      [...this.role.entries()].map(([k, v]) => {
        const [patch, source, championId, role] = k.split("|") as [string, Source, string, Role];
        return { patch, source, championId, role, games: v.games, wins: v.wins, updatedAt: now };
      }),
      (batch) =>
        db
          .insert(championRoleStats)
          .values(batch)
          .onConflictDoUpdate({
            target: [championRoleStats.patch, championRoleStats.source, championRoleStats.championId, championRoleStats.role],
            set: { games: sql`${championRoleStats.games} + excluded.games`, wins: sql`${championRoleStats.wins} + excluded.wins`, updatedAt: now },
          }),
    );
    await chunk(
      [...this.bans.entries()].map(([k, bans]) => {
        const [patch, source, championId] = k.split("|") as [string, Source, string];
        return { patch, source, championId, bans, updatedAt: now };
      }),
      (batch) =>
        db
          .insert(championBanStats)
          .values(batch)
          .onConflictDoUpdate({ target: [championBanStats.patch, championBanStats.source, championBanStats.championId], set: { bans: sql`${championBanStats.bans} + excluded.bans`, updatedAt: now } }),
    );
    await chunk(
      [...this.matchups.entries()].map(([k, v]) => {
        const [patch, source, championId, role, enemyChampionId, enemyRole] = k.split("|") as [string, Source, string, Role, string, Role];
        return { patch, source, championId, role, enemyChampionId, enemyRole, games: v.games, wins: v.wins, updatedAt: now };
      }),
      (batch) =>
        db
          .insert(championMatchups)
          .values(batch)
          .onConflictDoUpdate({
            target: [championMatchups.patch, championMatchups.source, championMatchups.championId, championMatchups.role, championMatchups.enemyChampionId, championMatchups.enemyRole],
            set: { games: sql`${championMatchups.games} + excluded.games`, wins: sql`${championMatchups.wins} + excluded.wins`, updatedAt: now },
          }),
    );
    await chunk(
      [...this.synergies.entries()].map(([k, v]) => {
        const [patch, source, championAId, roleA, championBId, roleB] = k.split("|") as [string, Source, string, Role, string, Role];
        return { patch, source, championAId, roleA, championBId, roleB, games: v.games, wins: v.wins, updatedAt: now };
      }),
      (batch) =>
        db
          .insert(championSynergies)
          .values(batch)
          .onConflictDoUpdate({
            target: [championSynergies.patch, championSynergies.source, championSynergies.championAId, championSynergies.roleA, championSynergies.championBId, championSynergies.roleB],
            set: { games: sql`${championSynergies.games} + excluded.games`, wins: sql`${championSynergies.wins} + excluded.wins`, updatedAt: now },
          }),
    );
  }
}

/**
 * Folds unaggregated ranked matches into the statistics tables. Each batch is one transaction
 * that both increments the aggregates and marks the matches as aggregated, so a crash can never
 * double count and re-running is always safe.
 */
export async function aggregateRankedMatches(db: Db, options: { batchSize?: number; outOfTime?: () => boolean } = {}): Promise<{ matches: number; batches: number }> {
  const batchSize = options.batchSize ?? 300;
  const keyToId = new Map((await db.select({ key: champions.key, id: champions.id }).from(champions)).map((c) => [c.key, c.id]));
  let total = 0;
  let batches = 0;
  for (;;) {
    if (options.outOfTime?.()) break;
    const matches = await db.select().from(rankedMatches).where(isNull(rankedMatches.aggregatedAt)).limit(batchSize);
    if (matches.length === 0) break;
    const ids = matches.map((m) => m.matchId);
    const [participants, bans] = await Promise.all([
      db.select().from(rankedParticipants).where(inArray(rankedParticipants.matchId, ids)),
      db.select().from(rankedBans).where(inArray(rankedBans.matchId, ids)),
    ]);
    const byMatch = new Map<string, typeof participants>();
    for (const p of participants) byMatch.set(p.matchId, [...(byMatch.get(p.matchId) ?? []), p]);
    const bansByMatch = new Map<string, string[]>();
    for (const b of bans) {
      const id = keyToId.get(b.championKey);
      if (id) bansByMatch.set(b.matchId, [...(bansByMatch.get(b.matchId) ?? []), id]);
    }
    const acc = new Accumulator();
    for (const m of matches) {
      const ps = byMatch.get(m.matchId) ?? [];
      const teams = [...new Set(ps.map((p) => p.teamId))].map((teamId) => {
        const members = ps
          .filter((p) => p.teamId === teamId)
          .map((p) => ({ championId: p.championId ?? keyToId.get(p.championKey) ?? null, role: RIOT_POSITION_TO_ROLE[p.position] ?? null }))
          .filter((x): x is { championId: string; role: Role } => !!x.championId && !!x.role);
        return { members, win: teamId === m.winningTeamId };
      });
      // Only fully reliable matches contribute role-based statistics; bans always count.
      const reliable = teams.length === 2 && teams.every((t) => t.members.length === 5 && new Set(t.members.map((x) => x.role)).size === 5);
      acc.addGame(m.patch, "ranked", new Date(m.gameCreation), reliable ? teams : [], bansByMatch.get(m.matchId) ?? []);
    }
    await db.transaction(async (tx) => {
      await acc.flush(tx);
      await tx.update(rankedMatches).set({ aggregatedAt: new Date() }).where(inArray(rankedMatches.matchId, ids));
    });
    total += matches.length;
    batches += 1;
  }
  if (total > 0) await bumpStatsVersion(db);
  return { matches: total, batches };
}

/** Same idea for professional games. */
export async function aggregateProGames(db: Db, options: { batchSize?: number; outOfTime?: () => boolean } = {}): Promise<{ games: number }> {
  const batchSize = options.batchSize ?? 300;
  let total = 0;
  for (;;) {
    if (options.outOfTime?.()) break;
    const games = await db.select().from(proGames).where(isNull(proGames.aggregatedAt)).limit(batchSize);
    if (games.length === 0) break;
    const ids = games.map((g) => g.id);
    const [picks, bans] = await Promise.all([db.select().from(proGamePicks).where(inArray(proGamePicks.gameId, ids)), db.select().from(proGameBans).where(inArray(proGameBans.gameId, ids))]);
    const acc = new Accumulator();
    for (const g of games) {
      const gp = picks.filter((p) => p.gameId === g.id);
      const teams = (["blue", "red"] as const).map((side) => ({ members: gp.filter((p) => p.side === side).map((p) => ({ championId: p.championId, role: p.role })), win: g.winnerSide === side }));
      const reliable = g.winnerSide !== null && teams.every((t) => t.members.length === 5);
      acc.addGame(g.patch, "pro", g.playedAt, reliable ? teams : [], bans.filter((b) => b.gameId === g.id).map((b) => b.championId));
    }
    await db.transaction(async (tx) => {
      await acc.flush(tx);
      await tx.update(proGames).set({ aggregatedAt: new Date() }).where(inArray(proGames.id, ids));
    });
    total += games.length;
  }
  if (total > 0) await bumpStatsVersion(db);
  return { games: total };
}

export async function resetAggregates(db: Db, source: Source): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(championRoleStats).where(eq(championRoleStats.source, source));
    await tx.delete(championBanStats).where(eq(championBanStats.source, source));
    await tx.delete(championMatchups).where(eq(championMatchups.source, source));
    await tx.delete(championSynergies).where(eq(championSynergies.source, source));
    await tx.delete(statPeriods).where(eq(statPeriods.source, source));
    if (source === "ranked") await tx.update(rankedMatches).set({ aggregatedAt: null });
    else await tx.update(proGames).set({ aggregatedAt: null });
  });
}
