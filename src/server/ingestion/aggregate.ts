import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { championBanStats, championMatchups, championRoleStats, championSynergies, champions, proGameBans, proGamePicks, proGames, proPickSlotStats, rankedBans, rankedMatches, rankedParticipants, statPeriods, statRankPeriods, statRegionPeriods } from "@/server/db/schema";
import { RIOT_POSITION_TO_ROLE, type Role } from "@/domain/roles";
import { banSlotFor, draftSlotFor, type DraftSlot } from "@/domain/pro";
import { parseTiers, tierBandFor, tierPopulationLabel as populationLabel } from "@/domain/stats/tiers";
import { bumpStatsVersion } from "@/server/stats/loader";

type Source = "ranked" | "pro";

/** Ladder population the ranked sample comes from, from RIOT_TIERS (default Emerald and above). */
export function tierPopulationLabel(env: NodeJS.ProcessEnv = process.env): string {
  return populationLabel(parseTiers(env.RIOT_TIERS));
}

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
  /** Provenance: games per (patch, source, platform) with queue and ladder population. */
  readonly regionPeriods = new Map<string, { games: number; first: Date | null; last: Date | null; queueId: number; tierPopulation: string }>();
  /** Provenance: games per (patch, source, ladder band). */
  readonly rankPeriods = new Map<string, { games: number; first: Date | null; last: Date | null }>();
  /** Professional draft slots: patch|championId|slot → games/wins (+ most common role). */
  readonly slots = new Map<string, Counter & { roles: Map<Role, number> }>();

  private bump(map: Map<string, Counter>, key: string, win: boolean) {
    const c = map.get(key) ?? { games: 0, wins: 0 };
    c.games += 1;
    if (win) c.wins += 1;
    map.set(key, c);
  }

  addGame(patch: string, source: Source, playedAt: Date | null, teams: Array<{ members: Array<{ championId: string; role: Role }>; win: boolean }>, bans: string[], origin: { platform: string; queueId: number; tierPopulation: string; tierBand?: string | null } = { platform: source === "pro" ? "pro" : "unknown", queueId: source === "pro" ? 0 : 420, tierPopulation: source === "pro" ? "PRO" : "MASTER+" }) {
    const band = source === "pro" ? "PRO" : tierBandFor(origin.tierBand);
    const p = this.periods.get(`${patch}|${source}`) ?? { games: 0, first: null, last: null };
    p.games += 1;
    if (playedAt) {
      p.first = p.first && p.first < playedAt ? p.first : playedAt;
      p.last = p.last && p.last > playedAt ? p.last : playedAt;
    }
    this.periods.set(`${patch}|${source}`, p);
    const rk = `${patch}|${source}|${origin.platform}`;
    const r = this.regionPeriods.get(rk) ?? { games: 0, first: null, last: null, queueId: origin.queueId, tierPopulation: origin.tierPopulation };
    r.games += 1;
    if (playedAt) {
      r.first = r.first && r.first < playedAt ? r.first : playedAt;
      r.last = r.last && r.last > playedAt ? r.last : playedAt;
    }
    this.regionPeriods.set(rk, r);
    const bk = `${patch}|${source}|${band}`;
    const bp = this.rankPeriods.get(bk) ?? { games: 0, first: null, last: null };
    bp.games += 1;
    if (playedAt) {
      bp.first = bp.first && bp.first < playedAt ? bp.first : playedAt;
      bp.last = bp.last && bp.last > playedAt ? bp.last : playedAt;
    }
    this.rankPeriods.set(bk, bp);
    // Ban rate is "share of games where the champion was banned": both teams banning the same
    // champion (allowed in ranked) is still one game.
    for (const b of new Set(bans)) this.bans.set(`${patch}|${source}|${band}|${b}`, (this.bans.get(`${patch}|${source}|${band}|${b}`) ?? 0) + 1);
    for (const team of teams) {
      for (const m of team.members) this.bump(this.role, `${patch}|${source}|${band}|${m.championId}|${m.role}`, team.win);
      // Ally pairs, canonical order.
      for (let i = 0; i < team.members.length; i++) {
        for (let j = i + 1; j < team.members.length; j++) {
          const a = team.members[i]!;
          const b = team.members[j]!;
          const [x, y] = a.championId < b.championId ? [a, b] : [b, a];
          this.bump(this.synergies, `${patch}|${source}|${band}|${x.championId}|${x.role}|${y.championId}|${y.role}`, team.win);
        }
      }
    }
    // Matchups from each champion's perspective against every enemy champion.
    if (teams.length === 2) {
      for (const [ours, theirs] of [[teams[0]!, teams[1]!], [teams[1]!, teams[0]!]] as const) {
        for (const m of ours.members) {
          for (const e of theirs.members) this.bump(this.matchups, `${patch}|${source}|${band}|${m.championId}|${m.role}|${e.championId}|${e.role}`, ours.win);
        }
      }
    }
  }

  /** Professional draft-pattern slots (only games with known pick order contribute). */
  addProSlots(patch: string, picks: Array<{ side: "blue" | "red"; role: Role; championId: string; pickOrder: number; win: boolean }>, bans: Array<{ side: "blue" | "red"; order: number; championId: string; win: boolean }>) {
    const bump = (championId: string, slot: DraftSlot, role: Role | null, win: boolean) => {
      const key = `${patch}|${championId}|${slot}`;
      const c = this.slots.get(key) ?? { games: 0, wins: 0, roles: new Map<Role, number>() };
      c.games += 1;
      if (win) c.wins += 1;
      if (role) c.roles.set(role, (c.roles.get(role) ?? 0) + 1);
      this.slots.set(key, c);
    };
    for (const p of picks) {
      const slot = draftSlotFor(p.side, p.pickOrder);
      if (slot) bump(p.championId, slot, p.role, p.win);
    }
    for (const b of bans) {
      const slot = banSlotFor(b.order);
      if (slot) bump(b.championId, slot, null, b.win);
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
      [...this.regionPeriods.entries()].map(([k, v]) => {
        const [patch, source, platform] = k.split("|") as [string, Source, string];
        return { patch, source, platform, queueId: v.queueId, tierPopulation: v.tierPopulation, games: v.games, firstGameAt: v.first, lastGameAt: v.last, updatedAt: now };
      }),
      (batch) =>
        db
          .insert(statRegionPeriods)
          .values(batch)
          .onConflictDoUpdate({
            target: [statRegionPeriods.patch, statRegionPeriods.source, statRegionPeriods.platform],
            set: {
              games: sql`${statRegionPeriods.games} + excluded.games`,
              firstGameAt: sql`LEAST(${statRegionPeriods.firstGameAt}, excluded.first_game_at)`,
              lastGameAt: sql`GREATEST(${statRegionPeriods.lastGameAt}, excluded.last_game_at)`,
              updatedAt: now,
            },
          }),
    );
    await chunk(
      [...this.rankPeriods.entries()].map(([k, v]) => {
        const [patch, source, tierBand] = k.split("|") as [string, Source, string];
        return { patch, source, tierBand, games: v.games, firstGameAt: v.first, lastGameAt: v.last, updatedAt: now };
      }),
      (batch) =>
        db
          .insert(statRankPeriods)
          .values(batch)
          .onConflictDoUpdate({
            target: [statRankPeriods.patch, statRankPeriods.source, statRankPeriods.tierBand],
            set: {
              games: sql`${statRankPeriods.games} + excluded.games`,
              firstGameAt: sql`LEAST(${statRankPeriods.firstGameAt}, excluded.first_game_at)`,
              lastGameAt: sql`GREATEST(${statRankPeriods.lastGameAt}, excluded.last_game_at)`,
              updatedAt: now,
            },
          }),
    );
    await chunk(
      [...this.role.entries()].map(([k, v]) => {
        const [patch, source, tierBand, championId, role] = k.split("|") as [string, Source, string, string, Role];
        return { patch, source, tierBand, championId, role, games: v.games, wins: v.wins, updatedAt: now };
      }),
      (batch) =>
        db
          .insert(championRoleStats)
          .values(batch)
          .onConflictDoUpdate({
            target: [championRoleStats.patch, championRoleStats.source, championRoleStats.tierBand, championRoleStats.championId, championRoleStats.role],
            set: { games: sql`${championRoleStats.games} + excluded.games`, wins: sql`${championRoleStats.wins} + excluded.wins`, updatedAt: now },
          }),
    );
    await chunk(
      [...this.bans.entries()].map(([k, bans]) => {
        const [patch, source, tierBand, championId] = k.split("|") as [string, Source, string, string];
        return { patch, source, tierBand, championId, bans, updatedAt: now };
      }),
      (batch) =>
        db
          .insert(championBanStats)
          .values(batch)
          .onConflictDoUpdate({ target: [championBanStats.patch, championBanStats.source, championBanStats.tierBand, championBanStats.championId], set: { bans: sql`${championBanStats.bans} + excluded.bans`, updatedAt: now } }),
    );
    await chunk(
      [...this.matchups.entries()].map(([k, v]) => {
        const [patch, source, tierBand, championId, role, enemyChampionId, enemyRole] = k.split("|") as [string, Source, string, string, Role, string, Role];
        return { patch, source, tierBand, championId, role, enemyChampionId, enemyRole, games: v.games, wins: v.wins, updatedAt: now };
      }),
      (batch) =>
        db
          .insert(championMatchups)
          .values(batch)
          .onConflictDoUpdate({
            target: [championMatchups.patch, championMatchups.source, championMatchups.tierBand, championMatchups.championId, championMatchups.role, championMatchups.enemyChampionId, championMatchups.enemyRole],
            set: { games: sql`${championMatchups.games} + excluded.games`, wins: sql`${championMatchups.wins} + excluded.wins`, updatedAt: now },
          }),
    );
    await chunk(
      [...this.synergies.entries()].map(([k, v]) => {
        const [patch, source, tierBand, championAId, roleA, championBId, roleB] = k.split("|") as [string, Source, string, string, Role, string, Role];
        return { patch, source, tierBand, championAId, roleA, championBId, roleB, games: v.games, wins: v.wins, updatedAt: now };
      }),
      (batch) =>
        db
          .insert(championSynergies)
          .values(batch)
          .onConflictDoUpdate({
            target: [championSynergies.patch, championSynergies.source, championSynergies.tierBand, championSynergies.championAId, championSynergies.roleA, championSynergies.championBId, championSynergies.roleB],
            set: { games: sql`${championSynergies.games} + excluded.games`, wins: sql`${championSynergies.wins} + excluded.wins`, updatedAt: now },
          }),
    );
    await chunk(
      [...this.slots.entries()].map(([k, v]) => {
        const [patch, championId, slot] = k.split("|") as [string, string, string];
        const role = [...v.roles.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        return { patch, championId, slot, role, games: v.games, wins: v.wins, updatedAt: now };
      }),
      (batch) =>
        db
          .insert(proPickSlotStats)
          .values(batch)
          .onConflictDoUpdate({
            target: [proPickSlotStats.patch, proPickSlotStats.championId, proPickSlotStats.slot],
            set: { games: sql`${proPickSlotStats.games} + excluded.games`, wins: sql`${proPickSlotStats.wins} + excluded.wins`, role: sql`COALESCE(excluded.role, ${proPickSlotStats.role})`, updatedAt: now },
          }),
    );
  }
}

