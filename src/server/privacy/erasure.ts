import { eq, inArray, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { activationCodes, appSettings, auditEvents, dataRefreshStatus, invites, jobRuns, lastKnownRanks, matchDetails, players, privacyErasures, riotAccounts, users, type MatchParticipantDetail } from "@/server/db/schema";
import { pruneAuthFailures } from "@/server/auth/throttle";
import { accountSyncLeaseKey, figuresCatchUpLeaseKey, viewRefreshLeaseKey } from "@/server/jobs/background";
import { summariseMatches } from "@/server/accounts/match-summary";
import type { AccessRole } from "@/server/auth/permissions";
import { getUser, UserError } from "@/server/repositories/users";
import { forgetErasureCache, newReference } from "./ledger";
import { redactParticipants } from "./redact";
import { keyCheckOf, normaliseRiotId, tagged } from "./tokens";

/*
  PERMANENT ERASURE of one person's personal data (Admin Mode → Users & Permissions → Personal
  data). Distinct from the other three account actions:
    deactivate  blocks sign-in, keeps everything;
    delete      removes the account (and optionally the profile), keeps shared history as it was;
    archive     hides a profile, keeps everything;
    erase       removes the person: account, profile, customisation, the records kept from the
                retired Ranked Development, Riot accounts and everything stored about them, and
                de-identifies what other people's records keep.
  It cannot be undone (encrypted backups made before it keep the data until they expire; see
  docs/BACKUPS.md). Everything happens in one transaction: an interrupted erasure changes nothing,
  and running it again does the same work.

  What happens to each kind of record:
  - the account, sessions, profile picture, player profile (roles, pools, card customisation,
    banner, social links, notes), Riot accounts, their games, mastery, rank history and the records
    kept from the retired Ranked Development (objectives, If–Then plans, sessions, games and
    reviews) are deleted;
  - Riot games only they played (no other linked account, bookmark or team record uses them) are
    deleted with their timelines; games shared with others keep the others and replace the person
    with a "Removed player" (server/privacy/redact.ts), their timeline entries removed, and other
    members' lane opponent champion forgotten where the opponent was them;
  - last known ranks lose their rows (migrations 0062 to 0064 and 0066 dropped Meta & Trends, the
    Draft feature's records and the Clash scouts);
  - the admin activity log keeps what happened but names them "Erased member" (the one exception
    to it being append-only), and job logs lose their Riot IDs;
  - an erasure record keeps keyed tokens of their identifiers (server/privacy/tokens.ts), so games
    synced later leave them out and their Riot accounts are not linked again by accident.
  - notes other people wrote (journals, bookmarks…) keep their text with the person's names
    (UNIIVERSE and Riot names, whole words) replaced by "[removed]".
*/

export const ERASED_MEMBER = "Erased member";
const REMOVED_TEXT = "[removed]";

export interface ErasureSubject {
  /** member: an account and/or profile in UNIIVERSE · former: only traces left (identified by Riot account). */
  kind: "member" | "former";
  userId: string | null;
  playerId: string | null;
  username: string | null;
  displayName: string | null;
  role: AccessRole | null;
  isAdmin: boolean;
  /** Names the person was known by in UNIIVERSE: username, display and public names. */
  names: string[];
  accountIds: string[];
  /** Every PUUID known for them (Riot's ids change with the server's API key, so there can be several). */
  puuids: string[];
  /** Every Riot ID ("Name#TAG") they used: linked accounts and the names Riot recorded in their games. */
  riotIds: string[];
}

export interface ErasureCounts {
  account: boolean;
  profile: boolean;
  riotAccounts: number;
  games: number;
  journalEntries: number;
  gamesDeleted: number;
  gamesDeidentified: number;
  timelines: number;
  lanePartners: number;
  /** Notes other people wrote that named them (the names are replaced, the rest of the note kept). */
  notes: number;
  auditEntries: number;
  jobLogs: number;
  otherRecords: number;
}

/** Notes other people wrote that name the person, by where they are: their names become "[removed]". */
export interface Mention {
  where: string;
  rows: number;
}

export interface ErasurePreview {
  subject: { kind: ErasureSubject["kind"]; username: string | null; displayName: string | null; riotIds: string[] };
  counts: ErasureCounts;
  mentions: Mention[];
}

/** postgres-js returns the rows; PGlite wraps them in { rows }. */
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
const textList = (values: readonly string[]): SQL => sql.join(values.map((v) => sql`${v}`), sql`, `);
const uuidList = (values: readonly string[]): SQL => sql.join(values.map((v) => sql`${v}::uuid`), sql`, `);
const unique = (values: ReadonlyArray<string | null | undefined>): string[] => [...new Set(values.map((v) => v?.trim() ?? "").filter(Boolean))];
const fold = (s: string): string => s.normalize("NFKC").toLowerCase().replace(/\s+/gu, "");

/* ---------------------------------------------------------------------------------------------
   Who is erased
   --------------------------------------------------------------------------------------------- */

/** The person behind an account or a profile (a profile's account, when it has one, goes with it). */
export async function memberSubject(db: Db, target: { userId?: string | null; playerId?: string | null }): Promise<ErasureSubject> {
  let user = target.userId ? await getUser(db, target.userId) : null;
  if (target.userId && !user) throw new UserError("Account not found.");
  const playerId = user?.playerId ?? target.playerId ?? null;
  if (!user && playerId) {
    const [linked] = await db.select({ id: users.id }).from(users).where(eq(users.playerId, playerId));
    if (linked) user = await getUser(db, linked.id);
  }
  const [player] = playerId ? await db.select({ displayName: players.displayName, publicName: players.publicName, riotId: players.riotId }).from(players).where(eq(players.id, playerId)) : [];
  if (playerId && !player) throw new UserError("Player not found.");
  if (!user && !player) throw new UserError("Nothing to erase.");
  const accounts = playerId ? await db.select({ id: riotAccounts.id, puuid: riotAccounts.puuid, gameName: riotAccounts.gameName, tagLine: riotAccounts.tagLine }).from(riotAccounts).where(eq(riotAccounts.playerId, playerId)) : [];
  const subject: ErasureSubject = {
    kind: "member",
    userId: user?.id ?? null,
    playerId,
    username: user?.username ?? null,
    displayName: player?.displayName ?? user?.displayName ?? null,
    role: user?.role ?? null,
    isAdmin: user?.isAdmin ?? false,
    names: unique([user?.username, user?.displayName, player?.displayName, player?.publicName]),
    accountIds: accounts.map((a) => a.id),
    puuids: unique(accounts.map((a) => a.puuid)),
    riotIds: unique([...accounts.map((a) => `${a.gameName}#${a.tagLine}`), player?.riotId?.includes("#") ? player.riotId : null]),
  };
  await discoverIdentities(db, subject);
  return subject;
}

/**
 * Someone with no account or profile left (deleted before erasure existed), identified by a Riot
 * account Riot confirmed, plus the names they used in UNIIVERSE when known (for team records).
 */
export async function formerMemberSubject(db: Db, input: { puuid: string; riotId: string; names?: readonly string[] }): Promise<ErasureSubject> {
  const parsed = normaliseRiotId(input.riotId);
  if (!parsed || !input.puuid) throw new UserError("A Riot account confirmed by Riot is needed.");
  const linked = await db
    .select({ playerId: riotAccounts.playerId, displayName: players.displayName, gameName: riotAccounts.gameName, tagLine: riotAccounts.tagLine, puuid: riotAccounts.puuid })
    .from(riotAccounts)
    .leftJoin(players, eq(players.id, riotAccounts.playerId))
    .where(sql`${riotAccounts.ownerType} = 'player'`);
  const holder = linked.find((a) => a.puuid === input.puuid || normaliseRiotId(`${a.gameName}#${a.tagLine}`) === parsed);
  if (holder) throw new UserError(`This Riot account is linked to ${holder.displayName ? `the profile ${holder.displayName}` : "a profile"}: erase that member from the Accounts list instead.`);
  const names = unique((input.names ?? []).slice(0, 5)).filter((n) => n.length >= 2 && n.length <= 40);
  const subject: ErasureSubject = { kind: "former", userId: null, playerId: null, username: null, displayName: null, role: null, isAdmin: false, names, accountIds: [], puuids: [input.puuid], riotIds: [input.riotId.trim()] };
  await discoverIdentities(db, subject);
  return subject;
}

/**
 * Riot identities the person had that the links no longer show: in their own games, the player on
 * their side with the champion they played is them, whatever PUUID (another API key) or Riot ID
 * (a rename) Riot recorded then; and every name Riot recorded beside a PUUID of theirs.
 */
async function discoverIdentities(db: Db, s: ErasureSubject): Promise<void> {
  if (s.accountIds.length) {
    const own = rowsOf<{ puuid: string | null; name: string | null }>(
      await db.execute(sql`
        SELECT DISTINCT p->>'puuid' AS puuid, p->>'name' AS name
        FROM account_matches am
        JOIN match_details md ON md.match_id = am.match_id
        CROSS JOIN LATERAL jsonb_array_elements(md.participants) p
        WHERE am.account_id IN (${uuidList(s.accountIds)}) AND am.champion_id IS NOT NULL
          AND coalesce(p->>'removed', '') <> 'true'
          AND p->>'championId' = am.champion_id
          AND CASE WHEN am.team_id IS NOT NULL THEN p->>'teamId' = am.team_id::text ELSE p->>'win' = am.win::text END`),
    );
    s.puuids = unique([...s.puuids, ...own.map((r) => r.puuid)]);
    s.riotIds = unique([...s.riotIds, ...own.map((r) => (r.name?.includes("#") ? r.name : null))]);
  }
  if (s.puuids.length) {
    const named = rowsOf<{ name: string | null }>(
      await db.execute(sql`
        SELECT DISTINCT p->>'name' AS name
        FROM match_details md CROSS JOIN LATERAL jsonb_array_elements(md.participants) p
        WHERE p->>'puuid' IN (${textList(s.puuids)})`),
    );
    s.riotIds = unique([...s.riotIds, ...named.map((r) => (r.name?.includes("#") ? r.name : null))]);
  }
}

/** How the person is recognised in each kind of record. */
export function matcherFor(s: Pick<ErasureSubject, "puuids" | "riotIds" | "names">) {
  const puuids = new Set(s.puuids.filter(Boolean));
  const riotIds = new Set(s.riotIds.map((r) => normaliseRiotId(r)).filter((r): r is string => !!r));
  const gameNames = new Set([...riotIds].map((r) => r.slice(0, r.lastIndexOf("#"))).filter((n) => n.length >= 2));
  const names = new Set(s.names.map(fold).filter((n) => n.length >= 2));
  return {
    puuids,
    /** A Riot identity: their PUUID, or one of their Riot IDs (any spelling). */
    riot(p: { puuid?: string | null; name?: string | null }): boolean {
      if (p.puuid && puuids.has(p.puuid)) return true;
      const id = normaliseRiotId(p.name);
      return !!id && riotIds.has(id);
    },
    /** A name someone typed: one of their Riot IDs, or (without a tag) one of their Riot names or UNIIVERSE names. */
    typed(text: string | null | undefined): boolean {
      if (!text?.trim()) return false;
      const id = normaliseRiotId(text);
      if (id) return riotIds.has(id);
      const f = fold(text);
      return gameNames.has(f) || names.has(f);
    },
    /** A UNIIVERSE name (username, display or public name). */
    name(text: string | null | undefined): boolean {
      return !!text && names.has(fold(text));
    },
  };
}
type Matcher = ReturnType<typeof matcherFor>;

/* ---------------------------------------------------------------------------------------------
   The plan: everything that will change, read before anything is written
   --------------------------------------------------------------------------------------------- */

interface Plan {
  subject: ErasureSubject;
  exclusive: string[];
  shared: string[];
  timelinesDeleted: number;
  timelinesTouched: number;
  opponentAccounts: string[];
  audit: Array<{ id: number; set: Partial<typeof auditEvents.$inferInsert> }>;
  jobRuns: Array<{ id: number; summary: Record<string, unknown>; error: string | null }>;
  refreshStatus: Array<{ key: string; details: Record<string, unknown>; lastError: string | null }>;
  notes: NoteEdit[];
  counts: ErasureCounts;
  mentions: Mention[];
}

interface NoteEdit {
  table: string;
  key: string;
  keyColumn: string;
  column: string;
  text: string;
}

async function count(db: Db, query: SQL): Promise<number> {
  const [row] = rowsOf<{ n: number | string }>(await db.execute(query));
  return Number(row?.n ?? 0);
}

/** The person's matches: the games of their accounts and any stored game that names them. */
async function affectedMatches(db: Db, s: ErasureSubject): Promise<Array<{ match_id: string; shared: boolean; has_timeline: boolean }>> {
  const conditions: SQL[] = [];
  if (s.puuids.length) conditions.push(sql`p->>'puuid' IN (${textList(s.puuids)})`);
  if (s.riotIds.length) conditions.push(sql`p->>'name' IN (${textList(s.riotIds)})`);
  const named = conditions.length ? sql`SELECT md.match_id FROM match_details md WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(md.participants) p WHERE ${sql.join(conditions, sql` OR `)})` : null;
  const owned = s.accountIds.length ? sql`SELECT am.match_id FROM account_matches am WHERE am.account_id IN (${uuidList(s.accountIds)})` : null;
  const sources = [named, owned].filter((q): q is SQL => !!q);
  if (!sources.length) return [];
  // Shared: another linked account played it, or a bookmark or retired Ranked Development game of
  // someone else points at it. Otherwise it is only theirs.
  const otherAccount = s.accountIds.length ? sql`AND o.account_id NOT IN (${uuidList(s.accountIds)})` : sql``;
  const otherPlayer = (column: SQL) => (s.playerId ? sql`AND ${column} IS DISTINCT FROM ${s.playerId}::uuid` : sql``);
  return rowsOf(
    await db.execute(sql`
      WITH affected AS (${sql.join(sources, sql` UNION `)})
      SELECT a.match_id,
        (EXISTS (SELECT 1 FROM account_matches o WHERE o.match_id = a.match_id ${otherAccount})
          OR EXISTS (SELECT 1 FROM team_bookmarks b WHERE b.riot_match_id = a.match_id ${otherPlayer(sql`b.player_id`)})
          OR EXISTS (SELECT 1 FROM ranked_games g WHERE g.riot_match_id = a.match_id ${otherPlayer(sql`g.player_id`)})) AS shared,
        EXISTS (SELECT 1 FROM match_timelines t WHERE t.match_id = a.match_id) AS has_timeline
      FROM affected a`),
  );
}

/** Replaces their Riot IDs, and their Riot names in the old sync log lines, in every string of a JSON value. */
function scrubLogText(text: string, s: ErasureSubject): string {
  let out = text;
  for (const id of s.riotIds) out = out.replace(new RegExp(escapeRegExp(id), "giu"), REMOVED_TEXT);
  for (const id of s.riotIds) {
    const name = id.slice(0, id.lastIndexOf("#"));
    if (name) out = out.replace(new RegExp(`(lookup failed for )${escapeRegExp(name)}(:)`, "giu"), `$1${REMOVED_TEXT}$2`);
  }
  return out;
}
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function scrubLogJson(value: unknown, s: ErasureSubject): unknown {
  if (typeof value === "string") return scrubLogText(value, s);
  if (Array.isArray(value)) return value.map((v) => scrubLogJson(v, s));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, scrubLogJson(v, s)]));
  return value;
}

