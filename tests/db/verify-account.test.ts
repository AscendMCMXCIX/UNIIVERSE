import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { auditEvents, riotAccounts, users } from "@/server/db/schema";
import { authenticate, createUser, getUser, updateUser } from "@/server/repositories/users";
import { createPlayer, getOrCreateTeam, listPlayers } from "@/server/repositories/team";
import { needsSetup, sessionFromUser } from "@/server/auth/session";
import { hasPermission } from "@/server/auth/permissions";
import { deriveVerifyPassword, ensureVerificationAccount, VERIFY_USERNAME } from "@/server/jobs/verify-account";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";

/*
  The production verification account: a member account with no player profile, whose password is
  worked out from CRON_SECRET. It must sign in like anyone, hold the default member access and no
  more, appear in no player list, own no Riot account, and never take over an account of that name
  it did not make.
*/

const SECRET = "a-cron-secret-of-some-length-0123456789";
const prod = { VERCEL_ENV: "production", CRON_SECRET: SECRET };
let handle: DbHandle;
beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("the production verification account", () => {
  it("is a plain member with no profile: signs in normally, holds member access only, appears in no player list", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    await createPlayer(db, team.id, { displayName: "Real Member", primaryRole: "MID", primaryPool: ["Ahri"] });
    const first = await ensureVerificationAccount(db, prod);
    expect(first).toEqual({ ok: true, summary: { username: VERIFY_USERNAME, state: "created" } });
    expect(JSON.stringify(first)).not.toContain(deriveVerifyPassword(SECRET));

    const signedIn = await authenticate(db, VERIFY_USERNAME, deriveVerifyPassword(SECRET));
    expect(signedIn).not.toBeNull();
    expect(await authenticate(db, VERIFY_USERNAME, "a wrong password, long enough")).toBeNull();
    const user = (await getUser(db, signedIn!.id))!;
    expect({ role: user.role, playerId: user.playerId, isAdmin: user.isAdmin, mustChangePassword: user.mustChangePassword }).toEqual({ role: "player", playerId: null, isAdmin: false, mustChangePassword: false });
    const session = sessionFromUser(user);
    expect(needsSetup(session)).toBe(false);
    for (const p of ["view-team", "view-players", "view-teammate-stats", "view-matches"] as const) expect(hasPermission(session, p)).toBe(true);
    for (const p of ["manage-users", "manage-branding", "manage-data"] as const) expect(hasPermission(session, p)).toBe(false);
    // In no list a member sees, and nothing to collect from Riot.
    expect((await listPlayers(db, team.id, { includeArchived: true, includePersonal: true })).map((p) => p.displayName)).toEqual(["Real Member"]);
    expect(await db.select().from(riotAccounts)).toEqual([]);
    const audit = await db.select({ action: auditEvents.action }).from(auditEvents);
    expect(audit.map((a) => a.action)).toContain("account.create");
  });

  it("changes nothing when run again, follows a new CRON_SECRET, and leaves a deactivated account off", async () => {
    const db = handle.db;
    expect((await ensureVerificationAccount(db, prod)).summary.state).toBe("unchanged");
    const rotated = { ...prod, CRON_SECRET: SECRET + "-rotated" };
    expect((await ensureVerificationAccount(db, rotated)).summary.state).toBe("password-updated");
    expect(await authenticate(db, VERIFY_USERNAME, deriveVerifyPassword(SECRET))).toBeNull();
    expect(await authenticate(db, VERIFY_USERNAME, deriveVerifyPassword(rotated.CRON_SECRET))).not.toBeNull();
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.username, VERIFY_USERNAME));
    await updateUser(db, row!.id, { isActive: false });
    expect((await ensureVerificationAccount(db, rotated)).summary.state).toBe("deactivated");
    expect(await authenticate(db, VERIFY_USERNAME, deriveVerifyPassword(rotated.CRON_SECRET))).toBeNull();
    await updateUser(db, row!.id, { isActive: true });
  });

  it("never takes over an account of that name it did not make, and runs only on production", async () => {
    const db = handle.db;
    await db.delete(users).where(eq(users.username, VERIFY_USERNAME));
    const team = await getOrCreateTeam(db);
    const player = await createPlayer(db, team.id, { displayName: "Someone Called Verify", primaryRole: "TOP", primaryPool: ["Garen"] });
    await createUser(db, { username: VERIFY_USERNAME, password: "their own password 123", role: "player", playerId: player.id });
    const result = await ensureVerificationAccount(db, prod);
    expect(result).toMatchObject({ ok: false, summary: { state: "conflict" } });
    expect(await authenticate(db, VERIFY_USERNAME, "their own password 123")).not.toBeNull();
    for (const env of [{ ...prod, VERCEL_ENV: "preview" }, { ...prod, CRON_SECRET: "short" }]) expect((await ensureVerificationAccount(db, env)).ok).toBe(false);
  });
});
