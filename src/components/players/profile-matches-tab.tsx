import type { Db } from "@/server/db/types";
import type { Session } from "@/server/auth/permissions";
import { hasPermission } from "@/server/auth/permissions";
import { isSeasonMode } from "@/domain/season-stats";
import { legalRolesFor, poolFor } from "@/domain/roster";
import { getMatchHistory } from "@/server/players/match-history";
import { MatchHistoryView } from "@/components/match-history/match-history-view";
import { EncountersView, type EncountersData } from "@/components/match-history/encounters-view";
import { loadEncounterFocus, loadEncounterPage, loadGamesBySeason, modeCounts } from "@/server/players/encounters";
import { encounterListChoice, readEncounterFocus, type EncounterFocus } from "@/domain/encounters";
import { currentSeason } from "@/server/accounts/sync";
import { type ProfileHeaderData } from "@/server/players/profile-header";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { getMatchSyncStatus } from "@/server/accounts/refresh";
import { dataStatus } from "@/domain/data-status";
import { describeAccountSync } from "@/domain/account-status";
import { chooseSeason, offeredSeasons } from "@/domain/season";
import { championMap, IdentitySync, refreshFor } from "./profile-sections";

/* The player profile's Match History tab (components/players/profile-sections.tsx has the frame shared by every tab). */

export interface MatchSearch {
  season?: string;
  mode?: string;
  role?: string;
  scope?: string;
  champion?: string;
  account?: string;
  page?: string;
  per?: string;
  /** "encounters": the players met in the games, with their own choices (domain/encounters encounterListChoice). */
  view?: string;
  /** In Encounters, one player's games (domain/encounters readEncounterFocus): their key, and a side. */
  met?: string;
  side?: string;
  rel?: string;
  min?: string;
  sort?: string;
  q?: string;
  limit?: string;
  /** Match History's own Refine choices (domain/history-refine readRefine). */
  result?: string;
  patch?: string;
  from?: string;
  to?: string;
  with?: string;
  against?: string;
  hl?: string;
  group?: string;
}

/** Match History: the player's stored Riot games, a page at a time, or the players met in them (Encounters); details open on top. */
export async function ProfileMatchesTab(props: { db: Db; header: ProfileHeaderData; session: Session | null; basePath: string; search: MatchSearch }) {
  return (
    <>
      <IdentitySync header={props.header} session={props.session} />
      <ProfileMatchesTabBody {...props} />
    </>
  );
}

async function ProfileMatchesTabBody({ db, header, session, basePath, search }: { db: Db; header: ProfileHeaderData; session: Session | null; basePath: string; search: MatchSearch }) {
  const player = header.player;
  const self = session?.playerId === player.id;
  if (!self && !hasPermission(session, "view-teammate-stats")) return <p className="rounded-panel border border-border bg-surface p-4 text-sm text-fg-muted">Teammates&apos; match histories are not part of your access.</p>;
  if (search.view === "encounters") {
    const focus = readEncounterFocus(search);
    return focus ? <ProfileEncounterGamesBody db={db} header={header} session={session} basePath={basePath} search={search} focus={focus} /> : <ProfileEncountersBody db={db} header={header} session={session} basePath={basePath} search={search} />;
  }
  const [data, championsById, syncStatus, accounts] = await Promise.all([
    getMatchHistory(db, player.id, { season: Number(search.season) || null, mode: isSeasonMode(search.mode) ? search.mode : "all", role: search.role ?? null, scope: search.scope ?? null, championId: search.champion ?? null, accountId: search.account ?? null, page: Number(search.page) || 1, per: Number(search.per) || undefined, refine: { result: search.result, patch: search.patch, from: search.from, to: search.to, with: search.with, against: search.against, hl: search.hl, group: search.group } }, (r) => (legalRolesFor(player).includes(r) ? poolFor(player, r) : [])),
    championMap(db),
    getMatchSyncStatus(db, player.id),
    listAccountsForPlayer(db, player.id),
  ]);
  return <MatchHistoryView data={data} championsById={championsById} basePath={`${basePath}/matches`} playerId={player.id} playerName={player.displayName} status={gamesStatus(accounts, syncStatus, data.missingOnPage)} refresh={refreshFor(session, player.id, syncStatus)} />;
}

