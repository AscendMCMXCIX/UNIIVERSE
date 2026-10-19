import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { players, users } from "@/server/db/schema";
import { getTeamRoster, type RosterCardPlayer, type RosterChampion, type RosterSlot, type RosterSubstitute } from "@/server/team/roster";
import { getBranding } from "@/server/repositories/branding";
import { logoSrc, logoStillSrc } from "@/domain/branding";
import type { CardLook } from "@/domain/card-style";

/*
  PUBLIC DATA BOUNDARY (Team). Everything a visitor without an account receives about the team is
  built here, field by field, from a fixed allowlist: nothing is spread from a member object, so a
  field added to the members' roster later never reaches the public pages by accident.

  Who appears: members who turned on "Public profile" themselves (players.public_profile), who are
  on the team, not archived, and whose sign-in account is active and set up. Everyone else holding a lineup
  role is a role placeholder with no name, picture or id. Rank and statistics are never loaded for
  the public roster (Riot data; see public/access.ts), nor are the lineup-management lists.
*/

export interface PublicMemberInfo {
  /** The name the member chose for the public pages. */
  name: string;
  avatarVersion: number | null;
}

/** The members whose identity may appear publicly, by player id. */
export async function publicMembers(db: Db, teamId: string): Promise<Map<string, PublicMemberInfo>> {
  const rows = await db
    .select({ id: players.id, name: players.publicName, avatarVersion: users.avatarVersion, active: users.isActive })
    .from(players)
    .innerJoin(users, eq(users.playerId, players.id))
    .where(and(eq(players.teamId, teamId), eq(players.publicProfile, true), eq(players.teamMember, true), isNull(players.archivedAt), isNotNull(users.setupCompletedAt), isNotNull(players.publicName)));
  return new Map(rows.filter((r) => r.active && r.name).map((r) => [r.id, { name: r.name!, avatarVersion: r.avatarVersion ?? null }]));
}

/** The sign-in account of one member whose identity may appear publicly, or null (no consent, archived, inactive, not set up, off the team). */
export async function publicMemberUser(db: Db, playerId: string): Promise<{ userId: string } | null> {
  const [row] = await db
    .select({ userId: users.id, active: users.isActive })
    .from(players)
    .innerJoin(users, eq(users.playerId, players.id))
    .where(and(eq(players.id, playerId), eq(players.publicProfile, true), eq(players.teamMember, true), isNull(players.archivedAt), isNotNull(users.setupCompletedAt), isNotNull(players.publicName)));
  return row?.active ? { userId: row.userId } : null;
}

export const publicAvatarUrl = (playerId: string, version: number | null): string | null => (version ? `/api/public/avatars/${playerId}?v=${version}` : null);

