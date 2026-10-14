import type { Db } from "@/server/db/types";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { poolFor } from "@/domain/roster";
import { getPlayerOverview, type OverviewCard } from "@/server/players/overview";
import { avatarUrlsByPlayer } from "@/server/repositories/profile";
import { profileVersion } from "@/server/repositories/team";
import { seasonLabel } from "@/domain/season";
import { candidatesFor, getTeamOverview } from "./overview";

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
    profileRole: "primary" | "secondary" | "other";
    substitute: boolean;
    /** Which pool the lineup role draws from (for in-place editing). */
    poolSlot: "primary" | "secondary" | null;
    profile: { primaryRole: Role; secondaryRole: Role | null; primaryPool: string[]; secondaryPool: string[] };
    version: string;
    seasonLabel: string;
    partial: boolean;
  } | null;
  champions: RosterChampion[];
  candidates: Array<{ id: string; name: string; group: "main" | "other"; fit: "primary" | "secondary" }>;
}

/**
 * The Team page's roster: each lineup slot with the player, their picture and rank, and the
 * champions they bring to that role with current-season figures (all supported game modes) from
 * stored Riot data only. Mastery is shown as points (summed over the player's accounts).
 */
export async function getTeamRoster(db: Db, teamId: string): Promise<{ slots: RosterSlot[]; complete: boolean }> {
  const overview = await getTeamOverview(db, teamId);
  const riotConfigured = !!process.env.RIOT_API_KEY;
  const [avatars, seasons] = await Promise.all([
    avatarUrlsByPlayer(db),
    Promise.all(overview.rows.map((r) => (r.player ? getPlayerOverview(db, r.player, { mode: "all", riotConfigured }).catch(() => null) : Promise.resolve(null)))),
  ]);
  const slots = overview.rows.map((row, i): RosterSlot => {
    const season = seasons[i];
    const p = row.player;
    const candidates = candidatesFor(row.role, overview, true).map((c) => ({ id: c.id, name: c.displayName, group: c.group, fit: c.primaryRole === row.role ? ("primary" as const) : ("secondary" as const) }));
    if (!p) return { role: row.role, roleLabel: ROLE_LABELS[row.role], player: null, champions: [], candidates };
    const byChampion = new Map<string, OverviewCard>((season?.cards ?? []).map((c) => [c.championId, c]));
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
        tierLabel: card?.tierLabel ?? ctx?.tierLabel ?? "No data",
        lastPlayedAt: card?.selected.lastPlayedAt?.toISOString() ?? null,
      };
    });
    const poolSlot = p.primaryRole === row.role ? "primary" : p.secondaryRole === row.role ? "secondary" : null;
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
        profile: { primaryRole: p.primaryRole, secondaryRole: p.secondaryRole, primaryPool: p.primaryPool, secondaryPool: p.secondaryPool },
        version: profileVersion(p),
        seasonLabel: season ? seasonLabel(season.season) : "This season",
        partial: season ? !season.completeness.complete : true,
      },
      champions,
      candidates,
    };
  });
  return { slots, complete: overview.complete };
}
