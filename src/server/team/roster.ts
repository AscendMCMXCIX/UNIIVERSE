import type { Db } from "@/server/db/types";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { hasPrimaryRole, poolFor, poolSlotFor, roleFit, substitutesFor, type PlayerProfile, type PoolSlot, type RoleFit, type RolePool } from "@/domain/roster";
import { getPlayerOverview, type OverviewCard, type PlayerOverviewData } from "@/server/players/overview";
import type { PlayerRecord } from "@/server/repositories/team";
import { avatarUrlsByPlayer, loadSocialLinks } from "@/server/repositories/profile";
import { profileVersion } from "@/server/repositories/team";
import { seasonLabel } from "@/domain/season";
import { candidatesFor, getTeamOverview, type PoolChampionContext } from "./overview";
import { and, eq, isNotNull } from "drizzle-orm";
import { users } from "@/server/db/schema";
import { suggestForRole, summariseComposition, type CompositionSummary, type Suggestion } from "@/domain/team-advice";
import { getChampionMap } from "@/server/champions/map";
import { getProficiencyLookup } from "@/server/proficiency/service";
import { TIER_LABELS } from "@/domain/proficiency";
import type { CompactRank } from "@/components/players/rank-emblem";
import { cardArt, featurableChampions, isCardAccent, type CardAccent, type CardArt } from "@/domain/player-card";
import { cardLookFor, type CardLook } from "@/domain/card-style";
import { visibleSocialLinks, type SocialLinks, type SocialLinkView } from "@/domain/social-links";
import { rankChangesFor, type RankChange } from "@/server/accounts/rank-history";
import { canViewPlayerStats, type Session } from "@/server/auth/permissions";

export interface RosterChampion {
  championId: string;
  games: number;
  wins: number;
  losses: number;
  winRate: number | null;
  /** (Kills + assists) ÷ deaths over these games; null without detailed records. */
  kdaRatio: number | null;
  perfectKda: boolean;
  /** Total CS ÷ total minutes of these games (remakes left out); null when no game has both. */
  csPerMinute: number | null;
  /** Average vision score per game (not per minute) over these games; null when none recorded it. */
  visionPerGame: number | null;
  masteryPoints: number | null;
  tier: string;
  tierLabel: string;
  tierWhy: string;
  evidence: "high" | "medium" | "low" | "none";
  lastPlayedAt: string | null;
}

/** A player as a full Team card in one role: the starter, or the role's designated substitute (the back of the card). */
export interface RosterSubstitute {
  player: RosterCardPlayer;
  /** Their pool for the lineup role, with figures in that role (none when statistics are hidden). */
  champions: RosterChampion[];
}

export type RosterCardPlayer = NonNullable<RosterSlot["player"]>;

type SeasonSummary = Pick<PlayerOverviewData["summary"], "record" | "performance">;

export interface RosterSlot {
  role: Role;
  roleLabel: string;
  player: {
    id: string;
    name: string;
    avatarUrl: string | null;
    rank: CompactRank | null;
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
    /** The player's personal card look (Player Card Studio), the same on every card. */
    look: CardLook;
    /** The YouTube, Twitch and Discord the player switched on to Show publicly (domain/social-links): team members see the same ones as the public page. */
    social: SocialLinkView[];
    /** This season in the lineup role, every champion, all supported games (null when nothing collected). */
    season: { games: number; wins: number; losses: number; winRate: number | null; kda: number | null; perfectKda: boolean; kills: number | null; deaths: number | null; assists: number | null; csPerMinute: number | null; visionPerGame: number | null; damagePerMinute: number | null } | null;
    /** Ladder change over 30 days in the rank's queue (only for viewers who may see the player's statistics). */
    rankChange: RankChange | null;
    /**
     * False when this viewer may not see this player's statistics (no "view teammates' statistics"
     * and not their own card): rank, season, per-champion figures and proficiency are then left out
     * here, on the server, and the card shows identity, role and pool only.
     */
    statsVisible: boolean;
  } | null;
  champions: RosterChampion[];
  candidates: Array<{ id: string; name: string; avatarUrl: string | null; group: "main" | "other"; fit: RoleFit; setupPending: boolean }>;
  /** Members shown in the picker but not assignable: no role chosen yet (nothing is assumed for them). */
  waiting: Array<{ id: string; name: string }>;
  /** Empty role only: registered players who could take it, best first, with reasons (advisory). */
  suggestions: Suggestion[];
  /**
   * The role's designated substitute (one per role, chosen in Edit lineup) as a full card, so
   * turning the Team card over needs no request; null when none is assigned or the one assigned
   * can no longer take the role (left the team, archived, became a starter, dropped the role).
   */
  substitute: RosterSubstitute | null;
  /** Who could be the substitute (bench members who list the role, best fit first), for Edit lineup. */
  substituteCandidates: Array<{ id: string; name: string; avatarUrl: string | null; fit: RoleFit }>;
  /** Public pages only: the role is held by a member whose profile is not public (no identity given). */
  privateMember?: boolean;
}

