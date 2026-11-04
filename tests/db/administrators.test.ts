import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";

/*
  Administrator access (migration 0053): a permission on top of a player account, not an account
  of its own. Through the real server actions, pages, layouts and the mode switch: who can grant
  it, what it opens, what it never touches (the Owner account, the player's own data and level),
  and that removing it takes effect on the account's next request, saved preference included.
*/

const state = vi.hoisted(() => ({ db: null as unknown, cookies: new Map<string, string>(), redirects: [] as string[] }));

vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.cookies.has(name) ? { name, value: state.cookies.get(name)! } : undefined),
    set: (name: string, value: string) => void state.cookies.set(name, value),
    delete: (name: string) => void state.cookies.delete(name),
  }),
  headers: async () => new Headers({ "user-agent": "vitest", "x-forwarded-for": "203.0.113.10" }),
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

import { SESSION_COOKIE, getSession } from "@/server/auth/session";
import { createSession } from "@/server/auth/sessions";
import { registerAccount } from "@/server/auth/signup";
import { getUser } from "@/server/repositories/users";
import { listPermissionPresets } from "@/server/repositories/permissions";
import { users } from "@/server/db/schema";
import { requirePageAccess } from "@/server/auth/page-access";
import { canUseAdminArea } from "@/server/auth/permissions";
import { setAdministrator } from "@/server/auth/account-admin";
import { listAudit } from "@/server/audit/log";
import { runJob } from "@/server/jobs";
import { VIEW_COOKIE } from "@/server/auth/view-mode";
import * as usersActions from "@/server/actions/users";
import { GET as modeRoute } from "@/app/api/mode/route";
import AdminModeLayout from "@/app/(admin)/layout";
import AdminSettingsPage from "@/app/(admin)/admin/settings/page";
import Home from "@/app/page";

let handle: DbHandle;
let ownerId: string;
let adminId: string;
let adminProfileId: string;
let otherId: string;
let benchId: string;

/** Signs this test's "browser" in to an account (a real session), keeping other cookies unless told. */
async function signInAs(userId: string, keep: Record<string, string> = {}) {
  state.cookies.clear();
  const { token } = await createSession(handle.db, userId);
  state.cookies.set(SESSION_COOKIE, token);
  for (const [k, v] of Object.entries(keep)) state.cookies.set(k, v);
  return token;
}

async function redirectOf(p: Promise<unknown> | (() => unknown)): Promise<string | null> {
  try {
    await (typeof p === "function" ? p() : p);
    return null;
  } catch (err) {
    const m = String((err as Error).message);
    return m.startsWith("NEXT_REDIRECT ") ? m.slice("NEXT_REDIRECT ".length) : `error: ${m}`;
  }
}

/** The switch route as a browser with the current cookies would call it. */
async function switchMode(to: "admin" | "player") {
  const res = await modeRoute(new NextRequest(`http://localhost/api/mode?to=${to}`));
  const cookie = res.cookies.get(VIEW_COOKIE);
  return { status: res.status, location: res.headers.get("location"), cookie: cookie ? { value: cookie.value, maxAge: cookie.maxAge } : null };
}

