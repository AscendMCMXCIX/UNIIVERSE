import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";

/*
  The person view's Riot accounts and "Reactivate with a new temporary password" (the overhaul's
  S9a, finished in S9c), through the real server actions:
  - an administrator's Link, Unlink, Change Riot ID and Make Main on a member's accounts are
    recorded (riot.link, riot.unlink, riot.replace, riot.main), naming the profile and the account
    by its label only (never a Riot ID or PUUID); a member's own changes are not recorded (OD9);
  - a member without the capability cannot touch someone else's accounts;
  - Reactivate with a new temporary password: the old password never works again, the guards hold
    (your own account, the Owner by an administrator, the Production check's account, an active
    account) and it is audited without the password.
*/

const state = vi.hoisted(() => ({ db: null as unknown, cookies: new Map<string, string>(), puuid: 0 }));

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
// Riot answers every lookup with a new Riot account under the typed name (no network).
vi.mock("@/server/riot/verify-identity", async (orig) => ({
  ...(await orig<object>()),
  lookupRiotId: async (riotId: string) => ({ status: "found", riotId, puuid: `test-puuid-${++state.puuid}` }),
}));
// Change Riot ID: a client exists (it is never called) and the change is a rename.
vi.mock("@/server/riot/api/client", async (orig) => ({ ...(await orig<object>()), createRiotClient: () => ({}) }));
vi.mock("@/server/accounts/change-riot-id", async (orig) => ({ ...(await orig<object>()), changeAccountRiotId: async (_db: unknown, _c: unknown, _a: unknown, riotId: string) => ({ kind: "renamed", riotId }) }));
vi.mock("@/server/accounts/sync", async (orig) => ({ ...(await orig<object>()), syncAccount: async () => ({ status: "ok", matchesFolded: 0, masteryRows: 0 }) }));

import { SESSION_COOKIE } from "@/server/auth/session";
import { createSession, findSession } from "@/server/auth/sessions";
import { registerAccount } from "@/server/auth/signup";
import { authenticate, getUser } from "@/server/repositories/users";
import { auditEvents } from "@/server/db/schema";
import { setAccountActive, setAdministrator } from "@/server/auth/account-admin";
import { ensureVerificationAccount, VERIFY_USERNAME } from "@/server/jobs/verify-account";
import { findUserByUsername } from "@/server/repositories/users";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import * as accountActions from "@/server/actions/accounts";
import * as userActions from "@/server/actions/users";
import { auditDetailsSentence, auditSentence } from "@/domain/audit-sentence";

let handle: DbHandle;
let ownerId: string;
let adminId: string;
let memberId: string;
let memberProfileId: string;
let otherId: string;
let otherProfileId: string;

async function signInAs(userId: string): Promise<string> {
  state.cookies.clear();
  const { token } = await createSession(handle.db, userId);
  state.cookies.set(SESSION_COOKIE, token);
  return token;
}
const audit = async (action: string) => handle.db.select().from(auditEvents).where(eq(auditEvents.action, action));
const accountsOf = (playerId: string) => listAccountsForPlayer(handle.db, playerId);

