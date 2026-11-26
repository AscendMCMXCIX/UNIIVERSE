import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { CHAMPIONS_FIRST_TEST_COOKIE, championsFirstForTest } from "@/server/demo/test-hooks";
import type { Db } from "@/server/db/types";
import type { Session } from "@/server/auth/permissions";
import { hasPermission } from "@/server/auth/permissions";
import { isGameRole, isSeasonMode } from "@/domain/season-stats";
import { getPlayerOverview } from "@/server/players/overview";
import { getChampionPreview, getPairingGames } from "@/server/players/champion-preview";
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
      <IdentitySync header={props.header} session={props.session} />
      <ProfileChampionsTabBody {...props} />
    </>
  );
}

async function ProfileChampionsTabBody({ db, header, session, basePath, search }: { db: Db; header: ProfileHeaderData; session: Session | null; basePath: string; search: ProfileSearch }) {
  const player = header.player;
  const self = session?.playerId === player.id;
  if (!self && !hasPermission(session, "view-teammate-stats")) return <p className="rounded-panel border border-border bg-surface p-4 text-sm text-fg-muted">Teammates&apos; champion statistics are not part of your access.</p>;
  const firstRows = championsFirstForTest((await cookies()).get(CHAMPIONS_FIRST_TEST_COOKIE)?.value) ?? undefined;
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
  // A linked preview (?champion=&crole=[&vs=]) is in the first HTML: its tally, and the opponent's
  // games when one is open, in the list's scope (all linked accounts unless one is chosen), in the
  // position the address names where the champion was played in it, else its most played one. A
  // champion with no recorded position has no lane opponents to read.
  const asked = isGameRole(search.crole) ? search.crole : null;
  const card = search.champion ? (overview.topChampions.find((c) => c.championId === search.champion) ?? null) : null;
  const role = card ? (card.roles.find((r) => r.role === asked)?.role ?? card.role) : null;
  const scope = card && role ? { season: overview.season, mode: overview.mode, account: overview.filter.accountId ?? "all", champion: card.championId, role } : null;
  const [initialPreview, initialPairing] = scope ? await Promise.all([getChampionPreview(db, player.id, scope), search.vs ? getPairingGames(db, player.id, scope, search.vs) : null]) : [null, null];
  const m = overview.summary.multikills;
  const perf = overview.summary.performance;
  const status = dataStatus({ accounts: overview.accounts.map((a) => a.sync), checkedAt: sync.checkedAt, attemptedAt: sync.attemptedAt, newestGameAt: sync.newestGameAt, season: overview.completeness, multikills: m, details: { games: perf.games, detailed: perf.detailedGames, unavailable: perf.unavailableGames } });
  return <AllChampions data={overview} basePath={`${basePath}/champions`} championsById={championsById} playerId={player.id} isOwn={self} initialPreview={initialPreview} initialPairing={initialPairing} status={status} refresh={refreshFor(session, player.id, sync, m.games - m.counted - m.unavailable > 0)} firstRows={firstRows} />;
}
