import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
  What keeps the Production check's verification account (jobs/verify-account.ts) the plain member
  its job makes, through the real entry points a browser reaches (loginAction, the server actions,
  the /me page), as tests/db/auth-actions.test.ts drives them:
  - the job withdraws the derived password, and ends the account's sessions, once its own account
    was given more access, a level, a profile or another name, so CRON_SECRET no longer opens it;
  - the account cannot change its own username, display name or password in Settings;
  - it cannot give itself a player profile (only the Owner completes one), so it never joins the
    players or starts Riot collection.
  One fresh database per test. No network: no Riot key, and the account sync's kickoff is a no-op.
*/

const state = vi.hoisted(() => ({ db: null as unknown, handle: null as unknown, cookies: new Map<string, string>(), redirects: [] as string[] }));

vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("@/server/db/client", async (orig) => ({ ...(await orig<object>()), getDbHandle: async () => state.handle }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.cookies.has(name) ? { name, value: state.cookies.get(name)! } : undefined),
    set: (name: string, value: string) => void state.cookies.set(name, value),
    delete: (name: string) => void state.cookies.delete(name),
  }),
  headers: async () => new Headers({ "user-agent": "vitest", "x-forwarded-for": "203.0.113.9" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    state.redirects.push(to);
    throw Object.assign(new Error(`NEXT_REDIRECT ${to}`), { digest: `NEXT_REDIRECT;${to}` });
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/server/accounts/kickoff", async (orig) => ({ ...(await orig<object>()), kickoffAccountSync: async () => undefined }));

import { eq, sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { auditEvents, sessions as sessionsTable, users as usersTable } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { registerAccount } from "@/server/auth/signup";
import { getAuthState, SESSION_COOKIE } from "@/server/auth/session";
import { createSession } from "@/server/auth/sessions";
import { resetThrottle } from "@/server/auth/throttle";
import { authenticate, createUser, findUserByUsername, getUser, listUsers } from "@/server/repositories/users";
import { changeUsername } from "@/server/repositories/profile";
import { listPermissionPresets, savePermissionPreset, setAccessGroups, setAccessLevel } from "@/server/repositories/permissions";
import { setAccountActive, setAdministrator } from "@/server/auth/account-admin";
import { deriveVerifyPassword, ensureVerificationAccount, VERIFY_DISPLAY_NAME, VERIFY_USERNAME } from "@/server/jobs/verify-account";
import * as auth from "@/server/actions/auth";
import * as usersActions from "@/server/actions/users";
import * as account from "@/server/actions/account";
import MePage from "@/app/(app)/me/page";
import OverviewLayout from "@/app/(app)/overview/layout";
import { CompleteProfileForm } from "@/components/auth/complete-profile-form";

const SECRET = "a-test-cron-secret-0123456789abcdef";
const PROD = { VERCEL_ENV: "production", CRON_SECRET: SECRET };
const ROTATED = { ...PROD, CRON_SECRET: `${SECRET}-rotated` };
const DERIVED = deriveVerifyPassword(SECRET);
const CHOSEN = "A password chosen in Settings 42!";
const saved = { auth: process.env.UNIIVERSE_REQUIRE_AUTH, url: process.env.DATABASE_URL, secret: process.env.UNIIVERSE_AUTH_SECRET, key: process.env.RIOT_API_KEY };

let handle: DbHandle;
beforeAll(() => {
  process.env.UNIIVERSE_REQUIRE_AUTH = "true";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test-only";
  process.env.UNIIVERSE_AUTH_SECRET = "test-secret-0123456789abcdef0123456789";
  delete process.env.RIOT_API_KEY;
});
afterAll(() => {
  for (const [k, v] of [["UNIIVERSE_REQUIRE_AUTH", saved.auth], ["DATABASE_URL", saved.url], ["UNIIVERSE_AUTH_SECRET", saved.secret], ["RIOT_API_KEY", saved.key]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
beforeEach(async () => {
  handle = await testDb();
  state.db = handle.db;
  state.handle = handle;
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  await registerAccount(handle.db, { username: "OwnerUser", password: "Owner-pass-123", role: "owner", primaryRiot: { riotId: "OwnerUser#OCE", platform: "oc1" }, primaryRole: "MID" });
  await registerAccount(handle.db, { username: "MateUser", password: "Mate-pass-123", role: "player", primaryRiot: { riotId: "MateUser#OCE", platform: "oc1" }, primaryRole: "TOP" });
  expect((await ensureVerificationAccount(handle.db, PROD)).summary.state).toBe("created");
}, 60_000);
afterEach(async () => {
  await handle.close();
});

function form(values: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}
/** Signs in through the real loginAction; returns where it sent the browser, or the error. */
async function login(username: string, password: string): Promise<string> {
  await resetThrottle(handle.db);
  state.cookies.clear();
  state.redirects = [];
  try {
    const r = await auth.loginAction(undefined, form({ username, password, next: "/team" }));
    return `error: ${r?.error}`;
  } catch (err) {
    if (String((err as Error).message).startsWith("NEXT_REDIRECT")) return state.redirects.at(-1)!;
    throw err;
  }
}
const opens = async (username: string, password: string) => !!(await authenticate(handle.db, username, password));
const verifyId = async () => (await findUserByUsername(handle.db, VERIFY_USERNAME))!.id;
const sessionCount = async (userId: string) => (await handle.db.select({ id: sessionsTable.id }).from(sessionsTable).where(eq(sessionsTable.userId, userId))).length;
const profileless = async () => (await listUsers(handle.db)).filter((u) => !u.playerId && u.role !== "owner").length;
async function players(): Promise<number> {
  const r = (await handle.db.execute(sql`SELECT count(*)::int AS n FROM players`)) as unknown as { rows?: Array<{ n: number }> } & Array<{ n: number }>;
  return Number((r.rows ?? r)[0]?.n);
}
/** Every string a rendered element tree holds (its text). */
function textOf(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return textOf((node as { props?: { children?: unknown } }).props?.children);
}
function contains(node: unknown, type: unknown): boolean {
  if (Array.isArray(node)) return node.some((n) => contains(n, type));
  if (!node || typeof node !== "object" || !("type" in node) || !("props" in node)) return false;
  const el = node as { type: unknown; props?: { children?: unknown } };
  return el.type === type || contains(el.props?.children, type);
}
/** An administrator's change to the account's access. */
async function change(how: "level" | "admin" | "group" | "custom" | "restricted") {
  const db = handle.db;
  const id = await verifyId();
  const presets = await listPermissionPresets(db);
  if (how === "level") await setAccessLevel(db, null, id, { level: "preset", presetId: presets.find((p) => p.levelKey === "administrator")!.id });
  if (how === "restricted") await setAccessLevel(db, null, id, { level: "preset", presetId: presets.find((p) => p.levelKey === "restricted")!.id });
  if (how === "admin") await setAdministrator(db, null, id, true);
  if (how === "group") await setAccessGroups(db, null, id, ["player-manager"]);
  if (how === "custom") await setAccessLevel(db, null, id, { level: "custom", capabilities: ["view-team", "manage-lineup"] });
}

describe("the job withdraws the derived password from its own account once that changed", () => {
  for (const how of ["level", "admin", "group", "custom", "restricted"] as const) {
    it(`${how}: answers withdrawn, the derived password no longer opens it, its sessions end, and Audit Logs say so`, async () => {
      expect(await login(VERIFY_USERNAME, DERIVED)).toBe("/team");
      const id = await verifyId();
      expect(await sessionCount(id)).toBe(1);
      await change(how);
      const r = await ensureVerificationAccount(handle.db, PROD);
      expect(r).toMatchObject({ ok: false, summary: { state: "withdrawn" } });
      expect(JSON.stringify(r)).not.toContain(DERIVED);
      expect(await opens(VERIFY_USERNAME, DERIVED)).toBe(false);
      expect(await sessionCount(id)).toBe(0);
      const audit = await handle.db.select({ action: auditEvents.action }).from(auditEvents).where(eq(auditEvents.targetId, id));
      expect(audit.map((a) => a.action)).toContain("account.password-withdrawn");
      // The next run cannot tell it from someone else's any more: conflict, and still nothing opens it.
      expect(await ensureVerificationAccount(handle.db, PROD)).toMatchObject({ ok: false, summary: { state: "conflict" } });
      expect(await opens(VERIFY_USERNAME, DERIVED)).toBe(false);
    });
  }

  it("is restored on the next run once the change is undone (password-updated, then unchanged)", async () => {
    await change("level");
    expect((await ensureVerificationAccount(handle.db, PROD)).summary.state).toBe("withdrawn");
    const standard = (await listPermissionPresets(handle.db)).find((p) => p.isDefault)!;
    await setAccessLevel(handle.db, null, await verifyId(), { level: "preset", presetId: standard.id });
    expect((await ensureVerificationAccount(handle.db, PROD)).summary.state).toBe("password-updated");
    expect((await ensureVerificationAccount(handle.db, PROD)).summary.state).toBe("unchanged");
    expect(await opens(VERIFY_USERNAME, DERIVED)).toBe(true);
  });

  it("does not count an edit of the default level, which every new member gets too", async () => {
    const standard = (await listPermissionPresets(handle.db)).find((p) => p.isDefault)!;
    await savePermissionPreset(handle.db, { id: standard.id, name: standard.name, description: standard.description, capabilities: [...standard.capabilities, "manage-matches"] });
    expect(await ensureVerificationAccount(handle.db, PROD)).toMatchObject({ ok: true, summary: { state: "unchanged" } });
    expect(await opens(VERIFY_USERNAME, DERIVED)).toBe(true);
  });

  it("leaves a real member called verify alone (a profile, their own password): conflict, and their password still works", async () => {
    await handle.db.delete(usersTable).where(eq(usersTable.username, VERIFY_USERNAME));
    await registerAccount(handle.db, { username: VERIFY_USERNAME, password: "Their-own-pass-123", role: "player", primaryRiot: { riotId: "Real Verify#OCE", platform: "oc1" }, primaryRole: "ADC" });
    expect(await ensureVerificationAccount(handle.db, PROD)).toMatchObject({ ok: false, summary: { state: "conflict" } });
    expect(await opens(VERIFY_USERNAME, "Their-own-pass-123")).toBe(true);
  });

  it("withdraws it from a changed account that is also deactivated, so reactivating it does not reopen it; then the off switch answers deactivated", async () => {
    const id = await verifyId();
    await change("group");
    await setAccountActive(handle.db, null, id, false);
    expect((await ensureVerificationAccount(handle.db, PROD)).summary.state).toBe("withdrawn");
    expect((await ensureVerificationAccount(handle.db, PROD)).summary.state).toBe("deactivated");
    await setAccountActive(handle.db, null, id, true);
    expect((await ensureVerificationAccount(handle.db, PROD)).summary.state).toBe("conflict");
    expect(await opens(VERIFY_USERNAME, DERIVED)).toBe(false);
  });

  it("ends, on every later run, a session that raced the withdrawal (signed in just before it, created just after)", async () => {
    const id = await verifyId();
    await change("group");
    expect((await ensureVerificationAccount(handle.db, PROD)).summary.state).toBe("withdrawn");
    // The late session of a sign-in that had checked the derived password before the withdrawal committed.
    await createSession(handle.db, id);
    expect(await sessionCount(id)).toBe(1);
    expect((await ensureVerificationAccount(handle.db, PROD)).summary.state).toBe("conflict");
    expect(await sessionCount(id)).toBe(0);
  });

  it("never signs out an account of that name it did not withdraw (a real member called verify, still without a password)", async () => {
    await handle.db.delete(usersTable).where(eq(usersTable.username, VERIFY_USERNAME));
    const real = await registerAccount(handle.db, { username: VERIFY_USERNAME, password: "Their-own-pass-123", role: "player", primaryRiot: { riotId: "Real Verify#OCE", platform: "oc1" }, primaryRole: "ADC" });
    await handle.db.update(usersTable).set({ passwordHash: null }).where(eq(usersTable.id, real.id));
    await createSession(handle.db, real.id);
    expect((await ensureVerificationAccount(handle.db, PROD)).summary.state).toBe("conflict");
    expect(await sessionCount(real.id)).toBe(1);
  });

  it("ends an open session at the withdrawal: it is signed out and cannot set a first password", async () => {
    expect(await login(VERIFY_USERNAME, DERIVED)).toBe("/team");
    await change("group");
    await ensureVerificationAccount(handle.db, PROD);
    expect((await getAuthState(handle.db)).session).toBeNull();
    const r = await usersActions.changeOwnPasswordAction({ current: "", next: CHOSEN, confirm: CHOSEN }).catch((e: Error) => ({ ok: false as const, error: e.message }));
    expect(r.ok).toBe(false);
    expect(await opens(VERIFY_USERNAME, CHOSEN)).toBe(false);
  });
});

describe("the verification account's own Settings cannot change who it is", () => {
  it("refuses a username change, a display-name change and a password change, and the job still answers unchanged", async () => {
    expect(await login(VERIFY_USERNAME, DERIVED)).toBe("/team");
    expect((await account.changeUsernameAction("verify-old")).ok).toBe(false);
    expect((await account.changeDisplayNameAction("Someone Else")).ok).toBe(false);
    expect((await usersActions.changeOwnPasswordAction({ current: DERIVED, next: CHOSEN, confirm: CHOSEN })).ok).toBe(false);
    expect(await findUserByUsername(handle.db, "verify-old")).toBeNull();
    expect((await getUser(handle.db, await verifyId()))!.displayName).toBe(VERIFY_DISPLAY_NAME);
    expect(await opens(VERIFY_USERNAME, CHOSEN)).toBe(false);
    expect(await ensureVerificationAccount(handle.db, PROD)).toMatchObject({ ok: true, summary: { state: "unchanged" } });
  });

  it("so after a CRON_SECRET change the job updates the one account, and the old derived password opens nothing", async () => {
    expect(await login(VERIFY_USERNAME, DERIVED)).toBe("/team");
    await account.changeUsernameAction("verify-old");
    await account.changeDisplayNameAction("Someone Else");
    expect((await ensureVerificationAccount(handle.db, ROTATED)).summary.state).toBe("password-updated");
    expect(await opens(VERIFY_USERNAME, DERIVED)).toBe(false);
    expect(await opens("verify-old", DERIVED)).toBe(false);
    expect(await profileless()).toBe(1);
  });

  it("leaves everyone else their Settings: a member changes their own username, display name and password", async () => {
    expect(await login("MateUser", "Mate-pass-123")).toBe("/team");
    const u = await account.changeUsernameAction("MateUser2");
    const d = await account.changeDisplayNameAction("Mate Two");
    const p = await usersActions.changeOwnPasswordAction({ current: "Mate-pass-123", next: "Mate-pass-456!", confirm: "Mate-pass-456!" });
    expect([u.ok, d.ok, p.ok]).toEqual([true, true, true]);
  });
});

describe("only the Owner completes a missing player profile", () => {
  it("refuses the verification account, which stays out of the players; the job still recognises it", async () => {
    expect(await login(VERIFY_USERNAME, DERIVED)).toBe("/team");
    const before = await players();
    expect((await usersActions.completeProfileAction({ riotId: "Some Name#OCE", platform: "oc1", primaryRole: "MID" })).ok).toBe(false);
    expect(await players()).toBe(before);
    expect(contains(await MePage(), CompleteProfileForm)).toBe(false);
    // Profile (/overview) says the same, with no link to a form it cannot use.
    const overview = textOf(await OverviewLayout({ children: null }));
    expect(overview).toContain("Player profiles are created by an administrator");
    expect(overview).not.toContain("Complete your profile");
    expect((await ensureVerificationAccount(handle.db, PROD)).summary.state).toBe("unchanged");
  });

  it("refuses any other account without a profile too (the verification account under another name)", async () => {
    expect(await login(VERIFY_USERNAME, DERIVED)).toBe("/team");
    await changeUsername(handle.db, await verifyId(), "not-verify");
    expect((await usersActions.completeProfileAction({ riotId: "Other Name#OCE", platform: "oc1", primaryRole: "MID" })).ok).toBe(false);
  });

  it("still lets an Owner without a profile complete it, from /me", async () => {
    const legacy = await createUser(handle.db, { username: "LegacyOwner", password: "Legacy-pass-123", role: "owner" });
    state.cookies.clear();
    state.cookies.set(SESSION_COOKIE, (await createSession(handle.db, legacy.id)).token);
    expect(contains(await MePage(), CompleteProfileForm)).toBe(true);
    expect(textOf(await OverviewLayout({ children: null }))).toContain("Complete your profile");
    expect((await usersActions.completeProfileAction({ riotId: "Legacy Owner#OCE", platform: "oc1", primaryRole: "ADC" })).ok).toBe(true);
  });
});
