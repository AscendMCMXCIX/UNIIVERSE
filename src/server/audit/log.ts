import { and, desc, eq, gte, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { auditEvents, permissionPresets, players, users } from "@/server/db/schema";
import type { AuditAction } from "@/domain/audit";
import { log } from "@/server/observability/log";

/*
  The admin activity record: who did what to which account or setting, and when. Written by the
  server actions after a change succeeds; read by Admin Mode → Audit Logs (and the dashboard's
  latest few). Rows are only ever inserted, with one exception: a personal-data erasure renames the
  erased person "Erased member" in the rows that named them, and clears every text in the details
  of the rows about them by id; rows they only made keep their details, apart from values that name
  them (server/privacy/erasure.ts). Details are short labels (a level
  name, a job key), never a password, a token or a free-text value someone typed: keys that look
  like secrets are dropped and values are cut short.
*/

export interface AuditActor {
  userId: string | null;
  username: string | null;
}

export interface AuditInput {
  action: AuditAction;
  target?: { type: "user" | "player" | "preset" | "branding" | "resource" | "job" | "erasure" | "matchup-note"; id?: string | null; name?: string | null };
  details?: Record<string, string | number | boolean | null | undefined>;
}

const SECRET_KEY = /pass|token|secret|key|hash|code/i;
const MAX_VALUE = 80;

/** Details safe to keep: no secret-looking keys, short values only. */
export function safeDetails(details: AuditInput["details"]): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(details ?? {})) {
    if (v === undefined || SECRET_KEY.test(k)) continue;
    out[k] = typeof v === "string" ? v.slice(0, MAX_VALUE) : v;
  }
  return out;
}

/** A name for the record, or null: a lookup never stops the action it describes. */
async function nameOf(query: () => Promise<Array<{ name: string }>>): Promise<string | null> {
  try {
    return (await query())[0]?.name ?? null;
  } catch {
    return null;
  }
}

/** A user's username, for naming them in the record (before a delete, while it still exists). */
export async function auditUserName(db: Db, userId: string): Promise<string | null> {
  return nameOf(() => db.select({ name: users.username }).from(users).where(eq(users.id, userId)).limit(1));
}

/** A player profile's display name, for naming it in the record. */
export async function auditPlayerName(db: Db, playerId: string): Promise<string | null> {
  return nameOf(() => db.select({ name: players.displayName }).from(players).where(eq(players.id, playerId)).limit(1));
}

/** An access level's name, for naming it in the record. */
export async function auditPresetName(db: Db, presetId: string): Promise<string | null> {
  return nameOf(() => db.select({ name: permissionPresets.name }).from(permissionPresets).where(eq(permissionPresets.id, presetId)).limit(1));
}

/**
 * Records one action. Never throws: the change it describes has already happened, so a failed
 * write is logged as an error instead of reporting the change as failed.
 */
export async function recordAudit(db: Db, actor: AuditActor, input: AuditInput): Promise<void> {
  try {
    const target = input.target;
    const targetName = target?.name ?? (target?.type === "user" && target.id ? await auditUserName(db, target.id) : null);
    await db.insert(auditEvents).values({
      actorUserId: actor.userId,
      actorName: actor.username,
      action: input.action,
      targetType: target?.type ?? null,
      targetId: target?.id ?? null,
      targetName,
      details: safeDetails(input.details),
    });
  } catch (err) {
    log("error", "audit.write_failed", { action: input.action, error: (err as Error).message });
  }
}

export interface AuditEntry {
  id: number;
  at: Date;
  actorName: string | null;
  action: string;
  targetType: string | null;
  targetName: string | null;
  details: Record<string, string | number | boolean | null>;
}

export interface AuditQuery {
  /** At most this many (Audit Logs pages by 50). */
  limit?: number;
  /** Only these actions (a category of Audit Logs). */
  actions?: readonly string[];
  /** Only entries this account made or that were about it (or about its player profile). */
  person?: { userId: string | null; playerId: string | null } | null;
  /** Only entries at or after `from` and before `to`. */
  from?: Date | null;
  to?: Date | null;
  /** Keyset: only entries older than this one (the last row of the page before). */
  before?: { at: Date; id: number } | null;
}

/** The newest recorded actions first, filtered; `before` continues after the last row of the page before. */
export async function queryAudit(db: Db, q: AuditQuery = {}): Promise<AuditEntry[]> {
  const where: SQL[] = [];
  if (q.actions) where.push(inArray(auditEvents.action, [...q.actions]));
  if (q.person) {
    const ids = [q.person.userId, q.person.playerId].filter((v): v is string => !!v);
    const byActor = q.person.userId ? [eq(auditEvents.actorUserId, q.person.userId)] : [];
    where.push(ids.length ? or(...byActor, inArray(auditEvents.targetId, ids))! : sql`false`);
  }
  if (q.from) where.push(gte(auditEvents.at, q.from));
  if (q.to) where.push(lt(auditEvents.at, q.to));
  // Ordered and continued at the millisecond a Date carries, so a cursor never skips a row.
  const atMs = sql<Date>`date_trunc('milliseconds', ${auditEvents.at})`;
  if (q.before) where.push(sql`(${atMs}, ${auditEvents.id}) < (${q.before.at.toISOString()}::timestamptz, ${q.before.id})`);
  return db
    .select({ id: auditEvents.id, at: auditEvents.at, actorName: auditEvents.actorName, action: auditEvents.action, targetType: auditEvents.targetType, targetName: auditEvents.targetName, details: auditEvents.details })
    .from(auditEvents)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(atMs), desc(auditEvents.id))
    .limit(Math.min(Math.max(1, q.limit ?? 50), 200));
}

/** The newest recorded actions first, optionally only these actions (a category of Audit Logs). */
export async function listAudit(db: Db, limit = 100, actions?: readonly string[]): Promise<AuditEntry[]> {
  return queryAudit(db, { limit, actions });
}
