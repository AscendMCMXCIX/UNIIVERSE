import { and, eq, gt } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { draftPresence, drafts, users } from "@/server/db/schema";

export interface DraftLiveState {
  version: number;
  status: "in_progress" | "completed" | "abandoned";
  /** The draft's creator, who controls it (admins may override). */
  ownerUserId: string | null;
  ownerLabel: string | null;
  viewers: Array<{ clientId: string; userId: string | null; label: string; lastSeenAt: string }>;
}

const PRESENCE_WINDOW_MS = 45_000;

const ownerLabels = new Map<string, string>();

/**
 * Cheap poll used by the live stream: version, owner and current viewers. Two small
 * indexed queries per poll (the owner's name is remembered per process), so a room full of
 * viewers costs the database a few row reads a second, not a page render.
 */
export async function getDraftLiveState(db: Db, draftId: string): Promise<DraftLiveState | null> {
  const since = new Date(Date.now() - PRESENCE_WINDOW_MS);
  const [rows, viewers] = await Promise.all([
    db.select({ version: drafts.version, status: drafts.status, ownerUserId: drafts.createdByUserId }).from(drafts).where(eq(drafts.id, draftId)),
    db.select().from(draftPresence).where(and(eq(draftPresence.draftId, draftId), gt(draftPresence.lastSeenAt, since))),
  ]);
  const row = rows[0];
  if (!row) return null;
  let ownerLabel: string | null = null;
  if (row.ownerUserId) {
    ownerLabel = ownerLabels.get(row.ownerUserId) ?? null;
    if (!ownerLabel) {
      const [u] = await db.select({ name: users.displayName }).from(users).where(eq(users.id, row.ownerUserId));
      ownerLabel = u?.name ?? "a former member";
      ownerLabels.set(row.ownerUserId, ownerLabel);
    }
  }
  return {
    version: row.version,
    status: row.status,
    ownerUserId: row.ownerUserId,
    ownerLabel,
    viewers: viewers.map((v) => ({ clientId: v.clientId, userId: v.userId, label: v.label, lastSeenAt: v.lastSeenAt.toISOString() })),
  };
}

export async function touchPresence(db: Db, draftId: string, clientId: string, userId: string | null, label: string): Promise<void> {
  await db
    .insert(draftPresence)
    .values({ draftId, clientId, userId, label, lastSeenAt: new Date() })
    .onConflictDoUpdate({ target: [draftPresence.draftId, draftPresence.clientId], set: { lastSeenAt: new Date(), label, userId } });
}

export async function removePresence(db: Db, draftId: string, clientId: string): Promise<void> {
  await db.delete(draftPresence).where(and(eq(draftPresence.draftId, draftId), eq(draftPresence.clientId, clientId)));
}