/**
 * Recent matches with a champion the static data does not know yet (a release played before the
 * next static sync) wait this long for the champion list to catch up instead of being folded in
 * without their role statistics. After that they are folded in as they are.
 */
export const UNKNOWN_CHAMPION_GRACE_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_DEFERRED_PER_RUN = 3000;

/**
 * Folds unaggregated ranked matches into the statistics tables. Each batch is one transaction
 * that claims its matches (only those still unaggregated, so two runs can never fold the same
 * match twice) and increments the aggregates; a crash rolls both back, so re-running is always
 * safe.
 */
export async function aggregateRankedMatches(db: Db, options: { batchSize?: number; outOfTime?: () => boolean; now?: number } = {}): Promise<{ matches: number; batches: number; deferred: number }> {
  const batchSize = options.batchSize ?? 300;
  const now = options.now ?? Date.now();
  const keyToId = new Map((await db.select({ key: champions.key, id: champions.id }).from(champions)).map((c) => [c.key, c.id]));
  let total = 0;
  let batches = 0;
  const deferred = new Set<string>();
  for (;;) {
    // A long run of deferred matches (a new champion before the static sync) waits for the next
    // run rather than growing the exclusion list without bound.
    if (options.outOfTime?.() || deferred.size >= MAX_DEFERRED_PER_RUN) break;
    const waiting = isNull(rankedMatches.aggregatedAt);
    const matches = await db
      .select()
      .from(rankedMatches)
      .where(deferred.size ? and(waiting, notInArray(rankedMatches.matchId, [...deferred])) : waiting)
      .limit(batchSize);
    if (matches.length === 0) break;
    const ids = matches.map((m) => m.matchId);
    const [participants, bans] = await Promise.all([
      db.select().from(rankedParticipants).where(inArray(rankedParticipants.matchId, ids)),
      db.select().from(rankedBans).where(inArray(rankedBans.matchId, ids)),
    ]);
    const byMatch = new Map<string, typeof participants>();
    for (const p of participants) byMatch.set(p.matchId, [...(byMatch.get(p.matchId) ?? []), p]);
    const bansByMatch = new Map<string, string[]>();
    const unknownBan = new Set<string>();
    for (const b of bans) {
      const id = keyToId.get(b.championKey);
      if (id) bansByMatch.set(b.matchId, [...(bansByMatch.get(b.matchId) ?? []), id]);
      else if (b.championKey > 0) unknownBan.add(b.matchId);
    }
    const ready = matches.filter((m) => {
      const unknown = unknownBan.has(m.matchId) || (byMatch.get(m.matchId) ?? []).some((p) => !p.championId && !keyToId.get(p.championKey));
      if (unknown && now - Number(m.gameCreation) < UNKNOWN_CHAMPION_GRACE_MS) {
        deferred.add(m.matchId);
        return false;
      }
      return true;
    });
    if (ready.length === 0) continue;
    const claimedCount = await db.transaction(async (tx) => {
      const claimed = await tx
        .update(rankedMatches)
        .set({ aggregatedAt: new Date() })
        .where(and(inArray(rankedMatches.matchId, ready.map((m) => m.matchId)), isNull(rankedMatches.aggregatedAt)))
        .returning({ id: rankedMatches.matchId });
      const mine = new Set(claimed.map((c) => c.id));
      const acc = new Accumulator();
      for (const m of ready) {
        if (!mine.has(m.matchId)) continue;
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
        acc.addGame(m.patch, "ranked", new Date(m.gameCreation), reliable ? teams : [], bansByMatch.get(m.matchId) ?? [], { platform: m.platform, queueId: m.queueId, tierPopulation: tierPopulationLabel(), tierBand: m.tierBand });
      }
      await acc.flush(tx);
      return mine.size;
    });
    total += claimedCount;
    batches += 1;
  }
  if (total > 0) await bumpStatsVersion(db);
  return { matches: total, batches, deferred: deferred.size };
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
      const gb = bans.filter((b) => b.gameId === g.id);
      acc.addGame(g.patch, "pro", g.playedAt, reliable ? teams : [], gb.map((b) => b.championId));
      if (reliable && gp.every((p) => p.pickOrder > 0)) {
        acc.addProSlots(
          g.patch,
          gp.map((p) => ({ side: p.side, role: p.role, championId: p.championId, pickOrder: p.pickOrder, win: g.winnerSide === p.side })),
          gb.map((b) => ({ side: b.side, order: b.banOrder, championId: b.championId, win: g.winnerSide === b.side })),
        );
      }
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
    await tx.delete(statRegionPeriods).where(eq(statRegionPeriods.source, source));
    await tx.delete(statRankPeriods).where(eq(statRankPeriods.source, source));
    if (source === "ranked") await tx.update(rankedMatches).set({ aggregatedAt: null });
    else {
      await tx.delete(proPickSlotStats);
      await tx.update(proGames).set({ aggregatedAt: null });
    }
  });
}
