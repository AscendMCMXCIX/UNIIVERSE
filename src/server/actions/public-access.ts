"use server";

import { revalidatePath } from "next/cache";
import { getAppDb } from "@/server/bootstrap";
import { requireOwner, requireSession } from "@/server/auth/session";
import { setPublicAccess } from "@/server/public/access";
import { setPublicProfile } from "@/server/public/team";
import { parsePublicName } from "@/domain/public-name";

type Result = { ok: true; data: { on: boolean } } | { ok: false; error: string };

/** Admin → Public Access: turns the public pages on or off for visitors without an account (Owner only). */
export async function setPublicAccessAction(enabled: boolean): Promise<Result> {
  try {
    await requireOwner();
    const db = await getAppDb();
    await setPublicAccess(db, enabled === true);
    revalidatePath("/", "layout");
    return { ok: true, data: { on: enabled === true } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Settings → Public profile: the signed-in member's own choice. It takes no player id, so nobody
 * (an admin included) can make someone else's profile public.
 */
export async function setMyPublicProfileAction(input: { on: boolean; name: string }): Promise<Result> {
  try {
    const session = await requireSession();
    if (!session.playerId) return { ok: false, error: "This account has no player profile." };
    const on = input?.on === true;
    // Turning it on needs a public name; turning it off keeps the name for next time.
    const parsed = parsePublicName(input?.name);
    if (on && !parsed.ok) return parsed;
    const db = await getAppDb();
    await setPublicProfile(db, session.playerId, { on, name: parsed.ok ? parsed.name : null });
    revalidatePath("/", "layout");
    return { ok: true, data: { on } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