/** Audit details with their names replaced. */
function scrubDetails(details: Record<string, string | number | boolean | null>, m: Matcher): Record<string, string | number | boolean | null> {
  return Object.fromEntries(Object.entries(details).map(([k, v]) => [k, typeof v === "string" && (m.name(v) || m.typed(v)) ? REMOVED_TEXT : v]));
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");

/** The words that name them in free text: their names, Riot names and Riot IDs (3 characters or more), longest first. */
function nameTerms(s: ErasureSubject): string[] {
  return unique([...s.names, ...s.riotIds, ...s.riotIds.map((r) => r.slice(0, r.lastIndexOf("#")))])
    .filter((t) => t.length >= 3)
    .sort((a, b) => b.length - a.length);
}

/** Text with every whole-word mention of them replaced (letters and digits around a term mean another word). */
export function redactNames(text: string, terms: readonly string[]): string {
  let out = text;
  for (const t of terms) out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(t)}(?![\\p{L}\\p{N}_])`, "giu"), REMOVED_TEXT);
  return out;
}

/**
 * Notes other people wrote (journals, profiles, bookmarks) that name them: their names become
 * "[removed]", the rest of each note is kept.
 */
async function notesToEdit(db: Db, s: ErasureSubject): Promise<{ edits: NoteEdit[]; mentions: Mention[] }> {
  const terms = nameTerms(s);
  if (!terms.length) return { edits: [], mentions: [] };
  const places: Array<{ where: string; table: string; keyColumn: string; column: string; owner?: string }> = [
    { where: "Ranked Development notes of other players", table: "ranked_games", keyColumn: "id", column: "notes", owner: "player_id" },
    { where: "Ranked Development notes of other players", table: "ranked_games", keyColumn: "id", column: "learning", owner: "player_id" },
    { where: "Ranked Development notes of other players", table: "ranked_games", keyColumn: "id", column: "adjustment", owner: "player_id" },
    { where: "Ranked Development notes of other players", table: "ranked_blocks", keyColumn: "id", column: "closing_note", owner: "player_id" },
    { where: "Ranked Development notes of other players", table: "ranked_blocks", keyColumn: "id", column: "focus", owner: "player_id" },
    { where: "Ranked Development objectives of other players", table: "development_objectives", keyColumn: "id", column: "title", owner: "player_id" },
    { where: "Ranked Development objectives of other players", table: "development_objectives", keyColumn: "id", column: "detail", owner: "player_id" },
    { where: "Ranked Development objectives of other players", table: "development_plans", keyColumn: "id", column: "if_text", owner: "player_id" },
    { where: "Ranked Development objectives of other players", table: "development_plans", keyColumn: "id", column: "then_text", owner: "player_id" },
    { where: "Ranked focus of other players", table: "ranked_profiles", keyColumn: "player_id", column: "focus", owner: "player_id" },
    { where: "Ranked focus of other players", table: "ranked_profiles", keyColumn: "player_id", column: "notes", owner: "player_id" },
    { where: "Player profile notes", table: "players", keyColumn: "id", column: "notes", owner: "id" },
    { where: "Bookmark notes", table: "team_bookmarks", keyColumn: "id", column: "note", owner: "player_id" },
  ];
  const edits: NoteEdit[] = [];
  const counted = new Map<string, number>();
  for (const p of places) {
    const column = sql.identifier(p.column);
    const any = sql.join(terms.map((t) => sql`${column} ILIKE ${`%${escapeLike(t)}%`} ESCAPE '\'`), sql` OR `);
    const notTheirs = p.owner && s.playerId ? sql`AND ${sql.identifier(p.owner)} IS DISTINCT FROM ${s.playerId}::uuid` : sql``;
    const rows = rowsOf<{ key: string; text: string }>(await db.execute(sql`SELECT ${sql.identifier(p.keyColumn)}::text AS key, ${column} AS text FROM ${sql.identifier(p.table)} WHERE (${any}) ${notTheirs}`));
    for (const r of rows) {
      const text = redactNames(r.text, terms);
      if (text === r.text) continue;
      edits.push({ table: p.table, key: r.key, keyColumn: p.keyColumn, column: p.column, text });
      counted.set(p.where, (counted.get(p.where) ?? 0) + 1);
    }
  }
  return { edits, mentions: [...counted].map(([where, rows]) => ({ where, rows })) };
}

