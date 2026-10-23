import { inArray, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { players, riotAccounts, users } from "@/server/db/schema";
import { eraseSubject, type ErasureSubject } from "./erasure";
import { usableRecords } from "./ledger";
import { normaliseRiotId, riotIdToken, tagged } from "./tokens";

/*
  Keeps every recorded erasure applied to the database as it is now. The records hold only keyed
  tokens, so the database is read for identifiers whose tokens match, and the ordinary erasure runs
  again for them (without a new record). Two uses:
  - "recent", daily (the integrity job): accounts and profiles, Riot accounts, and the games stored
    in the last two days. A safety net: nothing the sync stores should name an erased person, and
    this would catch it if it did. Small reads only.
  - "full", by hand after restoring a backup made before an erasure (docs/BACKUPS.md: import the
    erasure records first): every stored game and job log is checked.
*/

export interface ReconcileResult {
  mode: "recent" | "full";
  /** Records made with this deployment's key (the others cannot be applied: a replaced secret). */
  records: number;
  unusable: number;
  /** Accounts or profiles of erased people found again and erased. */
  people: number;
  /** Erased people's traces found again (games, logs) and removed. */
  traces: number;
}

/** postgres-js returns the rows; PGlite wraps them in { rows }. */
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];

/** "Name#TAG" spellings in old sync log lines (the format names them at the start of a line or after "is now"). */
export function riotIdsInLog(text: string): string[] {
  const out = new Set<string>();
  for (const line of text.split(/\\n|\n/)) {
    for (const m of line.matchAll(/(?:^|"|is now )([^"#\n]{1,24}?#[^\s":#]{2,8})(?=[:\s"(]|$)/gu)) out.add(m[1]!.trim());
  }
  return [...out];
}

export async function reconcileErasures(db: Db, options: { mode: "recent" | "full"; now?: Date } = { mode: "recent" }): Promise<ReconcileResult> {
  const now = options.now ?? new Date();
  const all = await db.execute(sql`SELECT count(*) AS n FROM privacy_erasures`);
  const total = Number(rowsOf<{ n: number | string }>(all)[0]?.n ?? 0);
  const records = total ? await usableRecords(db) : [];
  const result: ReconcileResult = { mode: options.mode, records: records.length, unusable: total - records.length, people: 0, traces: 0 };
  if (!records.length) return result;

  // Tokens: account, profile and Riot account ids always apply; Riot identities only while the
  // erasure is not released (the person may have come back since).
  const ids = new Set<string>();
  const riot = new Map<string, string>();
  for (const r of records)
    for (const t of r.tokens) {
      if (t.startsWith("user:") || t.startsWith("player:") || t.startsWith("account:")) ids.add(t);
      else if (!r.releasedAt) riot.set(t, r.id);
    }

  // 1. Accounts and profiles of erased people (a restored backup brings them back). A Riot account
  //    found only by its Riot identity, on a profile that is not theirs, is removed on its own.
  const userRows = await db.select({ id: users.id, playerId: users.playerId }).from(users);
  const playerRows = await db.select({ id: players.id }).from(players);
  const accountRows = await db.select({ id: riotAccounts.id, playerId: riotAccounts.playerId, puuid: riotAccounts.puuid, gameName: riotAccounts.gameName, tagLine: riotAccounts.tagLine }).from(riotAccounts);
  const targets: Array<{ userId?: string; playerId?: string }> = [];
  const covered = new Set<string>();
  for (const u of userRows)
    if (ids.has(tagged("user", u.id))) {
      targets.push({ userId: u.id });
      if (u.playerId) covered.add(u.playerId);
    }
  const profiles = new Set(playerRows.filter((p) => ids.has(tagged("player", p.id))).map((p) => p.id));
  const strayAccounts: string[] = [];
  for (const a of accountRows) {
    if (ids.has(tagged("account", a.id))) {
      if (a.playerId) profiles.add(a.playerId);
      else strayAccounts.push(a.id);
    } else if ((a.puuid && riot.has(tagged("puuid", a.puuid))) || riot.has(riotIdToken(`${a.gameName}#${a.tagLine}`) ?? "")) strayAccounts.push(a.id);
  }
  for (const playerId of profiles) if (!covered.has(playerId)) targets.push({ playerId });
  for (const target of targets) {
    await eraseSubject(db, null, target, { record: false });
    result.people++;
  }
  // (Those on an erased profile went with it.)
  const remaining = strayAccounts.filter((id) => {
    const a = accountRows.find((x) => x.id === id)!;
    return !a.playerId || (!covered.has(a.playerId) && !profiles.has(a.playerId));
  });
  if (remaining.length) {
    await db.delete(riotAccounts).where(inArray(riotAccounts.id, remaining));
    result.traces += remaining.length;
  }

  // 2. Traces: Riot identities in stored games (and, in full mode, old job logs).
  if (!riot.size) return result;
  const found = new Map<string, { puuids: Set<string>; riotIds: Set<string> }>();
  const note = (recordId: string | undefined, puuid: string | null, riotId: string | null) => {
    if (!recordId) return;
    const f = found.get(recordId) ?? { puuids: new Set(), riotIds: new Set() };
    if (puuid) f.puuids.add(puuid);
    if (riotId) f.riotIds.add(riotId);
    found.set(recordId, f);
  };
  const recent = options.mode === "recent" ? sql`AND d.stored_at > ${new Date(now.getTime() - 2 * 86_400_000).toISOString()}::timestamptz` : sql``;
  const participants = rowsOf<{ puuid: string | null; name: string | null }>(
    await db.execute(sql`
      SELECT DISTINCT p->>'puuid' AS puuid, p->>'name' AS name
      FROM match_details d CROSS JOIN LATERAL jsonb_array_elements(d.participants) p
      WHERE coalesce(p->>'removed', '') <> 'true' ${recent}`),
  );
  for (const p of participants) {
    const byPuuid = p.puuid ? riot.get(tagged("puuid", p.puuid)) : undefined;
    const byName = riot.get(riotIdToken(p.name) ?? "");
    if (byPuuid || byName) note(byPuuid ?? byName, p.puuid, p.name && normaliseRiotId(p.name) ? p.name : null);
  }
  if (options.mode === "full") {
    for (const r of rowsOf<{ puuid: string }>(await db.execute(sql`SELECT puuid FROM last_known_ranks UNION SELECT puuid FROM draft_enemy_scouting WHERE puuid IS NOT NULL`))) {
      const id = riot.get(tagged("puuid", r.puuid));
      if (id) note(id, r.puuid, null);
    }
    for (const r of rowsOf<{ riot_id: string }>(await db.execute(sql`SELECT riot_id FROM draft_enemy_scouting`))) {
      const id = riot.get(riotIdToken(r.riot_id) ?? "");
      if (id) note(id, null, r.riot_id);
    }
    // Old sync log lines named accounts; only lines that still contain a "#" are read.
    for (const r of rowsOf<{ text: string }>(await db.execute(sql`SELECT summary::text || ' ' || coalesce(error, '') AS text FROM job_runs WHERE strpos(summary::text || coalesce(error, ''), '#') > 0 UNION ALL SELECT details::text || ' ' || coalesce(last_error, '') FROM data_refresh_status WHERE strpos(details::text || coalesce(last_error, ''), '#') > 0`))) {
      for (const riotId of riotIdsInLog(r.text)) {
        const id = riot.get(riotIdToken(riotId) ?? "");
        if (id) note(id, null, riotId);
      }
    }
  }
  for (const f of found.values()) {
    const subject: ErasureSubject = { kind: "former", userId: null, playerId: null, username: null, displayName: null, role: null, isAdmin: false, names: [], accountIds: [], puuids: [...f.puuids], riotIds: [...f.riotIds] };
    await eraseSubject(db, null, subject, { record: false });
    result.traces++;
  }
  return result;
}
