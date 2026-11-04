import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { players, users } from "@/server/db/schema";
import { getTeamRoster, type RosterCardPlayer, type RosterChampion, type RosterSlot, type RosterSubstitute } from "@/server/team/roster";
import { getBranding } from "@/server/repositories/branding";
import { cachedFor, invalidateCache } from "@/server/observability/cache";
import { logoSrc, logoStillSrc } from "@/domain/branding";
import type { CardLook } from "@/domain/card-style";
import { publicRiotDataAllowed } from "./access";

/*
  PUBLIC DATA BOUNDARY (Team). Everything a visitor without an account receives about the team is
  built here, field by field, from a fixed allowlist: nothing is spread from a member object, so a
  field added to the members' roster later never reaches the public pages by accident.

  Who appears: the players holding a lineup role and each role's designated substitute, under
  their display name, while they are on the team, not archived, and (when they have a sign-in
  account) that account is active. Nobody else on the team is named or sent. What appears: the
  card (picture, look, artwork, roles and the role's champion pool) and the social links the
  player switched on to Show publicly (domain/social-links). Never: usernames, Riot IDs,
  sign-in or permission details, settings, nor the lineup-management lists.

  Rank and statistics are Riot data: they appear only where the deployment allows Riot data on the
  public pages (public/access.ts, off by default). Then each card carries the figures members see
  on the Team page, copied field by field like the rest; the ladder change stays off, as its line
  leads to the members' profile.
*/

export interface PublicMemberInfo {
  /** The member's display name (the name teammates see). */
  name: string;
  avatarVersion: number | null;
  /** Their sign-in account, for the picture route (never sent to the page). */
  userId: string | null;
}

/** Of the given players, those who may appear publicly (on the team, not archived, account active if any), by player id. */
async function publicMembers(db: Db, teamId: string, ids: string[]): Promise<Map<string, PublicMemberInfo>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: players.id, name: players.displayName, userId: users.id, avatarVersion: users.avatarVersion, active: users.isActive })
    .from(players)
    .leftJoin(users, eq(users.playerId, players.id))
    .where(and(inArray(players.id, ids), eq(players.teamId, teamId), eq(players.teamMember, true), isNull(players.archivedAt)));
  return new Map(rows.filter((r) => r.active !== false && r.name.trim()).map((r) => [r.id, { name: r.name, avatarVersion: r.avatarVersion ?? null, userId: r.userId ?? null }]));
}

export const publicAvatarUrl = (playerId: string, version: number | null): string | null => (version ? `/api/public/avatars/${playerId}?v=${version}` : null);