beforeAll(async () => {
  process.env.UNIIVERSE_REQUIRE_AUTH = "true";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test-only";
  process.env.UNIIVERSE_AUTH_SECRET = "test-secret-0123456789abcdef0123456789";
  handle = await testDb();
  state.db = handle.db;
  // The deployment's shape: an admin-only Owner (no player profile) and players.
  const owner = await registerAccount(handle.db, { username: "Founder", password: "Owner-pass-123", role: "owner", primaryRiot: { riotId: "Founder#OCE", platform: "oc1" }, primaryRole: "MID" });
  ownerId = owner.id;
  await handle.db.update(users).set({ playerId: null }).where(eq(users.id, ownerId));
  const admin = await registerAccount(handle.db, { username: "Captain", password: "Captain-pass-1", role: "player", primaryRiot: { riotId: "Captain#OCE", platform: "oc1" }, primaryRole: "TOP" });
  adminId = admin.id;
  adminProfileId = admin.playerId!;
  const other = await registerAccount(handle.db, { username: "Teammate", password: "Teammate-pass-1", role: "player", primaryRiot: { riotId: "Teammate#OCE", platform: "oc1" }, primaryRole: "JUNGLE" });
  otherId = other.id;
  const bench = await registerAccount(handle.db, { username: "Bench", password: "Bench-pass-123", role: "player", primaryRiot: { riotId: "Bench#OCE", platform: "oc1" }, primaryRole: "SUPPORT" });
  benchId = bench.id;
});
afterAll(async () => {
  await handle.close();
  delete process.env.UNIIVERSE_REQUIRE_AUTH;
});
beforeEach(() => {
  state.redirects.length = 0;
});