async function planErasure(db: Db, s: ErasureSubject): Promise<Plan> {
  const m = matcherFor(s);
  const [currentPlayers, currentUsers] = await Promise.all([db.select({ id: players.id }).from(players), db.select({ id: users.id }).from(users)]);
  const currentPlayerIds = new Set(currentPlayers.map((p) => p.id).filter((id) => id !== s.playerId));
  const currentUserIds = new Set(currentUsers.map((u) => u.id).filter((id) => id !== s.userId));

  // Riot games.
  const affected = await affectedMatches(db, s);
  const exclusive = affected.filter((a) => !a.shared).map((a) => a.match_id);
  const shared = affected.filter((a) => a.shared).map((a) => a.match_id);
  const timelinesDeleted = affected.filter((a) => !a.shared && a.has_timeline).length;
  const timelinesTouched = affected.filter((a) => a.shared && a.has_timeline).length;

  // Legacy opponent scouting.
  const opponentAccounts = (await db.select({ id: riotAccounts.id, puuid: riotAccounts.puuid, gameName: riotAccounts.gameName, tagLine: riotAccounts.tagLine }).from(riotAccounts).where(sql`${riotAccounts.ownerType} = 'opponent'`))
    .filter((a) => m.riot({ puuid: a.puuid, name: `${a.gameName}#${a.tagLine}` }))
    .map((a) => a.id);

  // The admin activity log.
  const ids = [s.userId, s.playerId, ...s.accountIds].filter((v): v is string => !!v);
  const auditTerms = unique([...s.names, ...s.riotIds]).map((t) => t.toLowerCase());
  const auditWhere = [
    ...(s.userId ? [sql`actor_user_id = ${s.userId}::uuid`] : []),
    ...(ids.length ? [sql`target_id IN (${textList(ids)})`] : []),
    ...auditTerms.flatMap((t) => [sql`strpos(lower(coalesce(actor_name, '')), ${t}) > 0`, sql`strpos(lower(coalesce(target_name, '')), ${t}) > 0`, sql`strpos(lower(details::text), ${t}) > 0`]),
  ];
  const audit: Plan["audit"] = [];
  if (auditWhere.length) {
    const rows = await db.select().from(auditEvents).where(sql.join(auditWhere, sql` OR `));
    for (const r of rows) {
      const set: Partial<typeof auditEvents.$inferInsert> = {};
      const actorIsThem = (!!s.userId && r.actorUserId === s.userId) || (m.name(r.actorName) && (!r.actorUserId || !currentUserIds.has(r.actorUserId)));
      if (actorIsThem) Object.assign(set, { actorUserId: null, actorName: ERASED_MEMBER });
      const person = r.targetType === "user" || r.targetType === "player";
      const targetIsThem = (!!r.targetId && ids.includes(r.targetId)) || (person && (m.name(r.targetName) || m.typed(r.targetName)) && (!r.targetId || (!currentUserIds.has(r.targetId) && !currentPlayerIds.has(r.targetId))));
      if (targetIsThem) Object.assign(set, { targetId: null, targetName: ERASED_MEMBER });
      const details = scrubDetails(r.details, m);
      if (JSON.stringify(details) !== JSON.stringify(r.details)) set.details = details;
      if (Object.keys(set).length) audit.push({ id: r.id, set });
    }
  }

  // Job logs written before sync logs stopped naming accounts.
  const logTerms = unique(s.riotIds).map((t) => t.toLowerCase());
  const jobRows: Plan["jobRuns"] = [];
  const refreshRows: Plan["refreshStatus"] = [];
  if (logTerms.length) {
    const where = (column: SQL) => sql.join(logTerms.map((t) => sql`strpos(lower(${column}), ${t}) > 0`), sql` OR `);
    for (const r of await db.select({ id: jobRuns.id, summary: jobRuns.summary, error: jobRuns.error }).from(jobRuns).where(sql`${where(sql`summary::text`)} OR ${where(sql`coalesce(error, '')`)}`)) {
      jobRows.push({ id: r.id, summary: scrubLogJson(r.summary, s) as Record<string, unknown>, error: r.error === null ? null : scrubLogText(r.error, s) });
    }
    for (const r of await db.select({ key: dataRefreshStatus.key, details: dataRefreshStatus.details, lastError: dataRefreshStatus.lastError }).from(dataRefreshStatus).where(sql`${where(sql`details::text`)} OR ${where(sql`coalesce(last_error, '')`)}`)) {
      refreshRows.push({ key: r.key, details: scrubLogJson(r.details, s) as Record<string, unknown>, lastError: r.lastError === null ? null : scrubLogText(r.lastError, s) });
    }
  }

  const notes = await notesToEdit(db, s);

  // What their own records add up to.
  const [games, journal, ranks, lanePartners] = await Promise.all([
    s.accountIds.length ? count(db, sql`SELECT count(*) AS n FROM account_matches WHERE account_id IN (${uuidList(s.accountIds)}) AND champion_id IS NOT NULL`) : 0,
    s.playerId ? count(db, sql`SELECT count(*) AS n FROM ranked_games WHERE player_id = ${s.playerId}::uuid`) : 0,
    s.puuids.length ? count(db, sql`SELECT count(*) AS n FROM last_known_ranks WHERE puuid IN (${textList(s.puuids)})`) : 0,
    shared.length ? countLanePartners(db, s, shared) : 0,
  ]);

  return {
    subject: s,
    exclusive,
    shared,
    timelinesDeleted,
    timelinesTouched,
    opponentAccounts,
    audit,
    jobRuns: jobRows,
    refreshStatus: refreshRows,
    notes: notes.edits,
    counts: {
      account: !!s.userId,
      profile: !!s.playerId,
      riotAccounts: s.accountIds.length,
      games,
      journalEntries: journal,
      gamesDeleted: exclusive.length,
      gamesDeidentified: shared.length,
      timelines: timelinesDeleted + timelinesTouched,
      lanePartners,
      notes: notes.edits.length,
      auditEntries: audit.length,
      jobLogs: jobRows.length + refreshRows.length,
      otherRecords: ranks + opponentAccounts.length,
    },
    mentions: notes.mentions,
  };
}

