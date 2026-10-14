import type { Db } from "@/server/db/types";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { poolFor, poolSlotFor, roleFit, type PoolSlot, type RoleFit, type RolePool } from "@/domain/roster";
import { getPlayerOverview, type OverviewCard } from "@/server/players/overview";
import { avatarUrlsByPlayer } from "@/server/repositories/profile";
import { profileVersion } from "@/server/repositories/team";
import { seasonLabel } from "@/domain/season";
import { candidatesFor, getTeamOverview } from "./overview";
import { and, eq, isNotNull } from "drizzle-orm";
import { users } from "@/server/db/schema";
import { suggestForRole, summariseComposition, type CompositionSummary, type Suggestion } from "@/domain/team-advice";
import { getChampionMap } from "@/server/engine/service";
import { getProficiencyLookup } from "@/server/proficiency/service";
import { listChampions } from "@/server/repositories/champions";
import type { PlayerTag } from "@/domain/player-tags";
import { cardArt, featurableChampions, isCardAccent, type CardAccent, type CardArt } from "@/domain/player-card";
import { strengthTagsFor, tagInputFor } from "./tags";

export interface RosterChampion {
  championId: string;
  games: number;
  wins: number;
  losses: number;
  winRate: number | null;
  masteryPoints: number | null;
  tier: string;
  tierLabel: string;
  lastPlayedAt: string | null;
}

export interface RosterSlot {
  role: Role;
  roleLabel: string;
  player: {
    id: string;
    name: string;
    avatarUrl: string | null;
    rank: string | null;
    profileRole: RoleFit;
    substitute: boolean;
    /** Which pool the lineup role draws from (for in-place editing). */
    poolSlot: PoolSlot | null;
    profile: { primaryRole: Role; secondaryRole: Role | null; primaryPool: string[]; secondaryPool: string[]; additionalRoles: RolePool[] };
    version: string;
    seasonLabel: string;
    partial: boolean;
    primaryRole: Role;
    /** The card's artwork: the player's chosen champion and skin, else their first primary champion. */
    art: CardArt | null;
    /** Every champion in the player's pools (listed first when customising the card). */
    poolIds: string[];
    cardAccent: CardAccent;
    tags: PlayerTag[];
    /** This season in the lineup role, every champion, all supported games (null when nothing collected). */
    season: { games: number; winRate: number | null; kda: number | null } | null;
  } | null;
  champions: RosterChampion[];
  candidates: Array<{ id: string; name: string; group: "main" | "other"; fit: RoleFit }>;
  /** Empty role only: registered players who could take it, best first, with reasons (advisory). */
  suggestions: Suggestion[];
}

/**
 * The Team page's roster: each lineup slot with the player, their picture and rank, and the
 * champions they bring to that role with current-season figures (all supported game modes) from
 * stored Riot data only. Mastery is shown as points (summed over the player's accounts).
 */