describe("administrator access", () => {
  it("is off for everyone after the migration: nobody became an administrator", async () => {
    expect((await getUser(handle.db, adminId))!.isAdmin).toBe(false);
    expect((await getUser(handle.db, otherId))!.isAdmin).toBe(false);
    await signInAs(adminId);
    expect(canUseAdminArea(await getSession())).toBe(false);
    expect(await redirectOf(requirePageAccess("manage-users"))).toBe("/no-access");
    // The Team Manager level still never opens Admin Mode, and now says who does.
    const teamManager = (await listPermissionPresets(handle.db)).find((p) => p.name === "Team Manager")!;
    expect(teamManager.description).toMatch(/Never Admin Mode, accounts or site settings \(administrators only\)\.$/);
  });

  it("only an administrator can grant it: a player, even a lineup manager, cannot", async () => {
    await signInAs(otherId);
    expect(await usersActions.setAdministratorAction(adminId, true)).toMatchObject({ ok: false });
    await handle.db.update(users).set({ accessGroups: ["lineup-manager", "player-manager", "match-manager"] }).where(eq(users.id, otherId));
    await signInAs(otherId);
    expect(await usersActions.setAdministratorAction(otherId, true)).toMatchObject({ ok: false });
    expect(await usersActions.setAdministratorAction(adminId, true)).toMatchObject({ ok: false });
    await handle.db.update(users).set({ accessGroups: [] }).where(eq(users.id, otherId));
    expect((await getUser(handle.db, adminId))!.isAdmin).toBe(false);
  });

  it("the Owner grants it to a player account, which keeps its profile, level and data, and opens Admin Mode at its next request", async () => {
    const before = (await getUser(handle.db, adminId))!;
    const playerToken = await signInAs(adminId);
    await signInAs(ownerId);
    expect(await usersActions.setAdministratorAction(adminId, true)).toEqual({ ok: true, data: null });
    const after = (await getUser(handle.db, adminId))!;
    expect(after).toMatchObject({ isAdmin: true, role: "player", playerId: adminProfileId, permissionPresetId: before.permissionPresetId, accessGroups: before.accessGroups, username: "Captain" });
    // The session the player already had is an administrator's now: no new sign-in, no second account.
    state.cookies.clear();
    state.cookies.set(SESSION_COOKIE, playerToken);
    const session = (await getSession())!;
    expect(session).toMatchObject({ userId: adminId, role: "player", admin: true, playerId: adminProfileId });
    expect(canUseAdminArea(session)).toBe(true);
    expect(await redirectOf(requirePageAccess("manage-users"))).toBeNull();
    expect(await redirectOf(requirePageAccess("manage-branding"))).toBeNull();
    expect(await redirectOf(requirePageAccess("manage-data"))).toBeNull();
    const entry = (await listAudit(handle.db, 5)).find((e) => e.action === "account.admin-grant");
    expect(entry).toMatchObject({ actorName: "Founder", targetName: "Captain" });
  });

  it("an administrator manages other accounts, but never the Owner account or their own administrator access", async () => {
    await signInAs(adminId);
    // Other accounts: yes.
    const reset = await usersActions.resetPasswordAction(benchId);
    expect(reset.ok).toBe(true);
    // The Owner account: refused on the server, whatever the page shows.
    expect(await usersActions.resetPasswordAction(ownerId)).toMatchObject({ ok: false, error: expect.stringMatching(/Only the Owner/) });
    expect(await usersActions.setAccountActiveAction(ownerId, false)).toMatchObject({ ok: false, error: expect.stringMatching(/Only the Owner/) });
    expect(await usersActions.deleteAccountAction(ownerId)).toMatchObject({ ok: false, error: expect.stringMatching(/Only the Owner/) });
    expect(await usersActions.setAccountRoleAction(ownerId, "player")).toMatchObject({ ok: false });
    const standard = (await listPermissionPresets(handle.db)).find((p) => p.levelKey === "standard")!;
    expect(await usersActions.setAccessLevelAction(ownerId, { level: "preset", presetId: standard.id })).toMatchObject({ ok: false, error: expect.stringMatching(/Only the Owner/) });
    expect(await usersActions.setAdministratorAction(ownerId, false)).toMatchObject({ ok: false, error: expect.stringMatching(/always an administrator/) });
    // Their own: refused (no self-elevation, no locking yourself out), including the player access
    // they would keep if their administrator access were removed.
    expect(await usersActions.setAdministratorAction(adminId, false)).toMatchObject({ ok: false, error: expect.stringMatching(/your own account/) });
    expect(await usersActions.setUserPermissionsAction(adminId, { custom: ["view-team", "manage-players"] })).toMatchObject({ ok: false, error: expect.stringMatching(/your own account/) });
    expect(await usersActions.setAccessLevelAction(adminId, { level: "custom", capabilities: ["view-team", "manage-players"] })).toMatchObject({ ok: false, error: expect.stringMatching(/your own account/) });
    expect(await usersActions.setAccessGroupsAction(adminId, ["player-manager"])).toMatchObject({ ok: false, error: expect.stringMatching(/your own account/) });
    expect((await getUser(handle.db, adminId))!).toMatchObject({ hasCustomCapabilities: false, accessGroups: [] });
    expect((await getUser(handle.db, ownerId))!).toMatchObject({ role: "owner", isActive: true });
    // Nobody is made an Owner.
    expect(await usersActions.setAccessLevelAction(otherId, { level: "owner" })).toMatchObject({ ok: false, error: expect.stringMatching(/one Owner/) });
  });

  it("supports several administrators: one administrator can grant and remove it for another", async () => {
    await signInAs(adminId);
    expect((await usersActions.setAdministratorAction(otherId, true)).ok).toBe(true);
    expect((await getUser(handle.db, otherId))!.isAdmin).toBe(true);
    // The read-only account audit counts them, and names none.
    const audit = await runJob(handle.db, "auth-audit", "cli");
    expect((audit.summary as { administrators: unknown }).administrators).toEqual({ active: 2, deactivated: 0 });
    expect(JSON.stringify(audit.summary)).not.toContain("Teammate");
    expect((await usersActions.setAdministratorAction(otherId, false)).ok).toBe(true);
    expect((await getUser(handle.db, otherId))!.isAdmin).toBe(false);
    const actions = (await listAudit(handle.db, 10)).filter((e) => e.targetName === "Teammate").map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["account.admin-grant", "account.admin-revoke"]));
    // A repeated request changes nothing and records nothing.
    const count = (await listAudit(handle.db, 100)).length;
    expect((await usersActions.setAdministratorAction(otherId, false)).ok).toBe(true);
    expect((await listAudit(handle.db, 100)).length).toBe(count);
  });

  it("is never given to a deactivated account, and the last active administrator keeps it", async () => {
    await handle.db.update(users).set({ isActive: false }).where(eq(users.id, otherId));
    await expect(setAdministrator(handle.db, ownerId, otherId, true)).rejects.toThrow(/Reactivate it first/);
    await handle.db.update(users).set({ isActive: true }).where(eq(users.id, otherId));
    // With the Owner unable to sign in (as during a recovery), the one administrator left stays one.
    await handle.db.update(users).set({ isActive: false }).where(eq(users.id, ownerId));
    await expect(setAdministrator(handle.db, null, adminId, false)).rejects.toThrow(/last active administrator/);
    await handle.db.update(users).set({ isActive: true }).where(eq(users.id, ownerId));
  });

  it("switching modes is checked on the server: administrators get Admin Mode and their choice is remembered, anyone else gets Player Mode", async () => {
    await signInAs(adminId);
    expect(await switchMode("admin")).toMatchObject({ status: 303, location: "/admin", cookie: { value: "admin" } });
    expect(await switchMode("player")).toMatchObject({ status: 303, location: "/team", cookie: { value: "player" } });
    // "/" opens the mode used last.
    await signInAs(adminId, { [VIEW_COOKIE]: "admin" });
    expect(await redirectOf(Home())).toBe("/admin");
    await signInAs(adminId, { [VIEW_COOKIE]: "player" });
    expect(await redirectOf(Home())).toBe("/team");
    // A player asking for Admin Mode lands in Player Mode, with no preference kept.
    await signInAs(otherId);
    expect(await switchMode("admin")).toMatchObject({ status: 303, location: "/team", cookie: { value: "", maxAge: 0 } });
    // The Owner without a profile opens Admin Mode by default, and has a Player Mode too.
    await signInAs(ownerId);
    expect(await redirectOf(Home())).toBe("/admin");
    expect(await switchMode("player")).toMatchObject({ location: "/team", cookie: { value: "player" } });
  });

  it("an /admin address sends anyone who is not an administrator to Player Mode", async () => {
    await signInAs(otherId);
    expect(await redirectOf(AdminModeLayout({ children: null }))).toBe("/api/mode?to=player");
    // The pages check again (a layout does not run again on every navigation): Admin Mode's
    // account settings send a player to the same page in Player Mode.
    expect(await redirectOf(AdminSettingsPage())).toBe("/settings");
    await signInAs(adminId);
    expect(await redirectOf(AdminSettingsPage())).toBeNull();
  });

  it("removing it takes effect on the account's next request: Admin Mode, its pages, its actions and the saved preference all close", async () => {
    const adminToken = await signInAs(adminId, { [VIEW_COOKIE]: "admin" });
    expect(canUseAdminArea(await getSession())).toBe(true);
    await signInAs(ownerId);
    expect((await usersActions.setAdministratorAction(adminId, false)).ok).toBe(true);
    // The same browser and session as before, with the Admin Mode preference still saved.
    state.cookies.clear();
    state.cookies.set(SESSION_COOKIE, adminToken);
    state.cookies.set(VIEW_COOKIE, "admin");
    const session = (await getSession())!;
    expect(session.admin).toBe(false);
    expect(canUseAdminArea(session)).toBe(false);
    expect(await redirectOf(AdminModeLayout({ children: null }))).toBe("/api/mode?to=player");
    expect(await redirectOf(requirePageAccess("manage-users"))).toBe("/no-access");
    expect(await usersActions.resetPasswordAction(benchId)).toMatchObject({ ok: false });
    // "/" notices the stale preference and the switch route removes it.
    expect(await redirectOf(Home())).toBe("/api/mode?to=player");
    expect(await switchMode("player")).toMatchObject({ location: "/team", cookie: { value: "", maxAge: 0 } });
    // Still the same player: profile, level and sign-in untouched.
    expect((await getUser(handle.db, adminId))!).toMatchObject({ role: "player", playerId: adminProfileId, isActive: true, isAdmin: false });
    expect((await listAudit(handle.db, 5)).find((e) => e.action === "account.admin-revoke")).toMatchObject({ actorName: "Founder", targetName: "Captain" });
  });
});
