import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { users, type SetupProgress } from "@/server/db/schema";
import { sanitiseSetup, setupProblems, type SetupState } from "@/domain/onboarding";
import { listChampions } from "@/server/repositories/champions";
import { getPlayer, getPlayerRow, updatePlayer } from "@/server/repositories/team";
import { getUser, UserError, type UserRecord } from "@/server/repositories/users";

/*
  Mandatory first-time setup: primary role and 1–6 primary champions are required; a secondary
  role with up to 3 champions is optional. Progress is saved as the player goes (a refresh, a
  closed tab or a sign-out resumes it), and nothing else in UNIIVERSE opens until it is done:
  the app layout redirects to /welcome and every server action refuses (auth/session.ts).
*/

export { sanitiseSetup, setupProblems, type SetupState } from "@/domain/onboarding";

/** Where the player left off: saved progress, else what the profile already holds (an older account finishing late). */
export async function loadSetupState(db: Db, userId: string): Promise<{ user: UserRecord; state: SetupState }> {
  const user = await getUser(db, userId);
  if (!user) throw new UserError("Account not found.");
  const [row] = await db.select({ progress: users.setupProgress }).from(users).where(eq(users.id, userId));
  if (row?.progress) return { user, state: sanitiseSetup(row.progress as Record<string, unknown>) };
  // A fresh account's profile has no role yet (older accounts: a placeholder role and empty pools): start from nothing.
  const player = user.playerId ? await getPlayer(db, user.playerId) : null;
  const fresh = !player || player.primaryPool.length === 0;
  return { user, state: fresh ? { primaryRole: null, primaryPool: [], secondaryRole: null, secondaryPool: [] } : sanitiseSetup(player) };
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
    await updatePlayer(tx, player.id, { displayName: player.displayName, riotId: player.riotId, primaryRole: state.primaryRole!, secondaryRole: state.secondaryRole, notes: player.notes, group: player.group, primaryPool: state.primaryPool, secondaryPool: state.secondaryPool });
    await tx.update(users).set({ setupCompletedAt: user.setupCompletedAt ?? new Date(), setupProgress: null, updatedAt: new Date() }).where(eq(users.id, userId));
    return (await getUser(tx, userId))!;
  });
}