/** Other members' games (and retired Ranked Development games) whose lane opponent was the person. */
function lanePartnerWhere(s: ErasureSubject): SQL {
  const conditions: SQL[] = [];
  if (s.puuids.length) conditions.push(sql`p->>'puuid' IN (${textList(s.puuids)})`);
  if (s.riotIds.length) conditions.push(sql`p->>'name' IN (${textList(s.riotIds)})`);
  return conditions.length ? sql`(${sql.join(conditions, sql` OR `)})` : sql`false`;
}

async function countLanePartners(db: Db, s: ErasureSubject, shared: string[]): Promise<number> {
  const notTheirs = s.accountIds.length ? sql`AND am.account_id NOT IN (${uuidList(s.accountIds)})` : sql``;
  return count(
    db,
    sql`SELECT count(*) AS n FROM account_matches am
        WHERE am.match_id IN (${textList(shared)}) ${notTheirs} AND am.enemy_champion_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM match_details md CROSS JOIN LATERAL jsonb_array_elements(md.participants) p
                      WHERE md.match_id = am.match_id AND ${lanePartnerWhere(s)} AND p->>'championId' = am.enemy_champion_id
                        AND (am.team_id IS NULL OR p->>'teamId' <> am.team_id::text))`,
  );
}

/* ---------------------------------------------------------------------------------------------
   Preview and erasure
   --------------------------------------------------------------------------------------------- */

