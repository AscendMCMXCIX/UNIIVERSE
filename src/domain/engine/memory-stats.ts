import { ROLES, type Role } from "../roles";
import { shrinkRate, type ShrunkRate } from "../stats";
import type { StatsDescription, StatsProvenance, StatsProvider } from "./types";
import { summariseSlots, type ProSlotProfile, type ProSlotRecord } from "../pro";

export interface RoleStatRecord {
  championId: string;
  role: Role;
  games: number;
  wins: number;
}
export interface BanStatRecord {
  championId: string;
  bans: number;
}
export interface MatchupRecord {
  championId: string;
  role: Role;
  enemyChampionId: string;
  enemyRole: Role;
  games: number;
  wins: number;
}
export interface SynergyRecord {
  championAId: string;
  roleA: Role;
  championBId: string;
  roleB: Role;
  games: number;
  wins: number;
}
export interface ProPresenceRecord {
  championId: string;
  picks: number;
  bans: number;
}

export interface MemoryStatsData {
  patch: string | null;
  sources: Array<"ranked" | "pro" | "demo">;
  /** Total games in the period (denominator for pick/ban rates). Effective (blended) counts are fine. */
  totalGames: number;
  proGames: number;
  roleStats: RoleStatRecord[];
  bans: BanStatRecord[];
  matchups: MatchupRecord[];
  synergies: SynergyRecord[];
  pro: ProPresenceRecord[];
  /** Professional draft-slot counts (only when the provider recorded pick order). */
  proSlots?: ProSlotRecord[];
  isDemo?: boolean;
  provenance?: StatsProvenance;
}

export interface ShrinkageWeights {
  strength: number;
  matchup: number;
  synergy: number;
}

/**
 * Prior weights in pseudo-games: an estimate counts half data, half prior at this many effective
 * games. Matchups and pairings are set from the leave-one-out check in the data-sufficiency job
 * (2,228 current-patch games, patch 16.20): at 60 they lowered accuracy below champion strength
 * alone (51.1% and 48.3% against 53.0%); from about 400 (matchups) and 1000 (pairings) they stop
 * costing accuracy. Lane and pair samples are small, so they now move estimates only once a
 * combination has been seen often.
 */
export const DEFAULT_SHRINKAGE: ShrinkageWeights = { strength: 250, matchup: 400, synergy: 1000 };

/**
 * In-memory statistics provider. The server builds one of these per patch from the aggregate
 * tables (already blended across recent patches); tests and demo mode build it directly.
 */
export class MemoryStatsProvider implements StatsProvider {
  private readonly role = new Map<string, RoleStatRecord>();
  private readonly byChampionGames = new Map<string, number>();
  private readonly byChampionPicks = new Map<string, number>();
  private readonly bans = new Map<string, number>();
  private readonly matchups = new Map<string, MatchupRecord>();
  private readonly synergies = new Map<string, SynergyRecord>();
  private readonly pro = new Map<string, ProPresenceRecord>();
  private readonly topByRole = new Map<Role, string[]>();
  private readonly slotProfiles = new Map<string, ProSlotProfile | null>();

  constructor(
    private readonly data: MemoryStatsData,
    private readonly weights: ShrinkageWeights = DEFAULT_SHRINKAGE,
  ) {
    for (const r of data.roleStats) {
      this.role.set(`${r.championId}|${r.role}`, r);
      this.byChampionGames.set(r.championId, (this.byChampionGames.get(r.championId) ?? 0) + r.games);
      this.byChampionPicks.set(r.championId, (this.byChampionPicks.get(r.championId) ?? 0) + r.games);
    }
    for (const b of data.bans) this.bans.set(b.championId, b.bans);
    for (const m of data.matchups) this.matchups.set(`${m.championId}|${m.role}|${m.enemyChampionId}|${m.enemyRole}`, m);
    for (const s of data.synergies) {
      this.synergies.set(`${s.championAId}|${s.roleA}|${s.championBId}|${s.roleB}`, s);
      this.synergies.set(`${s.championBId}|${s.roleB}|${s.championAId}|${s.roleA}`, s);
    }
    for (const p of data.pro) this.pro.set(p.championId, p);
    for (const championId of new Set((data.proSlots ?? []).map((r) => r.championId))) this.slotProfiles.set(championId, summariseSlots(championId, data.proSlots ?? []));
    for (const role of ROLES) {
      const list = data.roleStats
        .filter((r) => r.role === role)
        .sort((a, b) => b.games - a.games)
        .map((r) => r.championId);
      this.topByRole.set(role, list);
    }
  }

  roleShare(championId: string, role: Role): { share: number; games: number } {
    const total = this.byChampionGames.get(championId) ?? 0;
    const r = this.role.get(`${championId}|${role}`);
    return { share: total > 0 && r ? r.games / total : 0, games: total };
  }

  strength(championId: string, role: Role): ShrunkRate {
    const r = this.role.get(`${championId}|${role}`);
    return shrinkRate({ wins: r?.wins ?? 0, games: r?.games ?? 0 }, 0.5, this.weights.strength);
  }

  presence(championId: string) {
    const games = this.byChampionPicks.get(championId) ?? 0;
    const bans = this.bans.get(championId) ?? 0;
    const total = this.data.totalGames;
    const pro = this.pro.get(championId);
    return {
      pickRate: total > 0 ? games / total : 0,
      banRate: total > 0 ? bans / total : 0,
      games,
      proPresence: pro && this.data.proGames > 0 ? (pro.picks + pro.bans) / this.data.proGames : 0,
      proGames: this.data.proGames,
    };
  }

  matchup(championId: string, role: Role, enemyChampionId: string, enemyRole: Role, prior: number): ShrunkRate {
    const m = this.matchups.get(`${championId}|${role}|${enemyChampionId}|${enemyRole}`);
    if (m) return shrinkRate({ wins: m.wins, games: m.games }, prior, this.weights.matchup);
    // Mirror record (enemy perspective) if stored the other way round.
    const mirror = this.matchups.get(`${enemyChampionId}|${enemyRole}|${championId}|${role}`);
    if (mirror) return shrinkRate({ wins: mirror.games - mirror.wins, games: mirror.games }, prior, this.weights.matchup);
    return shrinkRate({ wins: 0, games: 0 }, prior, this.weights.matchup);
  }

  synergy(championAId: string, roleA: Role, championBId: string, roleB: Role, prior: number): ShrunkRate {
    const s = this.synergies.get(`${championAId}|${roleA}|${championBId}|${roleB}`);
    return shrinkRate({ wins: s?.wins ?? 0, games: s?.games ?? 0 }, prior, this.weights.synergy);
  }

  topChampionsInRole(role: Role, limit: number): string[] {
    return (this.topByRole.get(role) ?? []).slice(0, limit);
  }

  proSlots(championId: string): ProSlotProfile | null {
    return this.slotProfiles.get(championId) ?? null;
  }

  describe(): StatsDescription {
    return { patch: this.data.patch, sources: this.data.sources, totalGames: this.data.totalGames, isDemo: this.data.isDemo ?? this.data.sources.includes("demo"), provenance: this.data.provenance };
  }
}

export const EMPTY_STATS = new MemoryStatsProvider({ patch: null, sources: [], totalGames: 0, proGames: 0, roleStats: [], bans: [], matchups: [], synergies: [], pro: [] });
