"use server";

import { getAppDb } from "@/server/bootstrap";
import { NotAuthorizedError, requireSession } from "@/server/auth/session";
import { hasPermission } from "@/server/auth/permissions";
import { queryAudit, type AuditEntry } from "@/server/audit/log";
import { auditQueryFor, readAuditFilters } from "@/server/audit/filters";

/* Audit Logs → Load older: the next 50 entries after the last one shown, with the page's filters. */

const AUDIT_PAGE = 50;

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function loadOlderAuditAction(filters: Record<string, unknown>, before: { at: string; id: number }): Promise<Result<{ entries: AuditEntry[]; more: boolean }>> {
  try {
    const session = await requireSession();
    if (!(["manage-users", "manage-branding", "manage-data"] as const).some((p) => hasPermission(session, p))) throw new NotAuthorizedError();
    const at = new Date(typeof before?.at === "string" ? before.at : NaN);
    if (Number.isNaN(at.getTime()) || !Number.isInteger(before?.id)) return { ok: false, error: "Reload the page to see older entries." };
    const db = await getAppDb();
    const q = await auditQueryFor(db, readAuditFilters(filters && typeof filters === "object" ? filters : {}));
    const rows = await queryAudit(db, { ...q, before: { at, id: before.id }, limit: AUDIT_PAGE + 1 });
    return { ok: true, data: { entries: rows.slice(0, AUDIT_PAGE), more: rows.length > AUDIT_PAGE } };
  } catch (err) {
    return { ok: false, error: (err as Error).name === "NotAuthorizedError" ? (err as Error).message : "Something went wrong. Please try again." };
  }
}

/** A person view's Activity: the last 10 entries they made or that were about them (administrators only). */
export async function personActivityAction(person: { userId?: string | null; playerId?: string | null }): Promise<Result<{ entries: AuditEntry[] }>> {
  try {
    const session = await requireSession();
    if (!hasPermission(session, "manage-users")) throw new NotAuthorizedError();
    const userId = typeof person?.userId === "string" ? person.userId : null;
    const playerId = typeof person?.playerId === "string" ? person.playerId : null;
    if (!userId && !playerId) return { ok: false, error: "Choose a person." };
    const entries = await queryAudit(await getAppDb(), { person: { userId, playerId }, limit: 10 });
    return { ok: true, data: { entries } };
  } catch (err) {
    return { ok: false, error: (err as Error).name === "NotAuthorizedError" ? (err as Error).message : "Something went wrong. Please try again." };
  }
}