const saved = { auth: process.env.UNIIVERSE_REQUIRE_AUTH, url: process.env.DATABASE_URL, secret: process.env.UNIIVERSE_AUTH_SECRET, cron: process.env.CRON_SECRET, key: process.env.RIOT_API_KEY };

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
  const member = await registerAccount(handle.db, { username: "Teammate", password: "Teammate-pass-1", role: "player", primaryRiot: { riotId: "Teammate#OCE", platform: "oc1" }, primaryRole: "JUNGLE" });
  memberId = member.id;
  memberProfileId = member.playerId!;
  const other = await registerAccount(handle.db, { username: "Benchy", password: "Benchy-pass-12", role: "player", primaryRiot: { riotId: "Benchy#OCE", platform: "oc1" }, primaryRole: "SUPPORT" });
  otherId = other.id;
  otherProfileId = other.playerId!;
  process.env.CRON_SECRET = "admin-riot-cron-secret-0123456789";
  await ensureVerificationAccount(handle.db, { VERCEL_ENV: "production", CRON_SECRET: process.env.CRON_SECRET });
}, 60_000);
afterAll(async () => {
  await handle.close();
  for (const [k, v] of [["UNIIVERSE_REQUIRE_AUTH", saved.auth], ["DATABASE_URL", saved.url], ["UNIIVERSE_AUTH_SECRET", saved.secret], ["CRON_SECRET", saved.cron], ["RIOT_API_KEY", saved.key]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
beforeEach(() => state.cookies.clear());

describe("an administrator's changes to a member's Riot accounts", () => {
  it("are recorded by the account's label, never its Riot ID or PUUID, and read as sentences", async () => {
    await signInAs(adminId);
    const linked = await accountActions.addPlayerAccountAction(memberProfileId, { riotId: "Second Account#OCE" });
    expect(linked).toMatchObject({ ok: true, data: { label: "alt" } });
    const altId = linked.ok ? linked.data.id : "";
    expect(await accountActions.setMainAccountAction(memberProfileId, altId)).toEqual({ ok: true, data: null });
    expect(await accountActions.changeRiotIdAction(memberProfileId, altId, "Renamed Account#OCE")).toMatchObject({ ok: true, data: { kind: "renamed" } });
    const former = (await accountsOf(memberProfileId)).find((a) => a.id !== altId)!;
    expect(await accountActions.removePlayerAccountAction(memberProfileId, former.id)).toEqual({ ok: true, data: null });

    const rows = { link: await audit("riot.link"), main: await audit("riot.main"), replace: await audit("riot.replace"), unlink: await audit("riot.unlink") };
    expect(rows.link).toHaveLength(1);
    expect(rows.link[0]).toMatchObject({ actorUserId: adminId, targetType: "player", targetId: memberProfileId, targetName: "Teammate", details: { account: "alt" } });
    expect(rows.main[0]).toMatchObject({ actorUserId: adminId, targetId: memberProfileId, details: { account: "main" } });
    expect(rows.replace[0]).toMatchObject({ actorUserId: adminId, targetId: memberProfileId, details: { riotChange: "renamed" } });
    expect(rows.unlink[0]).toMatchObject({ actorUserId: adminId, targetId: memberProfileId, details: { account: "alt" } });
    // No Riot ID and no PUUID in any of them.
    const text = JSON.stringify(Object.values(rows));
    for (const s of ["Second Account", "Renamed Account", "Teammate#OCE", "test-puuid", "puuid"]) expect(text).not.toContain(s);
    expect(auditSentence(rows.unlink[0]!)).toBe("Captain unlinked a Riot account from Teammate.");
    expect(auditDetailsSentence(rows.unlink[0]!.details)).toBe("An Alt account.");
    expect(auditSentence(rows.main[0]!)).toBe("Captain changed the Main Riot account of Teammate.");
  });

  it("are not recorded when members change their own (OD9), and a member cannot touch someone else's", async () => {
    const before = (await handle.db.select().from(auditEvents)).filter((r) => r.action.startsWith("riot.")).length;
    await signInAs(otherId);
    const own = await accountActions.addPlayerAccountAction(otherProfileId, { riotId: "Bench Alt#OCE" });
    expect(own).toMatchObject({ ok: true });
    expect(await accountActions.removePlayerAccountAction(otherProfileId, own.ok ? own.data.id : "")).toEqual({ ok: true, data: null });
    const after = (await handle.db.select().from(auditEvents)).filter((r) => r.action.startsWith("riot.")).length;
    expect(after).toBe(before);
    // Someone else's accounts: refused, and nothing changes.
    const theirs = await accountsOf(memberProfileId);
    expect(await accountActions.removePlayerAccountAction(memberProfileId, theirs[0]!.id)).toMatchObject({ ok: false });
    expect(await accountActions.setMainAccountAction(memberProfileId, theirs[0]!.id)).toMatchObject({ ok: false });
    expect(await accountActions.addPlayerAccountAction(memberProfileId, { riotId: "Takeover#OCE" })).toMatchObject({ ok: false });
    expect(await accountsOf(memberProfileId)).toHaveLength(theirs.length);
  });

  it("refuses an account that is not the profile's", async () => {
    await signInAs(adminId);
    const benchy = (await accountsOf(otherProfileId))[0]!;
    expect(await accountActions.removePlayerAccountAction(memberProfileId, benchy.id)).toEqual({ ok: false, error: "Account not found." });
    expect(await accountsOf(otherProfileId)).toHaveLength(1);
    expect(await audit("riot.unlink")).toHaveLength(1);
  });
});

describe("Reactivate with a new temporary password", () => {
  it("issues a temporary password, the old one never works again, and the record holds no password", async () => {
    await signInAs(adminId);
    await setAccountActive(handle.db, adminId, memberId, false);
    const r = await userActions.reactivateWithTemporaryPasswordAction(memberId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const user = (await getUser(handle.db, memberId))!;
    expect(user.isActive).toBe(true);
    expect(user.mustChangePassword).toBe(true);
    expect(await authenticate(handle.db, "Teammate", "Teammate-pass-1")).toBeNull();
    expect(await authenticate(handle.db, "Teammate", r.data.temporaryPassword)).toMatchObject({ id: memberId });
    const [row] = (await audit("account.activate")).slice(-1);
    expect(row).toMatchObject({ actorUserId: adminId, targetId: memberId, details: { temporaryIssued: true } });
    expect(JSON.stringify(row)).not.toContain(r.data.temporaryPassword);
    expect(auditDetailsSentence(row!.details)).toBe("With a new temporary password.");
  });

  it("is refused for an active account, your own, the Owner by an administrator, the Production check's account and a member without the right", async () => {
    await signInAs(adminId);
    expect(await userActions.reactivateWithTemporaryPasswordAction(memberId)).toMatchObject({ ok: false, error: expect.stringMatching(/already active/) });
    expect(await userActions.reactivateWithTemporaryPasswordAction(adminId)).toMatchObject({ ok: false, error: expect.stringMatching(/your own/) });
    await setAccountActive(handle.db, null, ownerId, false);
    expect(await userActions.reactivateWithTemporaryPasswordAction(ownerId)).toMatchObject({ ok: false, error: expect.stringMatching(/Owner/) });
    expect((await getUser(handle.db, ownerId))!.isActive).toBe(false);
    await setAccountActive(handle.db, null, ownerId, true);
    const verify = (await findUserByUsername(handle.db, VERIFY_USERNAME))!;
    await setAccountActive(handle.db, adminId, verify.id, false);
    expect(await userActions.reactivateWithTemporaryPasswordAction(verify.id)).toMatchObject({ ok: false, error: expect.stringMatching(/kept automatically/) });
    expect((await getUser(handle.db, verify.id))!.isActive).toBe(false);
    await setAccountActive(handle.db, adminId, otherId, false);
    await signInAs(memberId);
    expect(await userActions.reactivateWithTemporaryPasswordAction(otherId)).toMatchObject({ ok: false });
    expect((await getUser(handle.db, otherId))!.isActive).toBe(false);
  });

  it("signs out a session the account still held", async () => {
    await signInAs(ownerId);
    const token = (await createSession(handle.db, otherId)).token;
    await signInAs(ownerId);
    expect(await userActions.reactivateWithTemporaryPasswordAction(otherId)).toMatchObject({ ok: true });
    expect(await findSession(handle.db, token)).toBeNull();
  });
});

describe("System Health's demo roster", () => {
  it("records nothing when players already exist (the check comes before the record)", async () => {
    const { demoDataAction } = await import("@/server/actions/settings");
    await signInAs(adminId);
    expect(await demoDataAction()).toEqual({ ok: true, data: "Players already exist; nothing created." });
    expect(await audit("demo.data")).toHaveLength(0);
    await signInAs(otherId);
    expect(await demoDataAction()).toMatchObject({ ok: false });
  });
});
