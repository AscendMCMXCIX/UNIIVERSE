import { desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { auditEvents, permissionPresets, players, users } from "@/server/db/schema";
import type { AuditAction } from "@/domain/audit";
import { log } from "@/server/observability/log";

/*
  The admin activity record: who did what to which account or setting, and when. Written by the
  server actions after a change succeeds; read by Admin Mode → Audit Logs (and the dashboard's
  latest few). Rows are only ever inserted, with one exception: a personal-data erasure renames the
  erased person "Erased member" in the rows that named them (server/privacy/erasure.ts). Details are short labels (a level name, a job key), never a password, a token or a
  free-text value someone typed: keys that look like secrets are dropped and values are cut short.
*/

export interface AuditActor {
  userId: string | null;
  username: string | null;
}

export interface AuditInput {
  action: AuditAction;
  target?: { type: "user" | "player" | "preset" | "branding" | "resource" | "job" | "erasure"; id?: string | null; name?: string | null };
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
  at: Date;
  actorName: string | null;
  action: string;
  targetType: string | null;
  targetName: string | null;
  details: Record<string, string | number | boolean | null>;
}

/** The newest recorded actions first, optionally only these actions (a category of Audit Logs). */
export async function listAudit(db: Db, limit = 100, actions?: readonly string[]): Promise<AuditEntry[]> {
  return db
    .select({ at: auditEvents.at, actorName: auditEvents.actorName, action: auditEvents.action, targetType: auditEvents.targetType, targetName: auditEvents.targetName, details: auditEvents.details })
    .from(auditEvents)
    .where(actions ? inArray(auditEvents.action, [...actions]) : undefined)
    .orderBy(desc(auditEvents.at), desc(auditEvents.id))
    .limit(limit);
}
