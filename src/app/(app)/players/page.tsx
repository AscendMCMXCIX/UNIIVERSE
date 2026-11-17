import { ROLES, type Role } from "@/domain/roles";
import { getAppDb } from "@/server/bootstrap";
import { hasPermission } from "@/server/auth/session";
import { canViewPlayerStats } from "@/server/auth/permissions";
import { requirePageAccess } from "@/server/auth/page-access";
import { listChampions } from "@/server/repositories/champions";
import { getCurrentLineup, getOrCreateTeam, listPlayers } from "@/server/repositories/team";
import { accountStatesForPlayers } from "@/server/proficiency/provenance";
import { listAccountsForPlayers } from "@/server/accounts/repository";
import { avatarUrlsByPlayer } from "@/server/repositories/profile";
import { rankView } from "@/server/players/overview";
import { PlayersDirectory } from "@/components/players/players-directory";
import { and, eq, isNotNull } from "drizzle-orm";
import { users } from "@/server/db/schema";
import { byDisplayName } from "@/domain/display-name";
import { loadSocialLinks } from "@/server/repositories/profile";
import { visibleSocialLinks } from "@/domain/social-links";
import { teamFreshness } from "@/server/ops/freshness";
import { FreshnessWatcher } from "@/components/ui/freshness-watcher";

export const dynamic = "force-dynamic";

/** PLAYERS: one roster of everyone active in UNIIVERSE, A to Z. Account administration lives in Admin. */
export default async function PlayersPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const { archived } = await searchParams;
  const db = await getAppDb();
  const [team, session, champions] = await Promise.all([getOrCreateTeam(db), requirePageAccess("view-players"), listChampions(db)]);
  const admin = hasPermission(session, "manage-players");
  const showArchived = admin && archived === "1";
  const [players, lineup, avatars, version] = await Promise.all([listPlayers(db, team.id, { includeArchived: showArchived }), getCurrentLineup(db, team.id), avatarUrlsByPlayer(db), teamFreshness(db)]);
  const [riot, accounts, social] = await Promise.all([accountStatesForPlayers(db, players.map((p) => p.id), !!process.env.RIOT_API_KEY), listAccountsForPlayers(db, players.map((p) => p.id)), loadSocialLinks(db, players.map((p) => p.id))]);
  const championsById = Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  const lineupRoleOf = (playerId: string): Role | null => ROLES.find((r) => lineup.slots[r] === playerId) ?? null;
  const rankOf = (playerId: string) => {
    const mine = accounts.filter((a) => a.playerId === playerId);
    const ranked = (mine.find((a) => a.label === "main" && a.tier) ?? mine.find((a) => a.tier)) ?? null;
    const r = ranked ? rankView(ranked) : null;
    return r ? { tier: r.tier, division: r.division, leaguePoints: r.leaguePoints, queue: r.queue } : null;
  };
  // A teammate's rank is a statistic (docs/PROFILE_VISIBILITY.md): sent only to a viewer with
  // teammates' statistics, or for their own entry. A hidden rank is left out, never "Unranked".
  const rankFor = (playerId: string) => (canViewPlayerStats(session, playerId) ? { showRank: true, rank: rankOf(playerId) } : { showRank: false, rank: null });
  // Deactivated accounts are hidden like archived players (an admin sees them under "Show archived").
  const deactivated = new Set((await db.select({ playerId: users.playerId }).from(users).where(and(eq(users.isActive, false), isNotNull(users.playerId)))).map((u) => u.playerId));
  // A to Z by display name (case and accents ignored, the same order on every load); "Main
  // lineup" in the filters narrows it to the lineup.
  const ordered = [...players].sort(byDisplayName((p) => p.displayName, (p) => p.id));
  // Your own profile is managed at My Profile: teammates only here (an admin managing players sees everyone).
  const visible = (showArchived ? ordered : ordered.filter((p) => !deactivated.has(p.id))).filter((p) => admin || p.id !== session.playerId);

  return (
    <div className="mx-auto max-w-[var(--content-max)]">
      <FreshnessWatcher scope={{ kind: "team" }} version={version} />
      {/* The header is the directory's own, so the count can be its scope line (read out as it changes). */}
      <PlayersDirectory
        archived={admin ? { on: showArchived } : null}
        // A member's own profile is not listed (above): the header offers it.
        myProfile={!!session.playerId && !admin}
        championsById={championsById}
        // The record as the rows show it: a profile's notes are nobody else's to receive.
        entries={visible.map((p) => ({ player: { ...p, notes: "" }, lineupRole: lineupRoleOf(p.id), isYou: session.playerId === p.id, riot: riot[p.id] ?? null, avatarUrl: avatars[p.id] ?? null, ...rankFor(p.id), riotIds: accounts.filter((a) => a.playerId === p.id).map((a) => a.riotId), social: visibleSocialLinks(social.get(p.id)) }))}
      />
    </div>
  );
}
