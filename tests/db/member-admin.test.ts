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
import * as usersActions from "@/server/actions/users";
import * as playerActions from "@/server/actions/players";
import * as riotAccountActions from "@/server/actions/accounts";
import { riotAccounts } from "@/server/db/schema";
import * as accountActions from "@/server/actions/account";
import * as auditActions from "@/server/actions/audit";
import { loadNeedsYou } from "@/server/admin/needs-you";
import { listAccountViews } from "@/server/auth/account-admin";
import { setScheduleOverrides } from "@/server/jobs/scheduler";
import { setTemporaryPassword } from "@/server/repositories/users";
import { dataRefreshStatus } from "@/server/db/schema";
import { formatDate, isoDay } from "@/lib/format";

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

  it("never touches a link its owner keeps to themselves, answered as one that is not there, nor your own profile's links (R6 review SR6-SEC-2)", async () => {
    const kept = { discord: { value: "example", public: false } };
    await setSocialLinks(handle.db, memberProfileId, kept);
    const before = (await audit("account.link-hide")).length + (await audit("account.link-remove")).length;
    await signInAs(adminId);
    const absent = await adminActions.moderateSocialLinkAction(memberProfileId, "twitch", "hide");
    expect(absent).toEqual({ ok: false, error: "That link is not there any more." });
    // A private link gets the very same answer, hidden or removed: nothing tells it apart from none.
    expect(await adminActions.moderateSocialLinkAction(memberProfileId, "discord", "hide")).toEqual(absent);
    expect(await adminActions.moderateSocialLinkAction(memberProfileId, "discord", "remove")).toEqual(absent);
    expect((await loadSocialLinks(handle.db, [memberProfileId])).get(memberProfileId)).toEqual(kept);
    // Your own profile's links are yours to change in Settings, not here.
    const ownProfile = (await getUser(handle.db, adminId))!.playerId!;
    const own = { youtube: { value: "https://www.youtube.com/@example", public: true } };
    await setSocialLinks(handle.db, ownProfile, own);
    expect(await adminActions.moderateSocialLinkAction(ownProfile, "youtube", "hide")).toEqual({ ok: false, error: "You cannot moderate the links of your own account." });
    expect(await adminActions.moderateSocialLinkAction(ownProfile, "youtube", "remove")).toMatchObject({ ok: false });
    expect((await loadSocialLinks(handle.db, [ownProfile])).get(ownProfile)).toEqual(own);
    // Nothing refused was recorded as done.
    expect((await audit("account.link-hide")).length + (await audit("account.link-remove")).length).toBe(before);
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
  it("saves level, groups and administrator access together, and the grant needs a second confirmation", async () => {
    const standard = (await listPermissionPresets(handle.db)).find((p) => p.levelKey === "standard")!;
    // Only the Owner grants it (OD8c, 23 Nov 2026): an administrator's save is refused and changes nothing.
    await signInAs(adminId);
    expect(await adminActions.saveAccessAction(otherId, { level: { level: "preset", presetId: standard.id }, groups: ["lineup-manager"], administrator: true, confirmAdministrator: true })).toMatchObject({ ok: false, error: expect.stringMatching(/Only the Owner grants administrator access/) });
    expect((await getUser(handle.db, otherId))!).toMatchObject({ isAdmin: false, accessGroups: [] });
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

  it("records each change as it was made, and nothing that did not change (R6 review SR6-SEC-3)", async () => {
    const standard = (await listPermissionPresets(handle.db)).find((p) => p.levelKey === "standard")!;
    const level = { level: "preset" as const, presetId: standard.id };
    const lastId = async () => Math.max(0, ...(await handle.db.select({ id: auditEvents.id }).from(auditEvents)).map((r) => r.id));
    /** What a save wrote, as the activity log reads it. */
    const save = async (input: Parameters<typeof adminActions.saveAccessAction>[1]) => {
      const mark = await lastId();
      expect(await adminActions.saveAccessAction(otherId, input)).toEqual({ ok: true, data: null });
      return (await handle.db.select().from(auditEvents)).filter((r) => r.id > mark).map((r) => ({ action: r.action, details: r.details }));
    };
    await signInAs(ownerId);
    // The team membership alone: its own row, no level or groups said to have changed.
    expect(await save({ level, groups: [], administrator: false, teamMember: false })).toEqual([{ action: "account.team-member", details: { teamMember: false } }]);
    // A group added, then swapped for another: each row names the groups, so the two differ.
    expect(await save({ level, groups: ["player-manager"], administrator: false, teamMember: false })).toEqual([{ action: "account.groups", details: { groups: "player-manager" } }]);
    expect(await save({ level, groups: ["match-manager"], administrator: false, teamMember: false })).toEqual([{ action: "account.groups", details: { groups: "match-manager" } }]);
    // Saved again unchanged: nothing.
    expect(await save({ level, groups: ["match-manager"], administrator: false, teamMember: false })).toEqual([]);
    // The level alone.
    expect(await save({ level: { level: "custom", capabilities: ["view-team"] }, groups: ["match-manager"], administrator: false, teamMember: false })).toEqual([{ action: "account.access", details: { level: "custom" } }]);
    // Back as it was: the three parts, each once.
    expect((await save({ level, groups: [], administrator: false, teamMember: true })).map((r) => r.action).sort()).toEqual(["account.access", "account.groups", "account.team-member"]);
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

describe("the Dashboard's Needs you", () => {
  it("lists an expired temporary password, the LP schedule turned off with who and when, and a job at interval 0", async () => {
    const day = 86_400_000;
    await setTemporaryPassword(handle.db, otherId, { now: new Date(Date.now() - 30 * day) });
    const on = new Date(Date.now() - 3 * day);
    const off = new Date(Date.now() - 2 * day);
    await handle.db.insert(dataRefreshStatus).values([
      { key: "rank-schedule", status: "ok", lastStartedAt: on, lastSuccessAt: on },
      { key: "rank-schedule-off", status: "ok", lastStartedAt: off, lastSuccessAt: off },
    ]);
    await handle.db.insert(auditEvents).values({ at: off, actorUserId: ownerId, actorName: "Founder", action: "jobs.run", targetType: "job", targetName: "rank-schedule-off", details: { ok: true, kind: "setup" } });
    await setScheduleOverrides(handle.db, { intervals: { integrity: 0 } });
    await handle.db.insert(auditEvents).values({ at: off, actorUserId: adminId, actorName: "Captain", action: "jobs.schedule", targetType: "job", targetName: "integrity", details: { fromMinutes: 60, toMinutes: 0 } });
    const items = await loadNeedsYou(handle.db, await listAccountViews(handle.db));
    const text = items.map((i) => i.text).join("\n");
    expect(items.find((i) => i.key === `expired-${otherId}`)).toMatchObject({ href: `/admin/people?person=${otherId}` });
    expect(text).toMatch(/Benchy's temporary password expired/);
    const schedule = items.find((i) => i.key === "schedule-off")!;
    expect(schedule.text).toMatch(/^The LP five-minute schedule was turned off by Founder on /);
    expect(schedule.href).toMatch(/^\/admin\/audit\?category=data&from=\d{4}-\d{2}-\d{2}&to=/);
    expect(items.find((i) => i.key === "off-integrity")!.text).toMatch(/^integrity is off \(interval 0\), set by Captain on /);
    // No session count, no password, anywhere in it.
    expect(text).not.toMatch(/session/i);
  });

  it("names nobody for a turn-off Admin did not make: an older Admin run, or a failed one, is not the turn-off in force (R6 review SR6-SEC-4)", async () => {
    const day = 86_400_000;
    const scheduleOff = async () => (await loadNeedsYou(handle.db, await listAccountViews(handle.db))).find((i) => i.key === "schedule-off")!;
    // Since the Owner's audited turn-off above, Data jobs turned the schedule on and off again
    // through /api/jobs, which writes no audit row.
    const on = new Date(Date.now() - 1.5 * day);
    const off = new Date(Date.now() - day);
    await handle.db.update(dataRefreshStatus).set({ lastStartedAt: on, lastSuccessAt: on }).where(eq(dataRefreshStatus.key, "rank-schedule"));
    await handle.db.update(dataRefreshStatus).set({ lastStartedAt: off, lastSuccessAt: off }).where(eq(dataRefreshStatus.key, "rank-schedule-off"));
    const unnamed = { text: `The LP five-minute schedule was turned off on ${formatDate(off)}.`, href: `/admin/audit?category=data&from=${isoDay(off)}&to=${isoDay(off)}` };
    expect(await scheduleOff()).toMatchObject(unnamed);
    // An Admin run after it that failed: the turn-off in force is still the one before, and nobody is named.
    const failed = new Date(off.getTime() + 60_000);
    await handle.db.update(dataRefreshStatus).set({ lastStartedAt: failed, lastFailureAt: failed }).where(eq(dataRefreshStatus.key, "rank-schedule-off"));
    await handle.db.insert(auditEvents).values({ at: new Date(failed.getTime() + 500), actorUserId: adminId, actorName: "Captain", action: "jobs.run", targetType: "job", targetName: "rank-schedule-off", details: { ok: false, kind: "setup" } });
    expect(await scheduleOff()).toMatchObject(unnamed);
  });
});

describe("the permission hierarchy (OD8a–c, 23 Nov 2026)", () => {
  it("lets an administrator manage a regular member, and refuses them every change to another administrator", async () => {
    await signInAs(adminId);
    expect((await usersActions.resetPasswordAction(otherId)).ok).toBe(true);
    // Benchy is made an administrator by the Owner; from then on Captain changes nothing of theirs.
    await setAdministrator(handle.db, ownerId, otherId, true);
    try {
      await signInAs(adminId);
      const refused = { ok: false, error: expect.stringMatching(/Only the Owner can .* an administrator|Only the Owner removes administrator access/) };
      expect(await usersActions.resetPasswordAction(otherId)).toMatchObject(refused);
      expect(await usersActions.setAccountActiveAction(otherId, false)).toMatchObject(refused);
      expect(await usersActions.setAdministratorAction(otherId, false)).toMatchObject(refused);
      expect(await usersActions.setAccessGroupsAction(otherId, ["lineup-manager"])).toMatchObject(refused);
      expect(await usersActions.deleteAccountAction(otherId, { confirmation: "Benchy" })).toMatchObject({ ok: false });
      expect(await adminActions.signOutEverywhereAction(otherId)).toMatchObject(refused);
      expect(await adminActions.moderatePictureAction(otherId, null)).toMatchObject(refused);
      expect((await getUser(handle.db, otherId))!).toMatchObject({ isAdmin: true, isActive: true });
      // And the Owner's account, as before.
      expect(await usersActions.resetPasswordAction(ownerId)).toMatchObject({ ok: false, error: expect.stringMatching(/Only the Owner can reset the password of the Owner account/) });
      // The Owner manages both.
      await signInAs(ownerId);
      expect((await usersActions.resetPasswordAction(otherId)).ok).toBe(true);
    } finally {
      await setAdministrator(handle.db, ownerId, otherId, false);
    }
  });

  it("keeps the Owner's and an administrator's Riot accounts the Owner's to change", async () => {
    const ownerProfile = (await getUser(handle.db, ownerId))!.playerId!;
    const [account] = await handle.db.select({ id: riotAccounts.id }).from(riotAccounts).where(eq(riotAccounts.playerId, ownerProfile));
    await signInAs(adminId);
    expect(await riotAccountActions.removePlayerAccountAction(ownerProfile, account!.id)).toMatchObject({ ok: false, error: expect.stringMatching(/Only the Owner can change the Riot accounts of the Owner account/) });
    expect(await handle.db.select({ id: riotAccounts.id }).from(riotAccounts).where(eq(riotAccounts.id, account!.id))).toHaveLength(1);
  });

  it("the Owner changes another member's username after typing RENAME, recorded without either name; nobody else may", async () => {
    await signInAs(adminId);
    expect(await adminActions.setMemberUsernameAction(memberId, "Teammate2", "RENAME")).toMatchObject({ ok: false });
    expect((await getUser(handle.db, memberId))!.username).toBe("Teammate");
    await signInAs(ownerId);
    expect(await adminActions.setMemberUsernameAction(memberId, "Teammate2", "")).toMatchObject({ ok: false, error: expect.stringMatching(/Type RENAME/) });
    expect(await adminActions.setMemberUsernameAction(memberId, "Captain", "rename")).toMatchObject({ ok: false, error: expect.stringMatching(/already taken/) });
    expect(await adminActions.setMemberUsernameAction(ownerId, "Founder2", "RENAME")).toMatchObject({ ok: false, error: expect.stringMatching(/own account/) });
    const before = (await audit("account.username")).length;
    expect(await adminActions.setMemberUsernameAction(memberId, "Teammate2", " rename ")).toEqual({ ok: true, data: { username: "Teammate2" } });
    const rows = await audit("account.username");
    expect(rows).toHaveLength(before + 1);
    expect(rows.at(-1)).toMatchObject({ actorUserId: ownerId, targetId: memberId, details: {} });
    // The same name again changes nothing and records nothing.
    expect(await adminActions.setMemberUsernameAction(memberId, "Teammate2", "RENAME")).toMatchObject({ ok: true });
    expect(await audit("account.username")).toHaveLength(before + 1);
    expect(await adminActions.setMemberUsernameAction(memberId, "Teammate", "RENAME")).toMatchObject({ ok: true });
  });

  it("records a member's own username, display name and picture changes (OD9), and nothing for no change", async () => {
    await signInAs(memberId);
    const count = async (action: string) => (await audit(action)).filter((r) => r.actorUserId === memberId && r.targetId === memberId).length;
    const [u, d, p, r] = [await count("self.username"), await count("self.display-name"), await count("self.picture"), await count("self.picture-remove")];
    expect((await accountActions.changeDisplayNameAction("Teammate Two")).ok).toBe(true);
    expect((await accountActions.changeDisplayNameAction("Teammate Two")).ok).toBe(true);
    expect(await count("self.display-name")).toBe(d + 1);
    expect((await accountActions.changeUsernameAction("Teammate3")).ok).toBe(true);
    expect(await count("self.username")).toBe(u + 1);
    await signInAs(memberId);
    expect((await accountActions.uploadAvatarAction(dataUrl(png(64)))).ok).toBe(true);
    expect(await count("self.picture")).toBe(p + 1);
    expect((await accountActions.removeAvatarAction()).ok).toBe(true);
    expect((await accountActions.removeAvatarAction()).ok).toBe(true);
    expect(await count("self.picture-remove")).toBe(r + 1);
    // Back as they were, for the tests after.
    expect((await accountActions.changeUsernameAction("Teammate")).ok).toBe(true);
    expect((await accountActions.changeDisplayNameAction("Teammate")).ok).toBe(true);
  });

  it("records an edit to someone else's roles or pools by field, never their own", async () => {
    await signInAs(ownerId);
    const before = (await audit("profile.edit")).length;
    expect(await playerActions.saveProfilePatchAction(memberProfileId, { secondaryRole: "SUPPORT" }, null)).toMatchObject({ ok: true });
    const rows = await audit("profile.edit");
    expect(rows).toHaveLength(before + 1);
    expect(rows.at(-1)).toMatchObject({ actorUserId: ownerId, targetId: memberProfileId, details: { fields: "secondaryRole" } });
    await signInAs(memberId);
    expect(await playerActions.saveProfilePatchAction(memberProfileId, { secondaryRole: null }, null)).toMatchObject({ ok: true });
    expect(await audit("profile.edit")).toHaveLength(before + 1);
  });
});
