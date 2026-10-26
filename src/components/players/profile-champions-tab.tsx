import { redirect } from "next/navigation";
import type { Db } from "@/server/db/types";
import type { Session } from "@/server/auth/permissions";
import { hasPermission } from "@/server/auth/permissions";
import { isGameRole, isSeasonMode } from "@/domain/season-stats";
import { getPlayerOverview } from "@/server/players/overview";
import { getPlayerMatchups } from "@/server/players/matchups";
import { type ProfileHeaderData } from "@/server/players/profile-header";
import { getMatchSyncStatus } from "@/server/accounts/refresh";
import { dataStatus } from "@/domain/data-status";
import { AllChampions } from "@/components/players/all-champions";
import { championMap, IdentitySync, refreshFor, type ProfileSearch } from "./profile-sections";

/* The player profile's All Champions tab (components/players/profile-sections.tsx has the frame shared by every tab). */

/** All Champions: every champion played in the filtered games, pools or not, to search and sort. */
export async function ProfileChampionsTab(props: { db: Db; header: ProfileHeaderData; session: Session | null; basePath: string; search: ProfileSearch }) {
  return (
    <>
      <IdentitySync header={props.header} />
      <ProfileChampionsTabBody {...props} />
    </>
  );
}

async function ProfileChampionsTabBody({ db, header, session, basePath, search }: { db: Db; header: ProfileHeaderData; session: Session | null; basePath: string; search: ProfileSearch }) {
  const player = header.player;
  const self = session?.playerId === player.id;
  if (!self && !hasPermission(session, "view-teammate-stats")) return <p className="rounded-panel border border-border bg-surface p-4 text-sm text-fg-muted">Teammates&apos; champion statistics are not part of your access.</p>;
  const [overview, championsById, sync] = await Promise.all([
    getPlayerOverview(db, player, { season: Number(search.season) || null, mode: isSeasonMode(search.mode) ? search.mode : "all", role: search.role ?? null, accountId: search.account ?? null, riotConfigured: !!process.env.RIOT_API_KEY }),
    championMap(db),
    getMatchSyncStatus(db, player.id),
  ]);
  // An old Matchups link without a champion opens the most played one.
  if (!search.champion && search.tab === "matchups" && overview.topChampions[0]) {
    const q = new URLSearchParams(Object.entries(search).filter((e): e is [string, string] => typeof e[1] === "string"));
    q.set("champion", overview.topChampions[0].championId);
    redirect(`${basePath}/champions?${q.toString()}`);
  }
  // The champion window's lane data, in the list's scope (all linked accounts unless one is chosen).
  const detail = search.champion
    ? await getPlayerMatchups(db, player.id, { account: overview.filter.accountId ?? "all", season: overview.season, mode: overview.mode, champion: search.champion, vs: search.vs ?? null, role: isGameRole(search.crole) ? search.crole : null, exact: true })
    : null;
  const m = overview.summary.multikills;
  const perf = overview.summary.performance;
  const status = dataStatus({ accounts: overview.accounts.map((a) => a.sync), checkedAt: sync.checkedAt, attemptedAt: sync.attemptedAt, newestGameAt: sync.newestGameAt, season: overview.completeness, multikills: m, details: { games: perf.games, detailed: perf.detailedGames } });
  return <AllChampions data={overview} basePath={`${basePath}/champions`} championsById={championsById} playerId={player.id} detail={detail} status={status} refresh={refreshFor(session, player.id, sync, m.games - m.counted - m.unavailable > 0)} />;
}