/** What an erasure of this person would change, without changing anything. */
export async function previewErasure(db: Db, subject: ErasureSubject): Promise<ErasurePreview> {
  const plan = await planErasure(db, subject);
  return { subject: { kind: subject.kind, username: subject.username, displayName: subject.displayName, riotIds: subject.riotIds }, counts: plan.counts, mentions: plan.mentions };
}

/**
 * The rules that protect the site: nobody erases themselves, the Owner account is never erased,
 * an administrator only by the Owner, and never the last administrator able to sign in.
 */
export async function guardErasure(db: Db, actorUserId: string | null, s: ErasureSubject): Promise<void> {
  if (!s.userId) return;
  if (actorUserId && actorUserId === s.userId) throw new UserError("You cannot erase your own account.");
  if (s.role === "owner") throw new UserError("The Owner account cannot be erased.");
  if (s.isAdmin) {
    const actor = actorUserId ? await getUser(db, actorUserId) : null;
    if (actorUserId && actor?.role !== "owner") throw new UserError("Only the Owner can erase an administrator. Remove their administrator access first, or ask the Owner.");
    const [row] = rowsOf<{ n: number | string }>(await db.execute(sql`SELECT count(*) AS n FROM users WHERE (role = 'owner' OR is_admin) AND is_active AND password_hash IS NOT NULL AND id <> ${s.userId}::uuid`));
    if (Number(row?.n ?? 0) === 0) throw new UserError("You cannot erase the last active administrator.");
  }
}

