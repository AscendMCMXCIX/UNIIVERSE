"use server";

import { publicErrorMessage } from "@/server/errors";
import { revalidatePath } from "next/cache";
import { getAppDb } from "@/server/bootstrap";
import { requirePermission } from "@/server/auth/session";
import { UserError } from "@/server/repositories/users";
import { recordAudit } from "@/server/audit/log";
import { parseRiotId } from "@/server/accounts/repository";
import { defaultPlatform } from "@/server/auth/signup";
import { createVerificationClient } from "@/server/riot/verify-identity";
import { RiotApiError } from "@/server/riot/api/client";
import { clearLocalCaches, invalidateCache } from "@/server/observability/cache";
import { invalidatePublicTeam } from "@/server/public/team";
import { eraseSubject, formerMemberSubject, guardErasure, memberSubject, previewErasure, type ErasureCounts, type ErasurePreview, type ErasureSubject, type Mention } from "@/server/privacy/erasure";
import { exportErasures, importErasures, listErasureRecords, parseErasureFile, releaseErasure, type ErasureExport, type ErasureRecordView } from "@/server/privacy/ledger";
import { reconcileErasures, type ReconcileResult } from "@/server/privacy/reconcile";
import { normaliseRiotId } from "@/server/privacy/tokens";

/*
  Personal data (Admin Mode → Users & Permissions): permanent erasure of a member or of what a
  former member left, the erasure records, releasing a person's Riot accounts when they come back,
  and re-applying the records after a backup is restored. Administrators only: every action checks
  the caller first; the rules themselves live in server/privacy.
*/

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

const fail = (err: unknown): Result<never> => {
  if (err instanceof UserError || (err as Error).name === "NotAuthorizedError") return { ok: false, error: (err as Error).message };
  // Never the raw error: a query's error carries its parameters, here the person's identifiers,
  // which no erasure would reach in the host's logs. publicErrorMessage logs its kind, code and
  // statement without them.
  publicErrorMessage(err);
  return { ok: false, error: "Something went wrong. Nothing was changed. Please try again." };
};

/** After an erasure every page, cache and public view must stop showing the person at once (other server instances follow within their cache times). */
function afterErasure() {
  invalidateCache("team");
  invalidateCache("shell-facts");
  invalidatePublicTeam();
  clearLocalCaches();
  revalidatePath("/", "layout");
}

export interface ErasureCheck extends ErasurePreview {
  /** What the administrator must type to confirm: the username, else the profile name, else the Riot ID. */
  confirmWith: string;
}

const confirmationFor = (s: ErasureSubject): string => s.username ?? s.displayName ?? s.riotIds[0] ?? "";
const same = (typed: string, expected: string) => typed.trim().normalize("NFKC").toLowerCase() === expected.trim().normalize("NFKC").toLowerCase() && expected.trim() !== "";

/** What erasing this account or profile would change. Nothing is changed. */
export async function previewErasureAction(target: { userId?: string | null; playerId?: string | null }): Promise<Result<ErasureCheck>> {
  try {
    const session = await requirePermission("manage-users");
    const db = await getAppDb();
    const subject = await memberSubject(db, { userId: target.userId ?? null, playerId: target.playerId ?? null });
    await guardErasure(db, session.userId, subject);
    return { ok: true, data: { ...(await previewErasure(db, subject)), confirmWith: confirmationFor(subject) } };
  } catch (err) {
    return fail(err);
  }
}

export interface ErasureDone {
  reference: string;
  counts: ErasureCounts;
  mentions: Mention[];
}

function auditDetails(kind: ErasureSubject["kind"], counts: ErasureCounts) {
  return { kind, riotAccounts: counts.riotAccounts, gamesDeleted: counts.gamesDeleted, gamesDeidentified: counts.gamesDeidentified, notes: counts.notes, auditEntries: counts.auditEntries };
}

/** Permanently erases a member. `confirmation` must be what previewErasureAction asked for. */
export async function eraseAction(target: { userId?: string | null; playerId?: string | null }, confirmation: string): Promise<Result<ErasureDone>> {
  try {
    const session = await requirePermission("manage-users");
    const db = await getAppDb();
    const subject = await memberSubject(db, { userId: target.userId ?? null, playerId: target.playerId ?? null });
    if (!same(confirmation, confirmationFor(subject))) return { ok: false, error: "The confirmation does not match. Nothing was erased." };
    const done = await eraseSubject(db, session.userId, { userId: subject.userId, playerId: subject.playerId });
    await recordAudit(db, session, { action: "privacy.erase", target: { type: "erasure", name: done.reference }, details: auditDetails("member", done.counts) });
    afterErasure();
    return { ok: true, data: done };
  } catch (err) {
    return fail(err);
  }
}

