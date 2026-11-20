import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { desc, eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";

/*
  Withdraw a temporary password (Admin → a person → Password; PLAN S9a, §6 row 7.3f). Through the
  real server action: the withdrawn password no longer signs in; the guards are Reset password's
  (never your own account, the Owner's only by the Owner, never the Production check's account),
  plus the last active administrator; one audit row of labels only, none for a no-op; and the
  account's sessions end, as after a reset.
*/

const state = vi.hoisted(() => ({ db: null as unknown, cookies: new Map<string, string>() }));

vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.cookies.has(name) ? { name, value: state.cookies.get(name)! } : undefined),
    set: (name: string, value: string) => void state.cookies.set(name, value),
    delete: (name: string) => void state.cookies.delete(name),
  }),
  headers: async () => new Headers({ "user-agent": "vitest", "x-forwarded-for": "203.0.113.12" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT ${to}`), { digest: `NEXT_REDIRECT;${to}` });
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/server/accounts/kickoff", async (orig) => ({ ...(await orig<object>()), kickoffAccountSync: async () => undefined }));

import { SESSION_COOKIE } from "@/server/auth/session";
import { createSession, findSession } from "@/server/auth/sessions";
import { registerAccount } from "@/server/auth/signup";
import { authenticate, createUser, getUser } from "@/server/repositories/users";
import { auditEvents, users } from "@/server/db/schema";
import { setAdministrator } from "@/server/auth/account-admin";
import * as userActions from "@/server/actions/users";

let handle: DbHandle;
let ownerId: string;
let adminId: string;
let memberId: string;

async function signInAs(userId: string): Promise<void> {
  state.cookies.clear();
  const { token } = await createSession(handle.db, userId);
  state.cookies.set(SESSION_COOKIE, token);
}
const rows = async () => handle.db.select().from(auditEvents).where(eq(auditEvents.action, "account.password-withdrawn")).orderBy(desc(auditEvents.id));

const saved = { auth: process.env.UNIIVERSE_REQUIRE_AUTH, url: process.env.DATABASE_URL, secret: process.env.UNIIVERSE_AUTH_SECRET, key: process.env.RIOT_API_KEY };

beforeAll(async () => {
  process.env.UNIIVERSE_REQUIRE_AUTH = "true";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test-only";
  process.env.UNIIVERSE_AUTH_SECRET = "test-secret-0123456789abcdef0123456789";
  delete process.env.RIOT_API_KEY;
  handle = await testDb();
  state.db = handle.db;
  ownerId = (await registerAccount(handle.db, { username: "Founder", password: "Owner-pass-123", role: "owner", primaryRiot: { riotId: "Founder#OCE", platform: "oc1" }, primaryRole: "MID" })).id;
  adminId = (await registerAccount(handle.db, { username: "Captain", password: "Captain-pass-1", role: "player", primaryRiot: { riotId: "Captain#OCE", platform: "oc1" }, primaryRole: "TOP" })).id;
  await setAdministrator(handle.db, ownerId, adminId, true);
  memberId = (await registerAccount(handle.db, { username: "Teammate", password: "Teammate-pass-1", role: "player", primaryRiot: { riotId: "Teammate#OCE", platform: "oc1" }, primaryRole: "JUNGLE" })).id;
}, 60_000);
afterAll(async () => {
  await handle.close();
  for (const [k, v] of [["UNIIVERSE_REQUIRE_AUTH", saved.auth], ["DATABASE_URL", saved.url], ["UNIIVERSE_AUTH_SECRET", saved.secret], ["RIOT_API_KEY", saved.key]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
beforeEach(() => state.cookies.clear());

describe("withdraw a temporary password", () => {
  it("the withdrawn password no longer signs in, its sessions end as after a reset, and one audit row of labels only is written", async () => {
    await signInAs(adminId);
    const reset = await userActions.resetPasswordAction(memberId);
    if (!reset.ok) throw new Error(reset.error);
    const temporary = reset.data.temporaryPassword;
    expect(await authenticate(handle.db, "Teammate", temporary)).not.toBeNull();
    // A session opened with the temporary password (the first sign-in, before choosing their own).
    const opened = await createSession(handle.db, memberId);
    const before = (await rows()).length;
    await signInAs(adminId);
    expect(await userActions.withdrawTemporaryPasswordAction(memberId)).toEqual({ ok: true, data: { changed: true } });
    expect(await authenticate(handle.db, "Teammate", temporary)).toBeNull();
    expect(await findSession(handle.db, opened.token)).toBeNull();
    const user = (await getUser(handle.db, memberId))!;
    expect(user).toMatchObject({ hasPassword: false, mustChangePassword: false, temporaryPasswordExpiresAt: null, isActive: true });
    const after = await rows();
    expect(after.length).toBe(before + 1);
    const row = after[0]!;
    expect(row.targetId).toBe(memberId);
    expect(row.actorUserId).toBe(adminId);
    // Labels only: never the password, a Riot ID or an email.
    const text = JSON.stringify(row);
    expect(text).not.toContain(temporary);
    expect(text).not.toMatch(/#OCE|@/);
    // Again (a second administrator's stale button): nothing left to withdraw, nothing recorded, and the answer says so.
    expect(await userActions.withdrawTemporaryPasswordAction(memberId)).toEqual({ ok: true, data: { changed: false } });
    expect((await rows()).length).toBe(before + 1);
    // A new temporary password signs in again.
    const again = await userActions.resetPasswordAction(memberId);
    if (!again.ok) throw new Error(again.error);
    expect(await authenticate(handle.db, "Teammate", again.data.temporaryPassword)).not.toBeNull();
  });

  it("withdraws the password of Reactivate with a new temporary password too", async () => {
    await signInAs(adminId);
    expect(await userActions.setAccountActiveAction(memberId, false)).toMatchObject({ ok: true });
    const issued = await userActions.reactivateWithTemporaryPasswordAction(memberId);
    if (!issued.ok) throw new Error(issued.error);
    expect(await userActions.withdrawTemporaryPasswordAction(memberId)).toMatchObject({ ok: true });
    expect(await authenticate(handle.db, "Teammate", issued.data.temporaryPassword)).toBeNull();
  });

  it("refuses a password the member chose: nothing changes, nothing is recorded", async () => {
    await signInAs(adminId);
    const before = (await rows()).length;
    const r = await userActions.withdrawTemporaryPasswordAction(ownerId);
    // The Owner's: refused for an administrator whatever its state.
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/Only the Owner/) });
    const chosen = await registerAccount(handle.db, { username: "Chooser", password: "Chooser-pass-1", role: "player", primaryRiot: { riotId: "Chooser#OCE", platform: "oc1" }, primaryRole: "ADC" });
    expect(await userActions.withdrawTemporaryPasswordAction(chosen.id)).toMatchObject({ ok: false, error: expect.stringMatching(/chose their own password/) });
    expect(await authenticate(handle.db, "Chooser", "Chooser-pass-1")).not.toBeNull();
    expect((await rows()).length).toBe(before);
  });

  it("each guard refuses: your own account, the Owner's by anyone but the Owner, the Production check's account, the last administrator", async () => {
    const before = (await rows()).length;
    // Your own account.
    await signInAs(adminId);
    expect(await userActions.withdrawTemporaryPasswordAction(adminId)).toMatchObject({ ok: false, error: expect.stringMatching(/your own password/) });
    // The Owner's, holding a temporary password, by an administrator: refused; by the Owner of another account it would be allowed.
    await handle.db.update(users).set({ mustChangePassword: true, temporaryPasswordExpiresAt: new Date(Date.now() + 86_400_000) }).where(eq(users.id, ownerId));
    expect(await userActions.withdrawTemporaryPasswordAction(ownerId)).toMatchObject({ ok: false, error: expect.stringMatching(/Only the Owner can withdraw the password of the Owner account/) });
    expect(await authenticate(handle.db, "Founder", "Owner-pass-123")).not.toBeNull();
    await handle.db.update(users).set({ mustChangePassword: false, temporaryPasswordExpiresAt: null }).where(eq(users.id, ownerId));
    // The Production check's account: its job keeps its password.
    const verify = await createUser(handle.db, { username: "verify", displayName: "Verification", password: "Verify-pass-123", role: "player", playerId: null });
    await handle.db.update(users).set({ mustChangePassword: true }).where(eq(users.id, verify.id));
    expect(await userActions.withdrawTemporaryPasswordAction(verify.id)).toMatchObject({ ok: false, error: expect.stringMatching(/kept automatically/) });
    // The last active administrator able to sign in: the Owner deactivated, so the administrator is the last, and its temporary password stays.
    await handle.db.update(users).set({ isActive: false }).where(eq(users.id, ownerId));
    await handle.db.update(users).set({ mustChangePassword: true, temporaryPasswordExpiresAt: new Date(Date.now() + 86_400_000) }).where(eq(users.id, adminId));
    const other = await registerAccount(handle.db, { username: "Deputy", password: "Deputy-pass-123", role: "player", primaryRiot: { riotId: "Deputy#OCE", platform: "oc1" }, primaryRole: "SUPPORT" });
    // A member (manage-users through Administrator is needed to ask at all): grant, then take the Deputy's own password away so only the Captain remains.
    await setAdministrator(handle.db, null, other.id, true);
    await handle.db.update(users).set({ passwordHash: null }).where(eq(users.id, other.id));
    await signInAs(other.id);
    expect(await userActions.withdrawTemporaryPasswordAction(adminId)).toMatchObject({ ok: false, error: expect.stringMatching(/last active administrator/) });
    expect((await getUser(handle.db, adminId))!.hasPassword).toBe(true);
    await handle.db.update(users).set({ isActive: true }).where(eq(users.id, ownerId));
    await handle.db.update(users).set({ mustChangePassword: false, temporaryPasswordExpiresAt: null }).where(eq(users.id, adminId));
    expect((await rows()).length).toBe(before);
  });

  it("establishes who is asking first: signed out, or a member without manage-users, is refused", async () => {
    await signInAs(adminId);
    const reset = await userActions.resetPasswordAction(memberId);
    expect(reset.ok).toBe(true);
    state.cookies.clear();
    await expect(userActions.withdrawTemporaryPasswordAction(memberId).then((r) => r.ok)).resolves.toBe(false);
    const plain = await registerAccount(handle.db, { username: "Plain", password: "Plain-pass-1234", role: "player", primaryRiot: { riotId: "Plain#OCE", platform: "oc1" }, primaryRole: "MID" });
    await signInAs(plain.id);
    expect(await userActions.withdrawTemporaryPasswordAction(memberId)).toMatchObject({ ok: false });
    expect((await getUser(handle.db, memberId))!.hasPassword).toBe(true);
  });
});