export interface ErasureResult {
  reference: string;
  counts: ErasureCounts;
  mentions: Mention[];
}

/** The keyed tokens an erasure record keeps for this person (server/privacy/tokens.ts). */
export function tokensFor(s: ErasureSubject): string[] {
  return unique([
    s.userId ? tagged("user", s.userId) : null,
    s.playerId ? tagged("player", s.playerId) : null,
    ...s.accountIds.map((id) => tagged("account", id)),
    ...s.puuids.map((p) => tagged("puuid", p)),
    ...s.riotIds.map((r) => normaliseRiotId(r)).filter((r): r is string => !!r).map((r) => tagged("riotid", r)),
  ]);
}

/**
 * Erases the person in one transaction. A member is looked up again inside it, so anything changed
 * since the preview is included. `record: false` re-applies an existing erasure (reconciling a
 * restored backup) without making a new record.
 */
export async function eraseSubject(db: Db, actorUserId: string | null, target: { userId?: string | null; playerId?: string | null } | ErasureSubject, options: { record?: boolean; reference?: string } = {}): Promise<ErasureResult> {
  const record = options.record !== false;
  const result = await db.transaction(async (tx) => {
    const s = "kind" in target ? target : await memberSubject(tx, target);
    if (s.kind === "member") await guardErasure(tx, actorUserId, s);
    const plan = await planErasure(tx, s);
    let reference = options.reference ?? "";
    if (record) {
      for (let attempt = 0; attempt < 5 && !reference; attempt++) {
        const candidate = newReference();
        const [taken] = await tx.select({ id: privacyErasures.id }).from(privacyErasures).where(eq(privacyErasures.reference, candidate));
        if (!taken) reference = candidate;
      }
      await tx.insert(privacyErasures).values({ reference, tokens: tokensFor(s), keyCheck: keyCheckOf() });
    }
    await applyPlan(tx, plan);
    return { reference, counts: plan.counts, mentions: plan.mentions };
  });
  forgetErasureCache();
  return result;
}