/**
 * The Team page's roster: each lineup slot with the player, their picture and rank, and every
 * champion of their pool for the role they hold in the lineup, with current-season figures in that
 * role (all supported game modes) from stored Riot data only: games, record, proficiency and
 * mastery points (summed over the player's accounts).
 *
 * `statsFor` says whose statistics the viewer may see (default: everyone, for jobs and probes).
 * For anyone else nothing numerical is loaded or returned: no rank, season, champion figures,
 * proficiency, mastery or rank change, and vacant-role suggestions do not cite their games.
 */
export async function getTeamRoster(db: Db, teamId: string, options: { statsFor?: (playerId: string) => boolean } = {}): Promise<{ slots: RosterSlot[]; complete: boolean; composition: CompositionSummary }> {
  const statsFor = options.statsFor ?? (() => true);
  const overview = await getTeamOverview(db, teamId);
  const riotConfigured = !!process.env.RIOT_API_KEY;
  // The designated substitute for each role, kept only while they can still take it (a bench member who lists the role).
  const members = [...overview.main, ...overview.other].filter(hasPrimaryRole);
  const inLineup = new Set(overview.rows.flatMap((r) => (r.player ? [r.player.id] : [])));
  const bench = new Map(overview.rows.map((r) => [r.role, substitutesFor(r.role, members, inLineup)]));
  const designated = new Map(overview.rows.flatMap((r) => {
    const sub = (bench.get(r.role) ?? []).find((m) => m.id === overview.substitutes[r.role]);
    return sub ? [[r.role, sub] as const] : [];
  }));
  // The roles each designated substitute covers: one season load per player, whatever the number of roles.
  const benchRoles = new Map<string, { player: (typeof members)[number]; roles: Role[] }>();
  for (const [role, sub] of designated) benchRoles.set(sub.id, { player: sub, roles: [...(benchRoles.get(sub.id)?.roles ?? []), role] });
  const [avatars, social, seasons, benchSeasons] = await Promise.all([
    avatarUrlsByPlayer(db),
    // Read here and filtered on the server (rosterCard): a card carries only the links shown to team members.
    loadSocialLinks(db, [...overview.rows.flatMap((r) => (r.player ? [r.player.id] : [])), ...[...designated.values()].map((m) => m.id)]),
    // Each player's season in the role they hold in the lineup (not their profile role); not loaded at all for hidden statistics.
    Promise.all(overview.rows.map((r) => (r.player && statsFor(r.player.id) ? getPlayerOverview(db, r.player, { mode: "all", role: r.role, riotConfigured }).catch(() => null) : Promise.resolve(null)))),
    // A substitute's season in each role they cover, from one load of their games (same rule).
    Promise.all([...benchRoles.values()].map(async ({ player, roles }) => [player.id, statsFor(player.id) ? await getPlayerOverview(db, player, { mode: "all", riotConfigured, roleSummaries: roles }).catch(() => null) : null] as const)).then((e) => new Map(e)),
  ]);
  // Rank history is part of a player's statistics: only for the players this viewer may see it for.
  const wanted = [
    ...overview.rows.flatMap((r, i) => (r.player && statsFor(r.player.id) ? [{ id: r.player.id, queue: seasons[i]?.rank?.queue ?? null }] : [])),
    ...[...benchSeasons].flatMap(([id, season]) => (season ? [{ id, queue: season.rank?.queue ?? null }] : [])),
  ];
  const rankChanges = await rankChangesFor(db, wanted);
  const card = (p: PlayerRecord & PlayerProfile, role: Role, season: PlayerOverviewData | null, summary: SeasonSummary | null | undefined, pool: PoolChampionContext[] = []) =>
    rosterCard(p, role, { season, summary: summary ?? null, avatarUrl: avatars[p.id] ?? null, rankChange: rankChanges.get(p.id) ?? null, statsVisible: statsFor(p.id), pool, social: social.get(p.id) ?? null });
  // Members without a chosen role: listed in every slot's picker, never assignable.
  const waiting = [...overview.main, ...overview.other].filter((m) => !m.primaryRole).map((m) => ({ id: m.id, name: m.displayName }));
  const slots = overview.rows.map((row, i): RosterSlot => {
    const season = seasons[i];
    const p = row.player;
    const candidates = candidatesFor(row.role, overview, true).map((c) => ({ id: c.id, name: c.displayName, avatarUrl: avatars[c.id] ?? null, group: c.group, fit: roleFit(c, row.role), setupPending: c.setupPending }));
    const substituteCandidates = (bench.get(row.role) ?? []).map((m) => ({ id: m.id, name: m.displayName, avatarUrl: avatars[m.id] ?? null, fit: roleFit(m, row.role) }));
    const sub = designated.get(row.role);
    const subSeason = sub ? (benchSeasons.get(sub.id) ?? null) : null;
    const substitute = sub ? card(sub, row.role, subSeason, subSeason?.roleSummaries[row.role]) : null;
    if (!p) return { role: row.role, roleLabel: ROLE_LABELS[row.role], player: null, champions: [], candidates, waiting, suggestions: [], substitute, substituteCandidates };
    const starter = card(p, row.role, season ?? null, season?.summary, row.pool);
    return { role: row.role, roleLabel: ROLE_LABELS[row.role], player: starter.player, champions: starter.champions, candidates, waiting, suggestions: [], substitute, substituteCandidates };
  });
  const profiles = await getChampionMap(db);
  const composition = summariseComposition(overview.rows.map((r) => ({ role: r.role, champions: r.player ? poolFor(r.player, r.role) : [], assigned: !!r.player })), profiles);
  const vacant = slots.filter((s) => !s.player);
  if (vacant.length > 0) {
    // Only real, registered people: players with an active sign-in account, not already in the lineup.
    const registered = new Set((await db.select({ playerId: users.playerId }).from(users).where(and(eq(users.isActive, true), isNotNull(users.playerId)))).map((u) => u.playerId));
    // Suggestions read roles and pools: members without a chosen role have neither, so none is made for them.
    const pool = [...overview.main, ...overview.other].filter(hasPrimaryRole).filter((p) => !inLineup.has(p.id) && registered.has(p.id));
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
          // A suggestion cites games only where this viewer may see the player's statistics.
          proficiency: statsFor(p.id) ? champions.map((c) => candidateLookup(p.id, c, slot.role)).filter((e): e is NonNullable<typeof e> => !!e).map((e) => ({ championId: e.championId, tier: e.tier, games: e.games })) : [],
        };
      });
      slot.suggestions = suggestForRole(slot.role, facts, composition, profiles);
    }
  }
  return { slots, complete: overview.complete, composition };
}