/** A former member's Riot account, as Riot confirms it now (never a PUUID sent by the browser). */
async function formerSubject(riotIdInput: string, namesInput: string): Promise<{ db: Awaited<ReturnType<typeof getAppDb>>; subject: ErasureSubject }> {
  const parsed = parseRiotId(riotIdInput);
  if (!parsed) throw new UserError("Enter the Riot ID exactly as shown in the League client: GameName#TAG.");
  const client = createVerificationClient();
  if (!client) throw new UserError("Riot is not available on this server, and a former member is identified through Riot.");
  let account: { puuid: string; gameName?: string; tagLine?: string };
  try {
    account = await client.accountByRiotId(defaultPlatform(), parsed.gameName, parsed.tagLine);
  } catch (err) {
    if (err instanceof RiotApiError && err.status === 404) throw new UserError(`Riot has no account named ${parsed.gameName}#${parsed.tagLine}. Check the spelling and the #TAG.`);
    throw new UserError("Riot did not answer just now. Try again in a minute.");
  }
  const riotId = `${account.gameName?.trim() || parsed.gameName}#${account.tagLine?.trim() || parsed.tagLine}`;
  const names = namesInput
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  const db = await getAppDb();
  return { db, subject: await formerMemberSubject(db, { puuid: account.puuid, riotId, names }) };
}

/** What erasing a former member's traces would change (identified by a Riot account Riot confirms). */
export async function previewFormerErasureAction(input: { riotId: string; names: string }): Promise<Result<ErasureCheck>> {
  try {
    await requirePermission("manage-users");
    const { db, subject } = await formerSubject(String(input.riotId ?? ""), String(input.names ?? ""));
    return { ok: true, data: { ...(await previewErasure(db, subject)), confirmWith: confirmationFor(subject) } };
  } catch (err) {
    return fail(err);
  }
}

/** Permanently erases what a former member left; `confirmation` is their Riot ID. */
export async function eraseFormerAction(input: { riotId: string; names: string; confirmation: string }): Promise<Result<ErasureDone>> {
  try {
    const session = await requirePermission("manage-users");
    const { db, subject } = await formerSubject(String(input.riotId ?? ""), String(input.names ?? ""));
    if (normaliseRiotId(input.confirmation) !== normaliseRiotId(confirmationFor(subject))) return { ok: false, error: "The confirmation does not match. Nothing was erased." };
    const done = await eraseSubject(db, session.userId, subject);
    await recordAudit(db, session, { action: "privacy.erase", target: { type: "erasure", name: done.reference }, details: auditDetails("former", done.counts) });
    afterErasure();
    return { ok: true, data: done };
  } catch (err) {
    return fail(err);
  }
}

/** The erasure records (reference, date, whether this deployment's key can apply them, release). */
export async function listErasuresAction(): Promise<Result<ErasureRecordView[]>> {
  try {
    await requirePermission("manage-users");
    return { ok: true, data: await listErasureRecords(await getAppDb()) };
  } catch (err) {
    return fail(err);
  }
}

/** The person asked to come back: their Riot accounts may be linked again. `confirmation` is the reference. */
export async function releaseErasureAction(reference: string, confirmation: string): Promise<Result> {
  try {
    const session = await requirePermission("manage-users");
    if (String(confirmation).trim().toUpperCase() !== String(reference).trim().toUpperCase()) return { ok: false, error: "Type the reference to confirm." };
    const db = await getAppDb();
    if (!(await releaseErasure(db, String(reference).trim().toUpperCase()))) return { ok: false, error: "No erasure with that reference is waiting to be released." };
    await recordAudit(db, session, { action: "privacy.release", target: { type: "erasure", name: String(reference).trim().toUpperCase() } });
    revalidatePath("/admin/people/privacy");
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

/** Applies every erasure record to the database as it is now (after restoring a backup: import the records first). */
export async function reconcileErasuresAction(): Promise<Result<ReconcileResult>> {
  try {
    const session = await requirePermission("manage-users");
    const db = await getAppDb();
    const result = await reconcileErasures(db, { mode: "full" });
    await recordAudit(db, session, { action: "privacy.reconcile", details: { records: result.records, unusable: result.unusable, people: result.people, traces: result.traces } });
    if (result.people || result.traces) afterErasure();
    return { ok: true, data: result };
  } catch (err) {
    return fail(err);
  }
}

/** The records file to keep beside offline backups: keyed tokens only, nothing that names anyone. */
export async function exportErasuresAction(): Promise<Result<ErasureExport>> {
  try {
    const session = await requirePermission("manage-users");
    const db = await getAppDb();
    const file = await exportErasures(db);
    await recordAudit(db, session, { action: "privacy.export", details: { records: file.records.length } });
    return { ok: true, data: file };
  } catch (err) {
    return fail(err);
  }
}

/** Adds the records of an exported file (a restored backup lacks later ones), then applies them all. */
export async function importErasuresAction(text: string): Promise<Result<{ added: number; updated: number; reconcile: ReconcileResult }>> {
  try {
    const session = await requirePermission("manage-users");
    if (typeof text !== "string" || text.length > 2_000_000) return { ok: false, error: "That file is not an erasure records file." };
    let file: unknown;
    try {
      file = JSON.parse(text);
    } catch {
      return { ok: false, error: "That file is not an erasure records file." };
    }
    try {
      parseErasureFile(file);
    } catch (err) {
      return { ok: false, error: publicErrorMessage(err) };
    }
    const db = await getAppDb();
    const imported = await importErasures(db, file);
    const reconcile = await reconcileErasures(db, { mode: "full" });
    await recordAudit(db, session, { action: "privacy.import", details: { added: imported.added, updated: imported.updated, people: reconcile.people, traces: reconcile.traces } });
    afterErasure();
    return { ok: true, data: { ...imported, reconcile } };
  } catch (err) {
    return fail(err);
  }
}