async function applyPlan(tx: Db, plan: Plan): Promise<void> {
  const s = plan.subject;
  const m = matcherFor(s);

  // 1. Riot games: lane opponents forgotten first (it needs their entries), then shared games
  //    de-identified and their games alone deleted.
  if (plan.shared.length) {
    const notTheirs = s.accountIds.length ? sql`AND am.account_id NOT IN (${uuidList(s.accountIds)})` : sql``;
    await tx.execute(sql`
      UPDATE account_matches am SET enemy_champion_id = NULL
      WHERE am.match_id IN (${textList(plan.shared)}) ${notTheirs} AND am.enemy_champion_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM match_details md CROSS JOIN LATERAL jsonb_array_elements(md.participants) p
                    WHERE md.match_id = am.match_id AND ${lanePartnerWhere(s)} AND p->>'championId' = am.enemy_champion_id
                      AND (am.team_id IS NULL OR p->>'teamId' <> am.team_id::text))`);
    await tx.execute(sql`
      UPDATE ranked_games g SET enemy_champion_id = NULL
      WHERE g.riot_match_id IN (${textList(plan.shared)}) AND g.enemy_champion_id IS NOT NULL ${s.playerId ? sql`AND g.player_id <> ${s.playerId}::uuid` : sql``}
        AND EXISTS (SELECT 1 FROM match_details md CROSS JOIN LATERAL jsonb_array_elements(md.participants) p
                    JOIN account_matches am ON am.match_id = md.match_id
                    JOIN riot_accounts ra ON ra.id = am.account_id AND ra.player_id = g.player_id
                    WHERE md.match_id = g.riot_match_id AND ${lanePartnerWhere(s)} AND p->>'championId' = g.enemy_champion_id
                      AND (am.team_id IS NULL OR p->>'teamId' <> am.team_id::text))`);
    const removedPuuids = new Set(s.puuids);
    for (let i = 0; i < plan.shared.length; i += 100) {
      const batch = plan.shared.slice(i, i + 100);
      for (const row of await tx.select({ matchId: matchDetails.matchId, participants: matchDetails.participants }).from(matchDetails).where(inArray(matchDetails.matchId, batch))) {
        const theirs = row.participants.filter((p: MatchParticipantDetail) => m.riot(p));
        if (!theirs.length) continue;
        for (const p of theirs) if (p.puuid) removedPuuids.add(p.puuid);
        await tx.update(matchDetails).set({ participants: redactParticipants(row.participants, (p) => m.riot(p)).participants }).where(eq(matchDetails.matchId, row.matchId));
      }
    }
    const gone = [...removedPuuids];
    if (gone.length)
      await tx.execute(sql`
        UPDATE match_timelines SET
          participants = (SELECT coalesce(jsonb_agg(x ORDER BY ord), '[]'::jsonb) FROM jsonb_array_elements(participants) WITH ORDINALITY t(x, ord) WHERE NOT (x->>'puuid' IN (${textList(gone)}))),
          frames = CASE WHEN frames IS NULL THEN NULL ELSE jsonb_set(frames, '{p}', coalesce(frames->'p', '{}'::jsonb) - ARRAY[${textList(gone)}]::text[]) END
        WHERE match_id IN (${textList(plan.shared)})`);
    // The others' stored summaries of these games included their figures (team kills and damage):
    // copied again from the de-identified records.
    await tx.execute(sql`UPDATE account_matches SET summarised_at = NULL WHERE match_id IN (${textList(plan.shared)})`);
    await summariseMatches(tx, { matchIds: plan.shared, maxBatches: 50 });
  }
  if (plan.exclusive.length) {
    for (let i = 0; i < plan.exclusive.length; i += 500) {
      const batch = plan.exclusive.slice(i, i + 500);
      await tx.execute(sql`DELETE FROM match_timelines WHERE match_id IN (${textList(batch)})`);
      await tx.execute(sql`DELETE FROM match_details WHERE match_id IN (${textList(batch)})`);
      await tx.execute(sql`DELETE FROM team_bookmarks WHERE riot_match_id IN (${textList(batch)})`);
    }
  }

  // 2. The other Riot-identity rows.
  if (s.puuids.length) {
    await tx.delete(lastKnownRanks).where(inArray(lastKnownRanks.puuid, s.puuids));
  }
  if (plan.opponentAccounts.length) await tx.delete(riotAccounts).where(inArray(riotAccounts.id, plan.opponentAccounts));

  // 3. Other players' records: the retired Ranked Development's "not played with" lists, and notes.
  if (s.playerId) await tx.execute(sql`UPDATE ranked_games SET not_played_with = not_played_with - ${s.playerId} WHERE not_played_with @> jsonb_build_array(${s.playerId}::text)`);

  for (const e of plan.notes) await tx.execute(sql`UPDATE ${sql.identifier(e.table)} SET ${sql.identifier(e.column)} = ${e.text} WHERE ${sql.identifier(e.keyColumn)}::text = ${e.key}`);

  // 4. Records of their account kept by others.
  for (const r of plan.audit) await tx.update(auditEvents).set(r.set).where(eq(auditEvents.id, r.id));
  for (const r of plan.jobRuns) await tx.update(jobRuns).set({ summary: r.summary, error: r.error }).where(eq(jobRuns.id, r.id));
  for (const r of plan.refreshStatus) await tx.update(dataRefreshStatus).set({ details: r.details, lastError: r.lastError }).where(eq(dataRefreshStatus.key, r.key));
  if (s.userId) {
    await tx.update(activationCodes).set({ createdByUserId: null }).where(eq(activationCodes.createdByUserId, s.userId));
    await tx.update(invites).set({ createdByUserId: null }).where(eq(invites.createdByUserId, s.userId));
    await tx.update(invites).set({ usedByUserId: null }).where(eq(invites.usedByUserId, s.userId));
    await tx.delete(invites).where(eq(invites.userId, s.userId));
  }
  if (s.playerId) await tx.delete(invites).where(eq(invites.playerId, s.playerId));
  const leases = [...s.accountIds.map(accountSyncLeaseKey), ...(s.playerId ? [viewRefreshLeaseKey(s.playerId), figuresCatchUpLeaseKey(s.playerId)] : [])];
  if (leases.length) await tx.delete(appSettings).where(inArray(appSettings.key, leases));

  // 5. The account and the profile: sessions, picture, pools, card, banner, Riot accounts with their
  //    games, mastery and rank history, and the retired Ranked Development records all go with
  //    them (foreign keys cascade).
  if (s.userId) await tx.delete(users).where(eq(users.id, s.userId));
  if (s.playerId) await tx.delete(players).where(eq(players.id, s.playerId));
  // Failed sign-ins are kept as keyed hashes for 15 minutes; older ones are pruned now.
  await pruneAuthFailures(tx);
}