/**
 * One player's Team card in a lineup role: identity, look, rank, this season in that role and their
 * pool for it. The starter of a role and each of its substitutes are built the same way, so both
 * sides of a card carry the same parts. Without statistics access nothing numerical is filled in.
 */
function rosterCard(p: PlayerRecord & PlayerProfile, role: Role, from: { season: PlayerOverviewData | null; summary: SeasonSummary | null; avatarUrl: string | null; rankChange: RankChange | null; statsVisible: boolean; pool: PoolChampionContext[]; social: SocialLinks | null }): RosterSubstitute {
  const { season, summary, statsVisible } = from;
  const byChampion = new Map<string, OverviewCard>((season?.cards ?? []).filter((c) => c.role === role).map((c) => [c.championId, c]));
  const champions = poolFor(p, role).map((championId): RosterChampion => {
    if (!statsVisible) return hiddenChampion(championId);
    const card = byChampion.get(championId);
    const ctx = from.pool.find((x) => x.championId === championId);
    return {
      championId,
      games: card?.selected.games ?? 0,
      wins: card?.selected.wins ?? 0,
      losses: card?.selected.losses ?? 0,
      winRate: card?.selected.winRate ?? null,
      kdaRatio: card?.performance.kdaRatio ?? null,
      perfectKda: card?.performance.perfectKda ?? false,
      csPerMinute: card?.performance.csPerMinute ?? null,
      visionPerGame: card?.performance.visionPerGame ?? null,
      masteryPoints: card?.mastery?.points ?? null,
      tier: card?.tier ?? ctx?.tier ?? "unknown",
      tierLabel: card?.tierLabel ?? ctx?.tierLabel ?? TIER_LABELS.unknown,
      tierWhy: card?.tierWhy ?? "No games or mastery on the linked Riot accounts.",
      evidence: card?.evidence ?? "none",
      lastPlayedAt: card?.selected.lastPlayedAt?.toISOString() ?? null,
    };
  });
  return {
    player: {
      id: p.id,
      name: p.displayName,
      avatarUrl: from.avatarUrl,
      rank: season?.rank ? { tier: season.rank.tier, division: season.rank.division, leaguePoints: season.rank.leaguePoints, queue: season.rank.queue } : null,
      profileRole: roleFit(p, role),
      substitute: p.group === "other",
      poolSlot: poolSlotFor(p, role),
      profile: { primaryRole: p.primaryRole, secondaryRole: p.secondaryRole, primaryPool: p.primaryPool, secondaryPool: p.secondaryPool, additionalRoles: p.additionalRoles },
      version: profileVersion(p),
      seasonLabel: season ? seasonLabel(season.season) : "This season",
      partial: season ? !season.completeness.complete : true,
      primaryRole: p.primaryRole,
      art: cardArt(p),
      poolIds: featurableChampions(p),
      cardAccent: isCardAccent(p.cardAccent) ? p.cardAccent : "default",
      look: cardLookFor(p),
      social: visibleSocialLinks(from.social),
      season: season && summary && summary.record.games > 0 ? seasonFigures(summary) : null,
      rankChange: statsVisible ? from.rankChange : null,
      statsVisible,
    },
    champions,
  };
}

