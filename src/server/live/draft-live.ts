import { and, eq, gt } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { draftPresence, drafts, users } from "@/server/db/schema";

export interface DraftLiveState {
  version: number;
  status: "in_progress" | "completed" | "abandoned";
  controllerUserId: string | null;
  controllerLabel: string | null;
  viewers: Array<{ clientId: string; userId: string | null; label: string; lastSeenAt: string }>;
}

const PRESENCE_WINDOW_MS = 45_000;

/** Cheap poll used by the live stream: version, controller and current viewers. */
export async function getDraftLiveState(db: Db, draftId: string): Promise<DraftLiveState | null> {
  const [row] = await db.select({ version: drafts.version, status: drafts.status, controllerUserId: drafts.controllerUserId }).from(drafts).where(eq(drafts.id, draftId));
  if (!row) return null;
  let controllerLabel: string | null = null;
  if (row.controllerUserId) {
    const [u] = await db.select({ name: users.displayName }).from(users).where(eq(users.id, row.controllerUserId));
    controllerLabel = u?.name ?? "someone";
  }
  const since = new Date(Date.now() - PRESENCE_WINDOW_MS);
  const viewers = await db.select().from(draftPresence).where(and(eq(draftPresence.draftId, draftId), gt(draftPresence.lastSeenAt, since)));
  return {
    version: row.version,
    status: row.status,
    controllerUserId: row.controllerUserId,
    controllerLabel,
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

export async function setController(db: Db, draftId: string, userId: string | null): Promise<void> {
  const { sql } = await import("drizzle-orm");
  await db.update(drafts).set({ controllerUserId: userId, version: sql`${drafts.version} + 1`, updatedAt: new Date() }).where(eq(drafts.id, draftId));
}