export async function getTeamRoster(db: Db, teamId: string): Promise<{ slots: RosterSlot[]; complete: boolean; composition: CompositionSummary }> {
  const overview = await getTeamOverview(db, teamId);
  const riotConfigured = !!process.env.RIOT_API_KEY;
  const lineupIds = overview.rows.map((r) => r.player?.id).filter((id): id is string => !!id);
  const [avatars, seasons, lookup, championList] = await Promise.all([
    avatarUrlsByPlayer(db),
    // Each player's season in the role they hold: the card figures and the strength tags.
    Promise.all(overview.rows.map((r) => (r.player ? getPlayerOverview(db, r.player, { mode: "all", role: r.role, riotConfigured }).catch(() => null) : Promise.resolve(null)))),
    getProficiencyLookup(db, lineupIds),
    listChampions(db),
  ]);
  const championInfo = new Map(championList.map((c) => [c.id, { name: c.name, tags: c.tags }]));
  const tags = await strengthTagsFor(
    db,
    overview.rows.flatMap((r, i) => (r.player ? [{ playerId: r.player.id, build: (previous: string[]) => tagInputFor(r.player!, r.role, seasons[i] ?? null, lookup, championInfo, previous) }] : [])),
  );
  const slots = overview.rows.map((row, i): RosterSlot => {
    const season = seasons[i];
    const p = row.player;
    const candidates = candidatesFor(row.role, overview, true).map((c) => ({ id: c.id, name: c.displayName, group: c.group, fit: roleFit(c, row.role) }));
    if (!p) return { role: row.role, roleLabel: ROLE_LABELS[row.role], player: null, champions: [], candidates, suggestions: [] };
    const byChampion = new Map<string, OverviewCard>((season?.cards ?? []).filter((c) => c.role === row.role).map((c) => [c.championId, c]));
    const champions = poolFor(p, row.role).map((championId): RosterChampion => {
      const card = byChampion.get(championId);
      const ctx = row.pool.find((x) => x.championId === championId);
      return {
        championId,
        games: card?.selected.games ?? 0,
        wins: card?.selected.wins ?? 0,
        losses: card?.selected.losses ?? 0,
        winRate: card?.selected.winRate ?? null,
        masteryPoints: card?.mastery?.points ?? null,
        tier: card?.tier ?? ctx?.tier ?? "unknown",
        tierLabel: card?.tierLabel ?? ctx?.tierLabel ?? "Not played",
        lastPlayedAt: card?.selected.lastPlayedAt?.toISOString() ?? null,
      };
    });
    const poolSlot = poolSlotFor(p, row.role);
    return {
      role: row.role,
      roleLabel: ROLE_LABELS[row.role],
      player: {
        id: p.id,
        name: p.displayName,
        avatarUrl: avatars[p.id] ?? null,
        rank: season?.rank ? season.rank.text.split(" · ").slice(0, 2).join(" · ") : null,
        profileRole: row.profileRole ?? "other",
        substitute: row.substitute,
        poolSlot,
        profile: { primaryRole: p.primaryRole, secondaryRole: p.secondaryRole, primaryPool: p.primaryPool, secondaryPool: p.secondaryPool, additionalRoles: p.additionalRoles },
        version: profileVersion(p),
        seasonLabel: season ? seasonLabel(season.season) : "This season",
        partial: season ? !season.completeness.complete : true,
        primaryRole: p.primaryRole,
        art: cardArt(p),
        poolIds: featurableChampions(p),
        cardAccent: isCardAccent(p.cardAccent) ? p.cardAccent : "default",
        tags: tags.get(p.id) ?? [],
        season: season && season.summary.record.games > 0 ? { games: season.summary.record.games, winRate: season.summary.record.winRate, kda: season.summary.performance.kdaRatio } : null,
      },
      champions,
      candidates,
      suggestions: [],
    };
  });
  const profiles = await getChampionMap(db);
  const composition = summariseComposition(overview.rows.map((r) => ({ role: r.role, champions: r.player ? poolFor(r.player, r.role) : [], assigned: !!r.player })), profiles);
  const vacant = slots.filter((s) => !s.player);
  if (vacant.length > 0) {
    // Only real, registered people: players with an active sign-in account, not already in the lineup.
    const inLineup = new Set(overview.rows.map((r) => r.player?.id).filter(Boolean));
    const registered = new Set((await db.select({ playerId: users.playerId }).from(users).where(and(eq(users.isActive, true), isNotNull(users.playerId)))).map((u) => u.playerId));
    const pool = [...overview.main, ...overview.other].filter((p) => !inLineup.has(p.id) && registered.has(p.id));
    const candidateLookup = await getProficiencyLookup(db, pool.map((p) => p.id));
    for (const slot of vacant) {
      const facts = pool.map((p) => {
        const champions = poolFor(p, slot.role);
        return {
          id: p.id,
          name: p.displayName,
          primaryRole: p.primaryRole,
          secondaryRole: p.secondaryRole,
          pool: champions,
          substitute: p.group === "other",
          proficiency: champions.map((c) => candidateLookup(p.id, c, slot.role)).filter((e): e is NonNullable<typeof e> => !!e).map((e) => ({ championId: e.championId, tier: e.tier, games: e.games })),
        };
      });
      slot.suggestions = suggestForRole(slot.role, facts, composition, profiles);
    }
  }
  return { slots, complete: overview.complete, composition };
}