/**
 * The roster as one signed-in person may see it: their own statistics always, teammates' only with
 * "view teammates' statistics" (canViewPlayerStats, the profile's rule too). The Team page uses
 * this, so the rule lives on the server.
 */
export function getTeamRosterForViewer(db: Db, teamId: string, session: Session) {
  return getTeamRoster(db, teamId, { statsFor: (id) => canViewPlayerStats(session, id) });
}

/** A pool champion without any figures: the champion's identity is all a viewer without statistics access receives. */
function hiddenChampion(championId: string): RosterChampion {
  return { championId, games: 0, wins: 0, losses: 0, winRate: null, kdaRatio: null, perfectKda: false, csPerMinute: null, visionPerGame: null, masteryPoints: null, tier: "unknown", tierLabel: "", tierWhy: "", evidence: "none", lastPlayedAt: null };
}

/** The lineup role's season, as the card and its detail panel show it. */
export function seasonFigures(summary: { record: { games: number; wins: number; losses: number; winRate: number | null }; performance: { kdaRatio: number | null; perfectKda: boolean; kills: number | null; deaths: number | null; assists: number | null; csPerMinute: number | null; visionPerGame: number | null; damagePerMinute: number | null } }): NonNullable<NonNullable<RosterSlot["player"]>["season"]> {
  const { record: r, performance: p } = summary;
  return { games: r.games, wins: r.wins, losses: r.losses, winRate: r.winRate, kda: p.kdaRatio, perfectKda: p.perfectKda, kills: p.kills, deaths: p.deaths, assists: p.assists, csPerMinute: p.csPerMinute, visionPerGame: p.visionPerGame, damagePerMinute: p.damagePerMinute };
}