/** The member's card look with its banner served from the public route (same id and version). */
export function publicLook(look: CardLook): CardLook {
  return { style: look.style, bannerUrl: look.bannerUrl ? look.bannerUrl.replace(/^\/api\/card-banners\//, "/api/public/card-banners/") : null };
}

/**
 * One lineup role as the public sees it: the allowlisted card of its player, else a placeholder
 * (an empty role, or a player who may not appear). Its designated substitute (the back of the
 * card) is built the same way; without one the card has no back.
 */
export function toPublicSlot(slot: RosterSlot, members: ReadonlyMap<string, PublicMemberInfo>, riotData = false): RosterSlot {
  const base = { role: slot.role, roleLabel: slot.roleLabel, candidates: [], waiting: [], suggestions: [], substituteCandidates: [] };
  const p = slot.player;
  const member = p ? members.get(p.id) : undefined;
  if (!p || !member) return { ...base, player: null, champions: [], privateMember: !!p, substitute: null };
  const subMember = slot.substitute ? members.get(slot.substitute.player.id) : undefined;
  return {
    ...base,
    ...publicCard(p, slot.champions, member, riotData),
    substitute: slot.substitute && subMember ? publicCard(slot.substitute.player, slot.substitute.champions, subMember, riotData) : null,
  };
}

/**
 * A member's card for the public pages, field by field from the allowlist: identity, look, roles
 * and the role's pool, and the figures only when Riot data may appear (`riotData`).
 */
function publicCard(p: RosterCardPlayer, champions: RosterChampion[], member: PublicMemberInfo, riotData: boolean): RosterSubstitute {
  const season = riotData ? p.season : null;
  return {
    player: {
      id: p.id,
      // The display name, never the username or Riot ID.
      name: member.name,
      avatarUrl: publicAvatarUrl(p.id, member.avatarVersion),
      rank: riotData && p.rank ? { tier: p.rank.tier, division: p.rank.division, leaguePoints: p.rank.leaguePoints, queue: p.rank.queue } : null,
      profileRole: p.profileRole,
      substitute: p.substitute,
      poolSlot: null,
      profile: { primaryRole: p.profile.primaryRole, secondaryRole: p.profile.secondaryRole, primaryPool: [...p.profile.primaryPool], secondaryPool: [...p.profile.secondaryPool], additionalRoles: p.profile.additionalRoles.map((r) => ({ role: r.role, pool: [...r.pool] })) },
      version: "",
      seasonLabel: riotData ? p.seasonLabel : "",
      partial: riotData ? p.partial : false,
      primaryRole: p.primaryRole,
      art: p.art ? { championId: p.art.championId, skinNum: p.art.skinNum } : null,
      poolIds: [],
      cardAccent: p.cardAccent,
      look: publicLook(p.look),
      // Only links switched on to "Show publicly" reach the roster (visibleSocialLinks); their display fields only.
      social: p.social.map((l) => ({ kind: l.kind, label: l.label, text: l.text, href: l.href })),
      season: season
        ? { games: season.games, wins: season.wins, losses: season.losses, winRate: season.winRate, kda: season.kda, perfectKda: season.perfectKda, kills: season.kills, deaths: season.deaths, assists: season.assists, csPerMinute: season.csPerMinute, visionPerGame: season.visionPerGame, damagePerMinute: season.damagePerMinute }
        : null,
      rankChange: null,
      statsVisible: riotData,
    },
    // The role's pool in order: with the figures members see when Riot data may appear, else none.
    champions: champions.map((c) =>
      riotData
        ? { championId: c.championId, games: c.games, wins: c.wins, losses: c.losses, winRate: c.winRate, kdaRatio: c.kdaRatio, perfectKda: c.perfectKda, csPerMinute: c.csPerMinute, visionPerGame: c.visionPerGame, masteryPoints: c.masteryPoints, tier: c.tier, tierLabel: c.tierLabel, tierWhy: c.tierWhy, evidence: c.evidence, lastPlayedAt: c.lastPlayedAt }
        : { championId: c.championId, games: 0, wins: 0, losses: 0, winRate: null, kdaRatio: null, perfectKda: false, csPerMinute: null, visionPerGame: null, masteryPoints: null, tier: "unknown", tierLabel: "", tierWhy: "", evidence: "none", lastPlayedAt: null },
    ),
  };
}

export interface PublicTeam {
  team: { name: string; shortName: string; logo: string | null; logoStill: string | null };
  slots: RosterSlot[];
  complete: boolean;
}

/** How long one instance reuses the public page's data: visitors and crawlers read the database at most this often. */
const PUBLIC_TEAM_TTL_MS = 60_000;

/**
 * The public Team Overview: branding and the five roles, each its player's card or a placeholder,
 * with their substitutes. `riotData` is the deployment's setting unless a test passes it.
 */
export async function loadPublicTeam(db: Db, teamId: string, riotData = publicRiotDataAllowed()): Promise<PublicTeam> {
  const { view } = await loadPublic(db, teamId, riotData);
  return view;
}

/** The players who appear on the public pages (the lineup and its substitutes), by player id. */
export async function publicPlayers(db: Db, teamId: string): Promise<ReadonlyMap<string, PublicMemberInfo>> {
  return (await loadPublic(db, teamId)).members;
}

/** The sign-in account of a player who appears on the public page (for their picture), or null: anyone else is a 404. */
export async function publicMemberUser(db: Db, teamId: string, playerId: string): Promise<{ userId: string | null } | null> {
  const member = (await loadPublic(db, teamId)).members.get(playerId);
  return member ? { userId: member.userId } : null;
}

/** Drops this instance's copy after a lineup or card change, so the public pages follow at once here (other instances within PUBLIC_TEAM_TTL_MS). */
export function invalidatePublicTeam(): void {
  invalidateCache("public-team");
  // The public Leaderboards name the same players with the same pictures and looks.
  invalidateCache("public-leaderboards");
}

function loadPublic(db: Db, teamId: string, riotData = publicRiotDataAllowed()): Promise<{ view: PublicTeam; members: Map<string, PublicMemberInfo> }> {
  return cachedFor(
    `public-team:${teamId}:${riotData ? "figures" : "cards"}`,
    PUBLIC_TEAM_TTL_MS,
    async () => {
      // Statistics are computed only when the public pages may show them.
      const [roster, branding] = await Promise.all([getTeamRoster(db, teamId, { statsFor: () => riotData }), getBranding(db)]);
      const ids = roster.slots.flatMap((s) => [s.player?.id, s.substitute?.player.id].filter((id): id is string => !!id));
      const members = await publicMembers(db, teamId, ids);
      return {
        view: {
          team: { name: branding.teamName, shortName: branding.shortName, logo: logoSrc(branding), logoStill: logoStillSrc(branding) },
          slots: roster.slots.map((s) => toPublicSlot(s, members, riotData)),
          complete: roster.complete,
        },
        members,
      };
    },
    db,
  );
}
