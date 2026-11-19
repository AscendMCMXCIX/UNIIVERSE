import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";

/*
  The owner tools of the overhaul's S9b, through the real server actions:
  - the Owner edits a member's display name (the members' own rules, account and profile in step,
    the public page on its next request); nobody else can, and nobody edits the Owner's this way;
  - members' own name and picture changes refresh the public page too;
  - moderation of pictures and public links, audited, never on the Owner by an administrator;
  - "Sign out everywhere" (the count stays on the server) and "Sign out of other devices";
  - one atomic access save, whose administrator grant is the Owner's and needs a second confirmation;
  - the activity log's filters and keyset "Load older".
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
import { getUser, findUserByUsername } from "@/server/repositories/users";
import { listPermissionPresets } from "@/server/repositories/permissions";
import { getOrCreateTeam, setLineupSlot } from "@/server/repositories/team";
import { auditEvents, players, sessions, users } from "@/server/db/schema";
import { setAdministrator } from "@/server/auth/account-admin";
import { signOutEverywhere } from "@/server/auth/member-admin";
import { ensureVerificationAccount, VERIFY_USERNAME } from "@/server/jobs/verify-account";
import { loadPublicTeam } from "@/server/public/team";
import { loadSocialLinks, setSocialLinks } from "@/server/repositories/profile";
import { queryAudit } from "@/server/audit/log";
import * as adminActions from "@/server/actions/member-admin";
import * as accountActions from "@/server/actions/account";
import * as auditActions from "@/server/actions/audit";

let handle: DbHandle;
let ownerId: string;
let adminId: string;
let memberId: string;
let memberProfileId: string;
let otherId: string;
let teamId: string;

async function signInAs(userId: string): Promise<string> {
  state.cookies.clear();
  const { token } = await createSession(handle.db, userId);
  state.cookies.set(SESSION_COOKIE, token);
  return token;
}
const audit = async (action: string) => handle.db.select().from(auditEvents).where(eq(auditEvents.action, action));
const sessionsOf = async (userId: string) => (await handle.db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId))).length;

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

const saved = { auth: process.env.UNIIVERSE_REQUIRE_AUTH, url: process.env.DATABASE_URL, secret: process.env.UNIIVERSE_AUTH_SECRET, cron: process.env.CRON_SECRET, key: process.env.RIOT_API_KEY };

beforeAll(async () => {
  process.env.UNIIVERSE_REQUIRE_AUTH = "true";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test-only";
  process.env.UNIIVERSE_AUTH_SECRET = "test-secret-0123456789abcdef0123456789";
  delete process.env.RIOT_API_KEY;
  handle = await testDb();
  state.db = handle.db;
  const owner = await registerAccount(handle.db, { username: "Founder", password: "Owner-pass-123", role: "owner", primaryRiot: { riotId: "Founder#OCE", platform: "oc1" }, primaryRole: "MID" });
  ownerId = owner.id;
  const admin = await registerAccount(handle.db, { username: "Captain", password: "Captain-pass-1", role: "player", primaryRiot: { riotId: "Captain#OCE", platform: "oc1" }, primaryRole: "TOP" });
  adminId = admin.id;
  await setAdministrator(handle.db, ownerId, adminId, true);
  const member = await registerAccount(handle.db, { username: "Teammate", password: "Teammate-pass-1", role: "player", primaryRiot: { riotId: "Teammate#OCE", platform: "oc1" }, primaryRole: "JUNGLE" });
  memberId = member.id;
  memberProfileId = member.playerId!;
  const other = await registerAccount(handle.db, { username: "Benchy", password: "Benchy-pass-12", role: "player", primaryRiot: { riotId: "Benchy#OCE", platform: "oc1" }, primaryRole: "SUPPORT" });
  otherId = other.id;
  teamId = (await getOrCreateTeam(handle.db)).id;
  await setLineupSlot(handle.db, teamId, "JUNGLE", memberProfileId);
  process.env.CRON_SECRET = "member-admin-cron-secret-0123456789";
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

const publicText = async () => JSON.stringify(await loadPublicTeam(handle.db, teamId, false));

describe("the Owner edits a member's display name", () => {
  it("keeps account and profile in step, follows the members' rules, invalidates the public page and is audited", async () => {
    expect(await publicText()).toContain("Teammate");
    await signInAs(ownerId);
    expect(await adminActions.setMemberDisplayNameAction(memberId, "x")).toMatchObject({ ok: false, error: expect.stringMatching(/^Display name:/) });
    expect(await adminActions.setMemberDisplayNameAction(memberId, "  Jungle   Prime ")).toEqual({ ok: true, data: { displayName: "Jungle Prime" } });
    const user = (await getUser(handle.db, memberId))!;
    const [profile] = await handle.db.select({ name: players.displayName }).from(players).where(eq(players.id, memberProfileId));
    expect(user.displayName).toBe("Jungle Prime");
    expect(profile!.name).toBe("Jungle Prime");
    // The username and the ids stay as they were.
    expect(user.username).toBe("Teammate");
    expect(user.playerId).toBe(memberProfileId);
    // The public page's cached copy is dropped: the next request shows the new name.
    expect(await publicText()).toContain("Jungle Prime");
    const [row] = await audit("account.display-name");
    expect(row).toMatchObject({ actorUserId: ownerId, targetId: memberId, targetName: "Teammate", details: {} });
  });

  it("is refused to an administrator and a member, to the Owner's own account here, and on the verification account", async () => {
    for (const who of [adminId, otherId]) {
      await signInAs(who);
      expect(await adminActions.setMemberDisplayNameAction(memberId, "Renamed"), who).toMatchObject({ ok: false, error: expect.stringMatching(/Only the Owner/) });
      expect(await adminActions.setMemberDisplayNameAction(ownerId, "Renamed"), who).toMatchObject({ ok: false, error: expect.stringMatching(/Only the Owner/) });
    }
    await signInAs(ownerId);
    expect(await adminActions.setMemberDisplayNameAction(ownerId, "Renamed")).toMatchObject({ ok: false });
    const verify = (await findUserByUsername(handle.db, VERIFY_USERNAME))!;
    expect(await adminActions.setMemberDisplayNameAction(verify.id, "Renamed")).toMatchObject({ ok: false, error: expect.stringMatching(/kept automatically/) });
    expect((await getUser(handle.db, memberId))!.displayName).toBe("Jungle Prime");
    expect((await getUser(handle.db, ownerId))!.displayName).not.toBe("Renamed");
  });
});

describe("members' own changes", () => {
  it("show on the public page at the next request after their own name change", async () => {
    expect(await publicText()).toContain("Jungle Prime");
    await signInAs(memberId);
    expect((await accountActions.changeDisplayNameAction("Woodland")).ok).toBe(true);
    expect(await publicText()).toContain("Woodland");
    expect(await publicText()).not.toContain("Jungle Prime");
  });

  it("Sign out of other devices keeps the current session and ends the rest, with no count returned", async () => {
    const elsewhere = await signInAs(memberId);
    const current = await signInAs(memberId);
    expect(await sessionsOf(memberId)).toBeGreaterThanOrEqual(2);
    expect(await accountActions.signOutOtherDevicesAction()).toEqual({ ok: true, data: null });
    expect(await sessionsOf(memberId)).toBe(1);
    expect(await findSession(handle.db, current)).not.toBeNull();
    expect(await findSession(handle.db, elsewhere)).toBeNull();
  });
});

describe("moderation", () => {
  it("replaces and removes a member's picture, audited; an administrator never on the Owner", async () => {
    await signInAs(adminId);
    expect(await adminActions.moderatePictureAction(memberId, dataUrl(png(64)))).toEqual({ ok: true, data: null });
    expect((await getUser(handle.db, memberId))!.avatarVersion).not.toBeNull();
    expect(await adminActions.moderatePictureAction(memberId, null)).toEqual({ ok: true, data: null });
    expect((await getUser(handle.db, memberId))!.avatarVersion).toBeNull();
    expect((await audit("account.picture-replace")).length).toBe(1);
    expect((await audit("account.picture-remove")).length).toBe(1);
    expect(await adminActions.moderatePictureAction(ownerId, null)).toMatchObject({ ok: false, error: expect.stringMatching(/Only the Owner/) });
    await signInAs(otherId);
    expect(await adminActions.moderatePictureAction(memberId, null)).toMatchObject({ ok: false });
  });

  it("hides a public link (kept for its owner) or removes it, audited by the link's name only", async () => {
    await setSocialLinks(handle.db, memberProfileId, { youtube: { value: "https://www.youtube.com/@example", public: true }, discord: { value: "example", public: true } });
    await signInAs(adminId);
    expect(await adminActions.moderateSocialLinkAction(memberProfileId, "youtube", "hide")).toEqual({ ok: true, data: null });
    expect(await adminActions.moderateSocialLinkAction(memberProfileId, "discord", "remove")).toEqual({ ok: true, data: null });
    const links = (await loadSocialLinks(handle.db, [memberProfileId])).get(memberProfileId);
    expect(links).toEqual({ youtube: { value: "https://www.youtube.com/@example", public: false } });
    const [hide] = await audit("account.link-hide");
    expect(hide!.details).toEqual({ link: "YouTube" });
    expect(JSON.stringify(hide)).not.toContain("example");
    const ownerProfile = (await getUser(handle.db, ownerId))!.playerId!;
    await setSocialLinks(handle.db, ownerProfile, { twitch: { value: "https://www.twitch.tv/example", public: true } });
    expect(await adminActions.moderateSocialLinkAction(ownerProfile, "twitch", "remove")).toMatchObject({ ok: false, error: expect.stringMatching(/Only the Owner/) });
    await signInAs(otherId);
    expect(await adminActions.moderateSocialLinkAction(memberProfileId, "youtube", "remove")).toMatchObject({ ok: false });
  });
});

describe("Sign out everywhere", () => {
  it("returns its count on the server, refuses the old token, and is audited without the count", async () => {
    const old = await signInAs(memberId);
    await signInAs(memberId);
    const live = await sessionsOf(memberId);
    expect(live).toBeGreaterThanOrEqual(2);
    expect(await signOutEverywhere(handle.db, ownerId, memberId)).toBe(live);
    expect(await findSession(handle.db, old)).toBeNull();
    await signInAs(memberId);
    await signInAs(adminId);
    expect(await adminActions.signOutEverywhereAction(memberId)).toEqual({ ok: true, data: null });
    expect(await sessionsOf(memberId)).toBe(0);
    const rows = await audit("account.sign-out-everywhere");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.details).toEqual({});
  });

  it("is refused to a member, on the Owner by an administrator, on your own account and on the verification account", async () => {
    const ownerToken = await signInAs(ownerId);
    await signInAs(otherId);
    expect(await adminActions.signOutEverywhereAction(memberId)).toMatchObject({ ok: false });
    await signInAs(adminId);
    expect(await adminActions.signOutEverywhereAction(ownerId)).toMatchObject({ ok: false, error: expect.stringMatching(/Only the Owner/) });
    expect(await findSession(handle.db, ownerToken)).not.toBeNull();
    expect(await adminActions.signOutEverywhereAction(adminId)).toMatchObject({ ok: false, error: expect.stringMatching(/Sign out of other devices/) });
    const verify = (await findUserByUsername(handle.db, VERIFY_USERNAME))!;
    expect(await adminActions.signOutEverywhereAction(verify.id)).toMatchObject({ ok: false, error: expect.stringMatching(/kept automatically/) });
  });
});

describe("the atomic access save", () => {
  it("saves level, groups and administrator access together, and the grant needs the Owner and a second confirmation", async () => {
    const standard = (await listPermissionPresets(handle.db)).find((p) => p.levelKey === "standard")!;
    await signInAs(adminId);
    // An administrator cannot make another administrator.
    expect(await adminActions.saveAccessAction(otherId, { level: { level: "preset", presetId: standard.id }, groups: [], administrator: true, confirmAdministrator: true })).toMatchObject({ ok: false, error: expect.stringMatching(/Only the Owner grants/) });
    await signInAs(ownerId);
    expect(await adminActions.saveAccessAction(otherId, { level: { level: "preset", presetId: standard.id }, groups: ["lineup-manager"], administrator: true })).toMatchObject({ ok: false, error: expect.stringMatching(/Confirm/) });
    expect((await getUser(handle.db, otherId))!).toMatchObject({ isAdmin: false, accessGroups: [] });
    expect(await adminActions.saveAccessAction(otherId, { level: { level: "preset", presetId: standard.id }, groups: ["lineup-manager"], administrator: true, confirmAdministrator: true })).toEqual({ ok: true, data: null });
    expect((await getUser(handle.db, otherId))!).toMatchObject({ isAdmin: true, accessGroups: ["lineup-manager"] });
    expect((await audit("account.admin-grant")).some((r) => r.targetId === otherId)).toBe(true);
    // Removing it needs no second confirmation.
    expect(await adminActions.saveAccessAction(otherId, { level: { level: "preset", presetId: standard.id }, groups: [], administrator: false })).toEqual({ ok: true, data: null });
    expect((await getUser(handle.db, otherId))!).toMatchObject({ isAdmin: false, accessGroups: [] });
  });

  it("rolls back every part when one fails", async () => {
    await signInAs(ownerId);
    await handle.db.update(users).set({ isActive: false }).where(eq(users.id, otherId));
    const before = (await getUser(handle.db, otherId))!;
    const r = await adminActions.saveAccessAction(otherId, { level: { level: "custom", capabilities: ["view-team"] }, groups: ["match-manager"], administrator: true, confirmAdministrator: true });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/Reactivate it first/) });
    const after = (await getUser(handle.db, otherId))!;
    expect(after).toMatchObject({ isAdmin: false, accessGroups: before.accessGroups, hasCustomCapabilities: before.hasCustomCapabilities, permissionPresetId: before.permissionPresetId });
    await handle.db.update(users).set({ isActive: true }).where(eq(users.id, otherId));
  });

  it("never acts on the Owner, on your own account or on the verification account", async () => {
    const standard = (await listPermissionPresets(handle.db)).find((p) => p.levelKey === "standard")!;
    const choice = { level: { level: "preset" as const, presetId: standard.id }, groups: [], administrator: false };
    await signInAs(adminId);
    expect(await adminActions.saveAccessAction(ownerId, choice)).toMatchObject({ ok: false });
    expect(await adminActions.saveAccessAction(adminId, choice)).toMatchObject({ ok: false, error: expect.stringMatching(/your own account/) });
    const verify = (await findUserByUsername(handle.db, VERIFY_USERNAME))!;
    expect(await adminActions.saveAccessAction(verify.id, choice)).toMatchObject({ ok: false, error: expect.stringMatching(/kept automatically/) });
    expect((await getUser(handle.db, ownerId))!.role).toBe("owner");
    expect((await getUser(handle.db, adminId))!.isAdmin).toBe(true);
  });
});

describe("the activity log", () => {
  it("filters by person, category and date, and Load older continues by keyset without gaps", async () => {
    // 120 entries in the same second, about one account: the keyset must not skip or repeat any.
    const at = new Date("2026-11-01T10:00:00.123Z");
    await handle.db.insert(auditEvents).values(Array.from({ length: 120 }, (_, i) => ({ at: new Date(at.getTime() + (i % 3)), actorUserId: ownerId, actorName: "Founder", action: "account.activate", targetType: "user", targetId: otherId, targetName: "Benchy", details: {} })));
    const filters = { person: otherId, category: "accounts", from: "2026-11-01", to: "2026-11-01" };
    await signInAs(ownerId);
    const first = await queryAudit(handle.db, { person: { userId: otherId, playerId: null }, actions: ["account.activate"], from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-11-02T00:00:00Z"), limit: 50 });
    expect(first).toHaveLength(50);
    const seen = new Set(first.map((e) => e.id));
    let last = first.at(-1)!;
    for (;;) {
      const r = await auditActions.loadOlderAuditAction(filters, { at: last.at.toISOString(), id: last.id });
      if (!r.ok) throw new Error(r.error);
      for (const e of r.data.entries) {
        expect(seen.has(e.id)).toBe(false);
        seen.add(e.id);
      }
      if (!r.data.more) break;
      last = r.data.entries.at(-1)!;
    }
    expect(seen.size).toBe(120);
    // Another day, another person or another category: none of them.
    expect(await queryAudit(handle.db, { person: { userId: otherId, playerId: null }, from: new Date("2026-11-02T00:00:00Z"), to: new Date("2026-11-03T00:00:00Z") })).toHaveLength(0);
    expect((await queryAudit(handle.db, { person: { userId: memberId, playerId: memberProfileId }, limit: 200 })).every((e) => e.action !== "account.activate")).toBe(true);
    // A member cannot read the log.
    await signInAs(memberId);
    expect(await auditActions.loadOlderAuditAction(filters, { at: last.at.toISOString(), id: last.id })).toMatchObject({ ok: false });
  });
});