/** The games list's data status: the accounts' syncs, and the games on the page whose items are still being collected. */
function gamesStatus(accounts: Awaited<ReturnType<typeof listAccountsForPlayer>>, sync: Awaited<ReturnType<typeof getMatchSyncStatus>>, missingOnPage = 0) {
  const riotConfigured = !!process.env.RIOT_API_KEY;
  return dataStatus({
    accounts: accounts.map((a) => describeAccountSync({ syncStatus: a.syncStatus, syncError: a.syncError, lastSyncAt: a.lastSyncAt, puuid: a.puuid, resolveAttempts: a.resolveAttempts, history: a.historyBackfill, riotConfigured })),
    checkedAt: sync.checkedAt,
    attemptedAt: sync.attemptedAt,
    newestGameAt: sync.newestGameAt,
    notes: missingOnPage > 0 ? [{ label: `Items and runes of ${missingOnPage} older game${missingOnPage === 1 ? "" : "s"} on this page are still being collected`, detail: "The account sync adds them; their results already count." }] : [],
  });
}

/**
 * Match History → Encounters → one player: their games, as Match History lists games (the same
 * cards, breakdown and match window), in the season, game mode and account Encounters counted
 * them in, all of them or one side's, with their records above. The player is named by the list's
 * opaque key, never by account; every game comes from the player's own stored games, so this shows
 * nothing the list did not already count.
 */
async function ProfileEncounterGamesBody({ db, header, session, basePath, search, focus }: { db: Db; header: ProfileHeaderData; session: Session | null; basePath: string; search: MatchSearch; focus: EncounterFocus }) {
  const player = header.player;
  const [accounts, syncStatus, seasonNow, championsById] = await Promise.all([listAccountsForPlayer(db, player.id), getMatchSyncStatus(db, player.id), currentSeason(db), championMap(db)]);
  const ids = accounts.map((a) => a.id);
  const accountId = search.account && ids.includes(search.account) ? search.account : null;
  const bySeason = await loadGamesBySeason(db, ids, accountId);
  const season = chooseSeason(search.season, offeredSeasons(seasonNow, bySeason.map((r) => r.season)), seasonNow);
  const mode = isSeasonMode(search.mode) ? search.mode : "all";
  const met = await loadEncounterFocus(db, { accountIds: accountId ? [accountId] : ids, season, mode }, focus);
  const data = await getMatchHistory(db, player.id, { season, mode, accountId, page: Number(search.page) || 1, per: Number(search.per) || undefined, onlyMatchIds: met.matchIds }, (r) => (legalRolesFor(player).includes(r) ? poolFor(player, r) : []));
  const encounter = { focus, list: encounterListChoice(search), summary: met.summary, renamed: met.renamed, opgg: met.opgg };
  return <MatchHistoryView data={data} championsById={championsById} basePath={`${basePath}/matches`} playerId={player.id} playerName={player.displayName} status={gamesStatus(accounts, syncStatus, data.missingOnPage)} refresh={refreshFor(session, player.id, syncStatus)} encounter={encounter} />;
}

/**
 * Match History → Encounters: the players met in the player's games with the same season, game mode
 * and account choice as the games list. Two narrow reads, both counted in the database: the games
 * per season and queue (the choices), then one page of players (server/players/encounters).
 */
async function ProfileEncountersBody({ db, header, session, basePath, search }: { db: Db; header: ProfileHeaderData; session: Session | null; basePath: string; search: MatchSearch }) {
  const player = header.player;
  const [accounts, sync] = await Promise.all([listAccountsForPlayer(db, player.id), getMatchSyncStatus(db, player.id)]);
  const ids = accounts.map((a) => a.id);
  const accountId = search.account && ids.includes(search.account) ? search.account : null;
  const [bySeason, seasonNow] = await Promise.all([loadGamesBySeason(db, ids, accountId), currentSeason(db)]);
  const seasons = offeredSeasons(seasonNow, bySeason.map((r) => r.season));
  const season = chooseSeason(search.season, seasons, seasonNow);
  const mode = isSeasonMode(search.mode) ? search.mode : "all";
  const choice = encounterListChoice(search);
  const page = await loadEncounterPage(db, { accountIds: accountId ? [accountId] : ids, season, mode }, choice);
  const data: EncountersData = {
    filter: { season, mode, role: null, scope: "all", championId: null, accountId },
    seasons,
    currentSeason: seasonNow,
    accountOptions: accounts.length > 1 ? accounts.map((a) => ({ id: a.id, riotId: a.riotId, label: a.label })) : [],
    accountsLinked: accounts.length,
    modes: modeCounts(bySeason, { season, mode, account: !!accountId }),
    choice,
    page,
  };
  // The games list's status and Refresh: the players met come from the same games.
  return <EncountersView data={data} basePath={`${basePath}/matches`} status={gamesStatus(accounts, sync)} refresh={refreshFor(session, player.id, sync)} />;
}
