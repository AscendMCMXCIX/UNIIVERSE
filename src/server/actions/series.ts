"use server";

import { revalidatePath } from "next/cache";
import { getAppDb } from "@/server/bootstrap";
import { canControlDraft, NotAuthorizedError, requireSession } from "@/server/auth/session";
import { endSeries, getSeries, reopenSeries, updateSeries, type SeriesRecord } from "@/server/series/repository";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** The player who started the series, or an admin. */
async function requireSeriesControl(seriesId: string): Promise<void> {
  const session = await requireSession();
  const s = await getSeries(await getAppDb(), seriesId);
  if (!s) throw new NotAuthorizedError("Series not found.");
  if (!canControlDraft(session, s)) throw new NotAuthorizedError("Only the player who started this series (or an admin) can change it.");
}

function touch(seriesId: string) {
  revalidatePath("/matches");
  revalidatePath("/draft");
  revalidatePath(`/series/${seriesId}`);
}

/** Ends a series before every game is played: decided by the current score, or cancelled. */
export async function endSeriesAction(seriesId: string, options: { cancel?: boolean } = {}): Promise<Result<SeriesRecord>> {
  try {
    await requireSeriesControl(seriesId);
    const db = await getAppDb();
    const s = await endSeries(db, seriesId, options);
    if (!s) return { ok: false, error: "Series not found." };
    touch(seriesId);
    return { ok: true, data: s };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function reopenSeriesAction(seriesId: string): Promise<Result<SeriesRecord>> {
  try {
    await requireSeriesControl(seriesId);
    const db = await getAppDb();
    const s = await reopenSeries(db, seriesId);
    if (!s) return { ok: false, error: "Series not found." };
    touch(seriesId);
    return { ok: true, data: s };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function updateSeriesAction(seriesId: string, patch: { eventName?: string; opponentName?: string; notes?: string }): Promise<Result<SeriesRecord>> {
  try {
    await requireSeriesControl(seriesId);
    const db = await getAppDb();
    await updateSeries(db, seriesId, { eventName: patch.eventName?.trim().slice(0, 120), opponentName: patch.opponentName?.trim().slice(0, 60), notes: patch.notes?.slice(0, 5000) });
    const s = await getSeries(db, seriesId);
    if (!s) return { ok: false, error: "Series not found." };
    touch(seriesId);
    return { ok: true, data: s };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