/** The member's card look with its banner served from the public route (same id and version). */
function publicLook(look: CardLook): CardLook {
  return { style: look.style, bannerUrl: look.bannerUrl ? look.bannerUrl.replace(/^\/api\/card-banners\//, "/api/public/card-banners/") : null };
}

/**
 * One lineup role as the public sees it: the allowlisted card of a consenting member, else a
 * placeholder. Its substitutes (the back of the card) are consenting members only, built the same
 * way; anyone else on the bench is left out entirely, not even counted.
 */
export function toPublicSlot(slot: RosterSlot, members: ReadonlyMap<string, PublicMemberInfo>): RosterSlot {
  const base = { role: slot.role, roleLabel: slot.roleLabel, candidates: [], waiting: [], suggestions: [] };
  const p = slot.player;
  const member = p ? members.get(p.id) : undefined;
  if (!p || !member) return { ...base, player: null, champions: [], privateMember: !!p, substitutes: [] };
  return {
    ...base,
    ...publicCard(p, slot.champions, member),
    substitutes: slot.substitutes.flatMap((sub) => {
      const m = members.get(sub.player.id);
      return m ? [publicCard(sub.player, sub.champions, m)] : [];
    }),
  };
}

/** A member's card for the public pages, field by field from the allowlist: identity, look, roles and the role's pool, never a figure. */
function publicCard(p: RosterCardPlayer, champions: RosterChampion[], member: PublicMemberInfo): RosterSubstitute {
  return {
    player: {
      id: p.id,
      // The member's chosen public name, never the name members see (their sign-in username).
      name: member.name,
      avatarUrl: publicAvatarUrl(p.id, member.avatarVersion),
      rank: null,
      profileRole: p.profileRole,
      substitute: p.substitute,
      poolSlot: null,
      profile: { primaryRole: p.profile.primaryRole, secondaryRole: p.profile.secondaryRole, primaryPool: [...p.profile.primaryPool], secondaryPool: [...p.profile.secondaryPool], additionalRoles: p.profile.additionalRoles.map((r) => ({ role: r.role, pool: [...r.pool] })) },
      version: "",
      seasonLabel: "",
      partial: false,
      primaryRole: p.primaryRole,
      art: p.art ? { championId: p.art.championId, skinNum: p.art.skinNum } : null,
      poolIds: [],
      cardAccent: p.cardAccent,
      look: publicLook(p.look),
      season: null,
      rankChange: null,
      statsVisible: false,
    },
    // The role's pool in order, without any figure.
    champions: champions.map((c) => ({ championId: c.championId, games: 0, wins: 0, losses: 0, winRate: null, kdaRatio: null, perfectKda: false, csPerMinute: null, visionPerGame: null, masteryPoints: null, tier: "unknown", tierLabel: "", tierWhy: "", evidence: "none", lastPlayedAt: null })),
  };
}

export interface PublicTeam {
  team: { name: string; shortName: string; logo: string | null; logoStill: string | null };
  slots: RosterSlot[];
  complete: boolean;
}

/** The public Team Overview: branding and the five roles, each a consenting member's card or a placeholder. */
export async function loadPublicTeam(db: Db, teamId: string): Promise<PublicTeam> {
  // No statistics are computed for anyone: the public roster never shows them.
  const [roster, members, branding] = await Promise.all([getTeamRoster(db, teamId, { statsFor: () => false }), publicMembers(db, teamId), getBranding(db)]);
  return {
    team: { name: branding.teamName, shortName: branding.shortName, logo: logoSrc(branding), logoStill: logoStillSrc(branding) },
    slots: roster.slots.map((s) => toPublicSlot(s, members)),
    complete: roster.complete,
  };
}

/** A member's own choice (Settings → Public profile). */
export async function getPublicProfile(db: Db, playerId: string): Promise<{ on: boolean; name: string | null }> {
  const [row] = await db.select({ on: players.publicProfile, name: players.publicName }).from(players).where(eq(players.id, playerId));
  return { on: row?.on === true, name: row?.name ?? null };
}

/** Records a member's own choice. Called only with the signed-in member's own player id. */
export async function setPublicProfile(db: Db, playerId: string, choice: { on: boolean; name: string | null }): Promise<void> {
  await db.update(players).set({ publicProfile: choice.on === true, publicName: choice.name }).where(eq(players.id, playerId));
}

/** For Admin → Public Access: the members who made their profile public (names only; admins see, never change, the choice). */
export async function listPublicProfileMembers(db: Db, teamId: string): Promise<{ total: number; members: Array<{ id: string; name: string }> }> {
  const [team, shown] = await Promise.all([
    db.select({ id: players.id }).from(players).where(and(eq(players.teamId, teamId), eq(players.teamMember, true), isNull(players.archivedAt))),
    db
      .select({ id: players.id, name: players.publicName, active: users.isActive })
      .from(players)
      .innerJoin(users, eq(users.playerId, players.id))
      .where(and(eq(players.teamId, teamId), eq(players.publicProfile, true), eq(players.teamMember, true), isNull(players.archivedAt), isNotNull(users.setupCompletedAt), isNotNull(players.publicName)))
      .orderBy(asc(players.publicName)),
  ]);
  return { total: team.length, members: shown.filter((m) => m.active && m.name).map((m) => ({ id: m.id, name: m.name! })) };
}
