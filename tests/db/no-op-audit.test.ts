import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { desc, eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";

/*
  A change that does nothing records nothing (Release 8's report: reactivating an already-active
  account still wrote an audit row). Through the real server actions, each Admin action both ways:
  a real change writes its one audit row; the same call again, which changes nothing, writes none.
  The guards are untouched: a refused call is refused as before, whether or not it would change
  anything.
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
import { createSession } from "@/server/auth/sessions";
import { registerAccount } from "@/server/auth/signup";
import { getUser } from "@/server/repositories/users";
import { listPermissionPresets } from "@/server/repositories/permissions";
import { auditEvents, players } from "@/server/db/schema";
import { setAdministrator } from "@/server/auth/account-admin";
import * as adminActions from "@/server/actions/member-admin";
import * as userActions from "@/server/actions/users";

let handle: DbHandle;
let ownerId: string;
let adminId: string;
let memberId: string;
let memberProfileId: string;

async function signInAs(userId: string): Promise<void> {
  state.cookies.clear();
  const { token } = await createSession(handle.db, userId);
  state.cookies.set(SESSION_COOKIE, token);
}
const rows = async (action: string) => (await handle.db.select({ id: auditEvents.id }).from(auditEvents).where(eq(auditEvents.action, action))).length;

function png(side: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(side, 16);
  b.writeUInt32BE(side, 20);
  return b;
}
const dataUrl = (buf: Buffer) => `data:image/png;base64,${buf.toString("base64")}`;

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
  const member = await registerAccount(handle.db, { username: "Teammate", password: "Teammate-pass-1", role: "player", primaryRiot: { riotId: "Teammate#OCE", platform: "oc1" }, primaryRole: "JUNGLE" });
  memberId = member.id;
  memberProfileId = member.playerId!;
}, 60_000);
afterAll(async () => {
  await handle.close();
  for (const [k, v] of [["UNIIVERSE_REQUIRE_AUTH", saved.auth], ["DATABASE_URL", saved.url], ["UNIIVERSE_AUTH_SECRET", saved.secret], ["RIOT_API_KEY", saved.key]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
beforeEach(() => state.cookies.clear());

/** Runs `call` twice: the first a change (one audit row of `action`), the second the same call, a change that does nothing (no row). */
async function onceThenNothing(action: string, call: () => Promise<{ ok: boolean }>) {
  const start = await rows(action);
  expect(await call(), `${action}: the change`).toMatchObject({ ok: true });
  expect(await rows(action), `${action}: the change is recorded`).toBe(start + 1);
  expect(await call(), `${action}: again`).toMatchObject({ ok: true });
  expect(await rows(action), `${action}: nothing changed, nothing recorded`).toBe(start + 1);
}

describe("a change that does nothing writes no audit row", () => {
  it("deactivate and reactivate: each once, then the same again records nothing", async () => {
    await signInAs(adminId);
    // Reactivating an account that is already active.
    const start = await rows("account.activate");
    expect(await userActions.setAccountActiveAction(memberId, true)).toEqual({ ok: true, data: null });
    expect(await rows("account.activate")).toBe(start);
    await onceThenNothing("account.deactivate", () => userActions.setAccountActiveAction(memberId, false));
    expect((await getUser(handle.db, memberId))!.isActive).toBe(false);
    await onceThenNothing("account.activate", () => userActions.setAccountActiveAction(memberId, true));
    expect((await getUser(handle.db, memberId))!.isActive).toBe(true);
  });

  it("the guards hold for a call that would change nothing: never your own account, the Owner's only by the Owner", async () => {
    await signInAs(adminId);
    const before = await rows("account.activate");
    // An administrator reactivating the (active) Owner account is refused as before, not let through as a no-op.
    expect(await userActions.setAccountActiveAction(ownerId, true)).toMatchObject({ ok: false });
    // Deactivating yourself is refused whatever your state.
    expect(await userActions.setAccountActiveAction(adminId, false)).toMatchObject({ ok: false, error: expect.stringMatching(/your own account/) });
    expect(await rows("account.activate")).toBe(before);
    expect((await getUser(handle.db, adminId))!.isActive).toBe(true);
  });

  it("team membership", async () => {
    await signInAs(adminId);
    const start = await rows("account.team-member");
    expect(await userActions.setTeamMemberAction(memberProfileId, true)).toMatchObject({ ok: true });
    expect(await rows("account.team-member")).toBe(start);
    await onceThenNothing("account.team-member", () => userActions.setTeamMemberAction(memberProfileId, false));
    await onceThenNothing("account.team-member", () => userActions.setTeamMemberAction(memberProfileId, true));
  });

  it("the Owner role kept, access level, groups and permissions", async () => {
    await signInAs(ownerId);
    // The Owner's own role "owner" is no change, and demoting yourself stays refused.
    const role = await rows("account.role");
    expect(await userActions.setAccountRoleAction(memberId, "player")).toMatchObject({ ok: true });
    expect(await rows("account.role")).toBe(role);
    expect(await userActions.setAccountRoleAction(ownerId, "player")).toMatchObject({ ok: false });
    const presets = await listPermissionPresets(handle.db);
    const restricted = presets.find((p) => p.levelKey === "restricted")!;
    await onceThenNothing("account.access", () => userActions.setAccessLevelAction(memberId, { level: "preset", presetId: restricted.id }));
    await onceThenNothing("account.access", () => userActions.setAccessLevelAction(memberId, { level: "custom", capabilities: ["view-team", "manage-lineup"] }));
    await onceThenNothing("account.permissions", () => userActions.setUserPermissionsAction(memberId, { presetId: null }));
    await onceThenNothing("account.permissions", () => userActions.setUserPermissionsAction(memberId, { custom: ["view-team"] }));
    await onceThenNothing("account.groups", () => userActions.setAccessGroupsAction(memberId, ["player-manager"]));
    await onceThenNothing("account.groups", () => userActions.setAccessGroupsAction(memberId, []));
    // The row names what was saved: a name that is no group is dropped, so it is not recorded either.
    expect(await userActions.setAccessGroupsAction(memberId, ["player-manager", "view-teammate-stats"])).toMatchObject({ ok: true });
    const [last] = await handle.db.select({ details: auditEvents.details }).from(auditEvents).where(eq(auditEvents.action, "account.groups")).orderBy(desc(auditEvents.id)).limit(1);
    expect(last!.details).toEqual({ groups: "player-manager" });
  });

  it("administrator access (any administrator grants and removes it, OD8c), each once", async () => {
    await signInAs(adminId);
    await onceThenNothing("account.admin-grant", () => userActions.setAdministratorAction(memberId, true));
    await onceThenNothing("account.admin-revoke", () => userActions.setAdministratorAction(memberId, false));
  });

  it("display name (the Owner's) and picture: the same name, or removing no picture, records nothing", async () => {
    await signInAs(ownerId);
    await onceThenNothing("account.display-name", () => adminActions.setMemberDisplayNameAction(memberId, "Jungle Prime"));
    // The same name after the members' spacing rules is the same name.
    const named = await rows("account.display-name");
    expect(await adminActions.setMemberDisplayNameAction(memberId, "  Jungle   Prime ")).toEqual({ ok: true, data: { displayName: "Jungle Prime" } });
    expect(await rows("account.display-name")).toBe(named);
    // The profile's name (what teammates see) out of step with the account's: setting it is a change, recorded.
    await handle.db.update(players).set({ displayName: "Old Profile" }).where(eq(players.id, memberProfileId));
    expect(await adminActions.setMemberDisplayNameAction(memberId, "Jungle Prime")).toMatchObject({ ok: true });
    expect(await rows("account.display-name")).toBe(named + 1);
    await signInAs(adminId);
    const replaced = await rows("account.picture-replace");
    expect(await adminActions.moderatePictureAction(memberId, dataUrl(png(64)))).toEqual({ ok: true, data: null });
    // A replacement is a new picture each time: always recorded.
    expect(await rows("account.picture-replace")).toBe(replaced + 1);
    await onceThenNothing("account.picture-remove", () => adminActions.moderatePictureAction(memberId, null));
  });
});
