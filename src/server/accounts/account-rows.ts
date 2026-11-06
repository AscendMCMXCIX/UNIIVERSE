import { and, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { Db } from "@/server/db/types";
import { accountChampionHistory, accountMastery, accountMatches } from "@/server/db/schema";

/*
  A Riot account's stored rows (games, mastery, champion history), kept by each server instance
  until they change. Profile, Team and leaderboard pages read the same accounts' rows again and
  again, and those rows change only when the account syncs; reading them whole every time was
  most of the database egress after branding images (docs/HOSTING_USAGE.md).

  Per call: one query asks Postgres for a fingerprint of every requested account's rows (their
  count and a hash of every column read, grouped by account), and only the accounts whose
  fingerprint changed, or that this instance has not read yet, are loaded, in one query. So
  nothing is ever stale (a synced game or a new mastery figure shows on the next read), and a warm
  instance sends one short row per account instead of hundreds. Concurrent reads of the same
  account share one load. At most MAX_ACCOUNTS entries per kind and database handle.
*/

/*
  A game's multikill counts as one short text (domain/multikills): null while its record is still
  to be fetched again, "-" when it will never have counts (extra figures checked and empty), ""
  for none, else "double,triple,quadra,penta". About six bytes a game, where the four counts as
  columns would cost about twenty on every page that reads games.
*/
const mk = (key: string) => sql`coalesce(${accountMatches.extraStats}->>${sql.raw(`'${key}'`)}, '0')`;
const multikills = sql<string | null>`CASE WHEN ${accountMatches.extraStats} IS NULL THEN NULL
  WHEN ${accountMatches.extraStats}->>'doubleKills' IS NULL THEN '-'
  WHEN ${mk("doubleKills")} = '0' AND ${mk("tripleKills")} = '0' AND ${mk("quadraKills")} = '0' AND ${mk("pentaKills")} = '0' THEN ''
  ELSE concat_ws(',', ${mk("doubleKills")}, ${mk("tripleKills")}, ${mk("quadraKills")}, ${mk("pentaKills")}) END`;

const games = {
  matchId: accountMatches.matchId,
  accountId: accountMatches.accountId,
  queueId: accountMatches.queueId,
  championId: accountMatches.championId,
  enemyChampionId: accountMatches.enemyChampionId,
  role: accountMatches.role,
  win: accountMatches.win,
  patch: accountMatches.patch,
  gameCreation: accountMatches.gameCreation,
  kills: accountMatches.kills,
  deaths: accountMatches.deaths,
  assists: accountMatches.assists,
  cs: accountMatches.cs,
  damage: accountMatches.damage,
  visionScore: accountMatches.visionScore,
  gameDuration: accountMatches.gameDuration,
  /** 100 or 200, copied from the stored record (match-summary); null until then. */
  teamId: accountMatches.teamId,
  multikills,
};
const mastery = { accountId: accountMastery.accountId, championId: accountMastery.championId, points: accountMastery.points, level: accountMastery.level, lastPlayedAt: accountMastery.lastPlayedAt };
const history = {
  accountId: accountChampionHistory.accountId,
  championId: accountChampionHistory.championId,
  role: accountChampionHistory.role,
  queueGroup: accountChampionHistory.queueGroup,
  patch: accountChampionHistory.patch,
  games: accountChampionHistory.games,
  wins: accountChampionHistory.wins,
  lastPlayedAt: accountChampionHistory.lastPlayedAt,
};

const KINDS = {
  /** Stored games with a champion (remakes and unsupported queues never have one). */
  games: { table: accountMatches, account: accountMatches.accountId, columns: games, where: isNotNull(accountMatches.championId) as SQL | undefined },
  mastery: { table: accountMastery, account: accountMastery.accountId, columns: mastery, where: undefined as SQL | undefined },
  history: { table: accountChampionHistory, account: accountChampionHistory.accountId, columns: history, where: undefined as SQL | undefined },
};
export type AccountRowKind = keyof typeof KINDS;
type ColumnsOf<K extends AccountRowKind> = (typeof KINDS)[K]["columns"];
type ValueOf<C> = C extends PgColumn<infer T> ? (T["notNull"] extends true ? T["data"] : T["data"] | null) : C extends SQL<infer T> ? T : never;
export type AccountRow<K extends AccountRowKind> = { [C in keyof ColumnsOf<K>]: ValueOf<ColumnsOf<K>[C]> };

const MAX_ACCOUNTS = 150;
type Entry = { fingerprint: string; rows: unknown[] };
const stores = new WeakMap<object, Map<string, Entry>>();
const loading = new WeakMap<object, Map<string, Promise<void>>>();

function storeFor(db: object) {
  let s = stores.get(db);
  if (!s) stores.set(db, (s = new Map()));
  let l = loading.get(db);
  if (!l) loading.set(db, (l = new Map()));
  return { entries: s, inflight: l };
}

/** Every row of `kind` for these accounts, read from the database only where it changed. */
export async function accountRows<K extends AccountRowKind>(db: Db, kind: K, accountIds: string[]): Promise<AccountRow<K>[]> {
  const ids = [...new Set(accountIds)].sort();
  if (ids.length === 0) return [];
  const def = KINDS[kind];
  const { entries, inflight } = storeFor(db);
  const key = (id: string) => `${kind}:${id}`;
  const cols = Object.values(def.columns) as Array<PgColumn | SQL>;
  const scope = def.where ? and(inArray(def.account, ids), def.where) : inArray(def.account, ids);

  // One short row per account: how many rows it has and a hash of every column read.
  const prints = await db
    .select({ accountId: def.account, n: sql<number>`count(*)::int`, h: sql<string>`coalesce(sum(hashtextextended(row(${sql.join(cols, sql`, `)})::text, 0)), 0)::text` })
    .from(def.table)
    .where(scope)
    .groupBy(def.account);
  const fingerprint = new Map(prints.map((p) => [p.accountId as string, `${p.n}:${p.h}`]));
  const want = (id: string) => fingerprint.get(id) ?? "0:0";

  // Join loads already under way for the same accounts; load the rest that changed, in one query.
  const pending: Promise<void>[] = [];
  const stale = ids.filter((id) => {
    const busy = inflight.get(key(id));
    if (busy) {
      pending.push(busy);
      return false;
    }
    return entries.get(key(id))?.fingerprint !== want(id);
  });
  if (stale.length) {
    const load = (async () => {
      const where = def.where ? and(inArray(def.account, stale), def.where) : inArray(def.account, stale);
      const rows = (await db.select(def.columns).from(def.table).where(where)) as Array<Record<string, unknown>>;
      const byAccount = new Map<string, unknown[]>(stale.map((id) => [id, []]));
      // Frozen: every caller shares these rows, so none may change them.
      for (const r of rows) byAccount.get(r.accountId as string)?.push(Object.freeze(r));
      for (const id of stale) {
        entries.delete(key(id));
        entries.set(key(id), { fingerprint: want(id), rows: byAccount.get(id)! });
      }
      while (entries.size > MAX_ACCOUNTS * Object.keys(KINDS).length) entries.delete(entries.keys().next().value!);
    })();
    for (const id of stale) inflight.set(key(id), load);
    pending.push(load);
    load.finally(() => {
      for (const id of stale) if (inflight.get(key(id)) === load) inflight.delete(key(id));
    }).catch(() => undefined);
  }
  await Promise.all(pending);

  const out: AccountRow<K>[] = [];
  for (const id of ids) {
    const hit = entries.get(key(id));
    if (!hit) continue;
    // Most recently used last, so the oldest is the first to go.
    entries.delete(key(id));
    entries.set(key(id), hit);
    for (const r of hit.rows) out.push(r as AccountRow<K>);
  }
  return out;
}

/** Tests: forget everything this instance kept. */
export function forgetAccountRows(db: object): void {
  stores.delete(db);
  loading.delete(db);
}
