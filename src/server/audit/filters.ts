import { AUDIT_CATEGORIES, isAuditCategory, type AuditCategory } from "@/domain/audit";
import type { Db } from "@/server/db/types";
import { getUser } from "@/server/repositories/users";
import type { AuditQuery } from "./log";

/*
  Audit Logs' filters, as the address holds them (?category=, ?person=, ?from=, ?to=) and as
  "Load older" sends them back. Anything malformed is ignored rather than refused: a filter only
  ever narrows the list.
*/

export interface AuditFilters {
  category: AuditCategory | null;
  /** An account id. */
  person: string | null;
  /** Calendar days, YYYY-MM-DD, in UTC: `to` includes its whole day. */
  from: string | null;
  to: string | null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const day = (v: unknown) => {
  const s = one(v);
  return typeof s === "string" && DAY.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) ? s : null;
};

export function readAuditFilters(sp: Record<string, unknown>): AuditFilters {
  const category = one(sp.category);
  const person = one(sp.person);
  return { category: isAuditCategory(category) ? category : null, person: typeof person === "string" && UUID.test(person) ? person : null, from: day(sp.from), to: day(sp.to) };
}

/** The query for these filters (the person's profile included, so entries about their player count too). */
export async function auditQueryFor(db: Db, f: AuditFilters): Promise<AuditQuery> {
  const user = f.person ? await getUser(db, f.person) : null;
  return {
    actions: f.category ? AUDIT_CATEGORIES[f.category].actions : undefined,
    person: f.person ? { userId: f.person, playerId: user?.playerId ?? null } : null,
    from: f.from ? new Date(`${f.from}T00:00:00Z`) : null,
    to: f.to ? new Date(Date.parse(`${f.to}T00:00:00Z`) + 86_400_000) : null,
  };
}
