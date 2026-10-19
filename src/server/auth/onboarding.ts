import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { users, type SetupProgress } from "@/server/db/schema";
import { sanitiseSetup, setupProblems, type SetupState } from "@/domain/onboarding";
import { listChampions } from "@/server/repositories/champions";
import { getPlayer, getPlayerRow, updatePlayer } from "@/server/repositories/team";
import { getUser, UserError, type UserRecord } from "@/server/repositories/users";

/*
  Mandatory first-time setup: the display name (prefilled with the one the account has), a primary
  role and at least one primary champion are required; a secondary role and its champions are
  optional. Personalising the card and picture comes after, on /welcome/personalise, and is optional. Progress is saved as the player goes (a refresh, a
  closed tab or a sign-out resumes it), and nothing else in UNIIVERSE opens until it is done:
  the app layout redirects to /welcome and every server action refuses (auth/session.ts).
*/

export { sanitiseSetup, setupProblems, type SetupState } from "@/domain/onboarding";

/**
 * Where the player left off: saved progress, else what the profile already holds (an older
 * account finishing late). The display name starts as the one they already show (their username
 * at creation). `resume`: the step to open: roles once they have started on them.
 */
export async function loadSetupState(db: Db, userId: string): Promise<{ user: UserRecord; state: SetupState; resume: "name" | "profile" }> {
  const user = await getUser(db, userId);
  if (!user) throw new UserError("Account not found.");
  const [row] = await db.select({ progress: users.setupProgress }).from(users).where(eq(users.id, userId));
  const player = user.playerId ? await getPlayer(db, user.playerId) : null;
  const shown = player?.displayName ?? user.displayName;
  if (row?.progress) {
    const saved = sanitiseSetup(row.progress as Record<string, unknown>);
    return { user, state: { ...saved, displayName: saved.displayName ?? shown }, resume: saved.primaryRole ? "profile" : "name" };
  }
  // A fresh account's profile has no role yet (older accounts: a placeholder role and empty pools): start from nothing.
  const fresh = !player || player.primaryPool.length === 0;
  return { user, state: fresh ? { displayName: shown, primaryRole: null, primaryPool: [], secondaryRole: null, secondaryPool: [] } : sanitiseSetup(player), resume: "name" };
}

export async function saveSetupProgress(db: Db, userId: string, input: Partial<Record<keyof SetupState, unknown>>): Promise<SetupState> {
  const state = sanitiseSetup(input);
  const progress: SetupProgress = { ...state };
  await db.update(users).set({ setupProgress: progress, updatedAt: new Date() }).where(eq(users.id, userId));
  return state;
}

/** Validates and stores the setup on the player profile, marks it complete and clears the saved progress. */
export async function completeSetup(db: Db, userId: string, input: Partial<Record<keyof SetupState, unknown>>): Promise<UserRecord> {
  const state = sanitiseSetup(input);
  const problems = setupProblems(state);
  if (problems.length) throw new UserError(problems.join(" "));
  const known = new Set((await listChampions(db)).map((c) => c.id));
  const unknown = [...state.primaryPool, ...state.secondaryPool].filter((id) => !known.has(id));
  if (unknown.length) throw new UserError(`Unknown champion: ${unknown.join(", ")}.`);
  return db.transaction(async (tx) => {
    const user = await getUser(tx, userId);
    if (!user) throw new UserError("Account not found.");
    if (!user.playerId) throw new UserError("This account has no player profile. Ask an admin.");
    const player = await getPlayerRow(tx, user.playerId);
    if (!player) throw new UserError("The player profile for this account no longer exists. Ask an admin.");
    // updatePlayer writes the name to the account too (one visible name); the username never changes here.
    await updatePlayer(tx, player.id, { displayName: state.displayName ?? player.displayName, riotId: player.riotId, primaryRole: state.primaryRole!, secondaryRole: state.secondaryRole, notes: player.notes, group: player.group, primaryPool: state.primaryPool, secondaryPool: state.secondaryPool });
    await tx.update(users).set({ setupCompletedAt: user.setupCompletedAt ?? new Date(), setupProgress: null, updatedAt: new Date() }).where(eq(users.id, userId));
    return (await getUser(tx, userId))!;
  });
}
