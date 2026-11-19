import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";

/*
  Admin safety (the overhaul's S1a, admin audit PR 7a), through the real server actions and the
  real jobs route:
  - setup and repair jobs run from Admin only for the Owner and only with their phrase typed, while
    the jobs route with CRON_SECRET (Data jobs, the Production check's verify-account call) runs
    them as before, with no phrase and no session;
  - the schedule's intervals are the Owner's; 0 needs its phrase; each change is audited with both
    values;
  - the Production check's account cannot be changed from Admin except deactivated or deleted, and
    its job still creates and keeps it;
  - only the Owner changes the Owner's profile's team membership (D5a);
  - archive and restore are audited; a profile without an account is deleted only with its name;
  - an erasure clears the texts of the activity entries about the person matched by id, keeps the
    details of entries they only made about someone else (only the actor's name changes), and
    leaves the entries of erasures made before as they were (forward only).
*/

const state = vi.hoisted(() => ({ db: null as unknown, cookies: new Map<string, string>(), redirects: [] as string[] }));

vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.cookies.has(name) ? { name, value: state.cookies.get(name)! } : undefined),
    set: (name: string, value: string) => void state.cookies.set(name, value),
    delete: (name: string) => void state.cookies.delete(name),
  }),
  headers: async () => new Headers({ "user-agent": "vitest", "x-forwarded-for": "203.0.113.11" }),
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

import { SESSION_COOKIE } from "@/server/auth/session";
import { createSession } from "@/server/auth/sessions";
import { registerAccount } from "@/server/auth/signup";
import { getUser, findUserByUsername } from "@/server/repositories/users";
import { listPermissionPresets } from "@/server/repositories/permissions";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { appSettings, auditEvents, dataRefreshStatus, jobRuns, players, users } from "@/server/db/schema";
import { listAccountViews, setAdministrator } from "@/server/auth/account-admin";
import { getScheduleOverrides, listJobs } from "@/server/jobs";
import { deriveVerifyPassword, ensureVerificationAccount, VERIFY_USERNAME } from "@/server/jobs/verify-account";
import { reconcileErasures } from "@/server/privacy/reconcile";
import { ERASED_MEMBER } from "@/server/privacy/erasure";
import { turnOffPhrase } from "@/domain/typed-confirmation";
import * as settingsActions from "@/server/actions/settings";
import * as usersActions from "@/server/actions/users";
import * as playerActions from "@/server/actions/players";
import * as privacyActions from "@/server/actions/privacy";
import { GET as jobsRoute } from "@/app/api/jobs/[job]/route";

const SECRET = "admin-safety-cron-secret-0123456789";
const PROD = { VERCEL_ENV: "production", CRON_SECRET: SECRET };
const SETUP: Record<string, string> = { "rank-schedule": "TURN ON", "rank-schedule-off": "TURN OFF", "history-rescan": "RESCAN", "erasure-reconcile": "REAPPLY", "verify-account": "SET UP", "lane-opponent-recompute": "RECOMPUTE" };

let handle: DbHandle;
let ownerId: string;
let ownerProfileId: string;
let adminId: string;
let memberId: string;
let memberProfileId: string;

async function signInAs(userId: string) {
  state.cookies.clear();
  const { token } = await createSession(handle.db, userId);
  state.cookies.set(SESSION_COOKIE, token);
}
const audit = async (action: string) => handle.db.select().from(auditEvents).where(eq(auditEvents.action, action));
const verifyId = async () => (await findUserByUsername(handle.db, VERIFY_USERNAME))!.id;
const ran = async (job: string) => (await handle.db.select({ id: jobRuns.id }).from(jobRuns).where(eq(jobRuns.job, job))).length;

const saved = { auth: process.env.UNIIVERSE_REQUIRE_AUTH, url: process.env.DATABASE_URL, secret: process.env.UNIIVERSE_AUTH_SECRET, cron: process.env.CRON_SECRET, vercelEnv: process.env.VERCEL_ENV, key: process.env.RIOT_API_KEY };

beforeAll(async () => {
  process.env.UNIIVERSE_REQUIRE_AUTH = "true";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test-only";
  process.env.UNIIVERSE_AUTH_SECRET = "test-secret-0123456789abcdef0123456789";
  delete process.env.RIOT_API_KEY;
  handle = await testDb();
  state.db = handle.db;
  // The deployment's shape: the Owner with a player profile (migration 0055), another administrator,
  // a member, and the verification account its job made.
  const owner = await registerAccount(handle.db, { username: "Founder", password: "Owner-pass-123", role: "owner", primaryRiot: { riotId: "Founder#OCE", platform: "oc1" }, primaryRole: "MID" });
  ownerId = owner.id;
  ownerProfileId = owner.playerId!;
  const admin = await registerAccount(handle.db, { username: "Captain", password: "Captain-pass-1", role: "player", primaryRiot: { riotId: "Captain#OCE", platform: "oc1" }, primaryRole: "TOP" });
  adminId = admin.id;
  await setAdministrator(handle.db, ownerId, adminId, true);
  const member = await registerAccount(handle.db, { username: "Teammate", password: "Teammate-pass-1", role: "player", primaryRiot: { riotId: "Teammate#OCE", platform: "oc1" }, primaryRole: "JUNGLE" });
  memberId = member.id;
  memberProfileId = member.playerId!;
  expect((await ensureVerificationAccount(handle.db, PROD)).summary.state).toBe("created");
}, 60_000);
afterAll(async () => {
  await handle.close();
  for (const [k, v] of [["UNIIVERSE_REQUIRE_AUTH", saved.auth], ["DATABASE_URL", saved.url], ["UNIIVERSE_AUTH_SECRET", saved.secret], ["CRON_SECRET", saved.cron], ["VERCEL_ENV", saved.vercelEnv], ["RIOT_API_KEY", saved.key]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
beforeEach(() => {
  state.redirects.length = 0;
});

describe("setup and repair jobs from Admin", () => {
  it("are exactly the six the registry files as setup, each with the phrase this test types", () => {
    expect(Object.fromEntries(listJobs().filter((j) => j.kind === "setup").map((j) => [j.key, j.confirm?.phrase]))).toEqual(SETUP);
  });

  it("are refused to an administrator who is not the Owner, whatever is typed, and nothing runs; checks and refreshes still run for them", async () => {
    await signInAs(adminId);
    for (const [job, phrase] of Object.entries(SETUP)) {
      expect(await settingsActions.runJobAction(job, phrase), job).toMatchObject({ ok: false, error: expect.stringMatching(/Only the Owner/) });
      expect(await settingsActions.runJobAction(job), job).toMatchObject({ ok: false, error: expect.stringMatching(/Only the Owner/) });
      expect(await ran(job), job).toBe(0);
    }
    expect((await audit("jobs.run")).filter((r) => r.targetName && r.targetName in SETUP)).toEqual([]);
    // A check and a refresh: no phrase, no question, and the run records its kind.
    const check = await settingsActions.runJobAction("egress");
    expect(check).toMatchObject({ ok: true });
    const refresh = await settingsActions.runJobAction("integrity");
    expect(refresh).toMatchObject({ ok: true });
    const kinds = Object.fromEntries((await audit("jobs.run")).map((r) => [r.targetName, r.details]));
    expect(kinds.egress).toMatchObject({ kind: "check" });
    expect(kinds.integrity).toMatchObject({ kind: "refresh" });
    // A job that does not exist is refused before anything runs.
    expect(await settingsActions.runJobAction("no-such-job")).toMatchObject({ ok: false });
  });

  it("run from the Owner's Admin only with their phrase typed (any case); the run records its kind", async () => {
    await signInAs(ownerId);
    expect(await settingsActions.runJobAction("rank-schedule-off")).toMatchObject({ ok: false, error: expect.stringMatching(/Type TURN OFF to confirm\. Nothing was run\./) });
    expect(await settingsActions.runJobAction("rank-schedule-off", "TURN ON")).toMatchObject({ ok: false });
    expect(await settingsActions.runJobAction("rank-schedule-off", "turn of")).toMatchObject({ ok: false });
    expect(await ran("rank-schedule-off")).toBe(0);
    expect((await handle.db.select().from(dataRefreshStatus).where(eq(dataRefreshStatus.key, "rank-schedule-off"))).length).toBe(0);
    // Typed: it runs (the test database has no pg_cron, so there is nothing to remove).
    const off = await settingsActions.runJobAction("rank-schedule-off", " turn off ");
    expect(off).toMatchObject({ ok: true, data: { ok: true } });
    expect(await ran("rank-schedule-off")).toBe(1);
    const [entry] = (await audit("jobs.run")).filter((r) => r.targetName === "rank-schedule-off");
    expect(entry).toMatchObject({ actorName: "Founder", targetType: "job", details: { ok: true, kind: "setup" } });
    // Outside production the install refuses on its own, after the phrase let it run.
    expect(await settingsActions.runJobAction("rank-schedule", "TURN ON")).toMatchObject({ ok: true, data: { ok: false, error: expect.stringMatching(/Only the production deployment/) } });
  });

  it("still run through the jobs route with CRON_SECRET alone: no phrase, no Owner session (Data jobs, the Production check's verify-account call)", async () => {
    process.env.CRON_SECRET = SECRET;
    process.env.VERCEL_ENV = "production";
    state.cookies.clear();
    try {
      const call = async (job: string, secret = SECRET) => {
        const res = await jobsRoute(new NextRequest(`http://localhost/api/jobs/${job}`, { headers: { authorization: `Bearer ${secret}` } }), { params: Promise.resolve({ job }) });
        return { status: res.status, body: (await res.json()) as { ok: boolean; key?: string; error?: string; summary?: { state?: string; key?: string } } };
      };
      // verify-account: gone, then made again by the route's call, exactly as before every Production check.
      await handle.db.delete(users).where(eq(users.username, VERIFY_USERNAME));
      expect(await call("verify-account")).toMatchObject({ status: 200, body: { ok: true, key: "verify-account", summary: { state: "created", key: "CRON_SECRET" } } });
      expect(await call("verify-account")).toMatchObject({ status: 200, body: { ok: true, summary: { state: "unchanged" } } });
      // rank-schedule: the route ran it (its own answer, recorded as an http run), not a refusal.
      const before = await ran("rank-schedule");
      const install = await call("rank-schedule");
      expect(install.status).toBe(500);
      expect(install.body).toMatchObject({ ok: false, key: "rank-schedule", error: expect.stringMatching(/VERCEL_PROJECT_PRODUCTION_URL/) });
      expect(await ran("rank-schedule")).toBe(before + 1);
      const [last] = await handle.db.select({ trigger: jobRuns.trigger }).from(jobRuns).where(eq(jobRuns.job, "rank-schedule")).orderBy(sql`${jobRuns.id} desc`).limit(1);
      expect(last!.trigger).toBe("http");
      // Without the secret the route answers 401 before it runs anything.
      expect((await call("verify-account", "not-the-secret")).status).toBe(401);
    } finally {
      delete process.env.CRON_SECRET;
      delete process.env.VERCEL_ENV;
    }
  });
});

describe("the schedule's intervals", () => {
  it("are the Owner's alone", async () => {
    await signInAs(adminId);
    expect(await settingsActions.saveScheduleAction({ "rank-watch": 10 })).toMatchObject({ ok: false, error: expect.stringMatching(/Only the Owner/) });
    await signInAs(memberId);
    expect(await settingsActions.saveScheduleAction({ "rank-watch": 10 })).toMatchObject({ ok: false });
    expect((await getScheduleOverrides(handle.db)).intervals).toEqual({});
    expect(await audit("jobs.schedule")).toEqual([]);
  });

  it("turn a job off only with its phrase typed, and record each changed job with its interval before and after", async () => {
    await signInAs(ownerId);
    // 0 without the phrase, or with another job's: nothing saved, nothing recorded.
    expect(await settingsActions.saveScheduleAction({ "rank-watch": 0 })).toMatchObject({ ok: false, error: expect.stringMatching(/Type TURN OFF rank-watch to turn it off\. Nothing was saved\./) });
    expect(await settingsActions.saveScheduleAction({ "rank-watch": 0 }, { "rank-watch": turnOffPhrase("integrity") })).toMatchObject({ ok: false });
    // Not a number of minutes: refused.
    for (const bad of [-5, "abc", "", null, Number.NaN, 600_000]) expect(await settingsActions.saveScheduleAction({ integrity: bad }), String(bad)).toMatchObject({ ok: false });
    expect((await getScheduleOverrides(handle.db)).intervals).toEqual({});
    expect(await audit("jobs.schedule")).toEqual([]);

    // With the phrase (any case), and another job changed at the same time; on-demand jobs have no interval.
    const r = await settingsActions.saveScheduleAction({ "rank-watch": 0, integrity: 720, "account-sync": 15, "perf-probe": 0 }, { "rank-watch": "turn off rank-watch" });
    expect(r).toEqual({ ok: true, data: { changed: 2 } });
    expect((await getScheduleOverrides(handle.db)).intervals).toEqual({ "rank-watch": 0, integrity: 720 });
    const rows = await audit("jobs.schedule");
    expect(Object.fromEntries(rows.map((row) => [row.targetName, row.details]))).toEqual({ "rank-watch": { fromMinutes: 5, toMinutes: 0 }, integrity: { fromMinutes: 1440, toMinutes: 720 } });
    expect(rows.every((row) => row.actorName === "Founder" && row.targetType === "job")).toBe(true);

    // Already off: no phrase needed to leave it off; a job not sent keeps its interval.
    expect(await settingsActions.saveScheduleAction({ "rank-watch": 0, integrity: 1440 })).toEqual({ ok: true, data: { changed: 1 } });
    expect((await getScheduleOverrides(handle.db)).intervals).toEqual({ "rank-watch": 0 });
    expect(await settingsActions.saveScheduleAction({ integrity: 1440 })).toEqual({ ok: true, data: { changed: 0 } });
    // Turned on again: back to the default, so no override is kept.
    expect(await settingsActions.saveScheduleAction({ "rank-watch": 5 })).toEqual({ ok: true, data: { changed: 1 } });
    expect((await getScheduleOverrides(handle.db)).intervals).toEqual({});
    expect((await audit("jobs.schedule")).length).toBe(4);
    await handle.db.delete(appSettings).where(eq(appSettings.key, "schedule"));
  });
});

describe("the Production check's account in Admin", () => {
  it("refuses every access, password, role and erasure change, so the job's account stays plain and its password works", async () => {
    await signInAs(ownerId);
    const id = await verifyId();
    const presets = await listPermissionPresets(handle.db);
    const teamManager = presets.find((p) => p.levelKey === "administrator")!;
    const standard = presets.find((p) => p.isDefault)!;
    const refused = [
      await usersActions.resetPasswordAction(id),
      await usersActions.setAdministratorAction(id, true),
      await usersActions.setAccessLevelAction(id, { level: "preset", presetId: teamManager.id }),
      await usersActions.setAccessLevelAction(id, { level: "preset", presetId: standard.id }),
      await usersActions.setAccessLevelAction(id, { level: "custom", capabilities: ["view-team"] }),
      await usersActions.setAccessGroupsAction(id, ["player-manager"]),
      await usersActions.setUserPermissionsAction(id, { custom: ["view-team"] }),
      await usersActions.setAccountRoleAction(id, "player"),
      await privacyActions.previewErasureAction({ userId: id }),
      await privacyActions.eraseAction({ userId: id }, VERIFY_USERNAME),
    ];
    for (const [i, r] of refused.entries()) expect(r, String(i)).toMatchObject({ ok: false, error: expect.stringMatching(/kept automatically/) });
    expect(await ensureVerificationAccount(handle.db, PROD)).toMatchObject({ ok: true, summary: { state: "unchanged" } });
    const user = (await getUser(handle.db, id))!;
    expect(user).toMatchObject({ isAdmin: false, permissionPresetId: null, hasCustomCapabilities: false, accessGroups: [], playerId: null, role: "player", isActive: true });
    // Another administrator is refused the same.
    await signInAs(adminId);
    expect(await usersActions.setAdministratorAction(id, true)).toMatchObject({ ok: false, error: expect.stringMatching(/kept automatically/) });
    expect(await usersActions.resetPasswordAction(id)).toMatchObject({ ok: false, error: expect.stringMatching(/kept automatically/) });
  });

  it("can still be deactivated (the off switch), reactivated and deleted, and its job still creates it and follows a new key", async () => {
    await signInAs(ownerId);
    const id = await verifyId();
    expect(await usersActions.setAccountActiveAction(id, false)).toEqual({ ok: true, data: null });
    expect((await ensureVerificationAccount(handle.db, PROD)).summary.state).toBe("deactivated");
    expect(await usersActions.setAccountActiveAction(id, true)).toEqual({ ok: true, data: null });
    expect((await ensureVerificationAccount(handle.db, PROD)).summary.state).toBe("unchanged");
    expect(await usersActions.deleteAccountAction(id)).toEqual({ ok: true, data: null });
    expect(await findUserByUsername(handle.db, VERIFY_USERNAME)).toBeNull();
    expect((await ensureVerificationAccount(handle.db, PROD)).summary.state).toBe("created");
    const rotated = { ...PROD, CRON_SECRET: `${SECRET}-rotated` };
    expect((await ensureVerificationAccount(handle.db, rotated)).summary.state).toBe("password-updated");
    expect((await ensureVerificationAccount(handle.db, PROD)).summary.state).toBe("password-updated");
    expect(deriveVerifyPassword(SECRET)).not.toBe(deriveVerifyPassword(rotated.CRON_SECRET));
  });

  it("is marked kept automatically in the account list, and no other account is", async () => {
    const views = await listAccountViews(handle.db);
    expect(views.filter((v) => v.keptAutomatically).map((v) => v.username)).toEqual([VERIFY_USERNAME]);
  });
});

describe("the Owner's profile", () => {
  it("only the Owner changes its team membership (D5a); other profiles are any administrator's", async () => {
    await signInAs(adminId);
    expect(await usersActions.setTeamMemberAction(ownerProfileId, false)).toMatchObject({ ok: false, error: expect.stringMatching(/Only the Owner can change the team membership of the Owner account/) });
    expect((await handle.db.select({ teamMember: players.teamMember }).from(players).where(eq(players.id, ownerProfileId)))[0]!.teamMember).toBe(true);
    expect(await usersActions.setTeamMemberAction(memberProfileId, false)).toEqual({ ok: true, data: null });
    expect(await usersActions.setTeamMemberAction(memberProfileId, true)).toEqual({ ok: true, data: null });
    // The Owner may.
    await signInAs(ownerId);
    expect(await usersActions.setTeamMemberAction(ownerProfileId, false)).toEqual({ ok: true, data: null });
    expect(await usersActions.setTeamMemberAction(ownerProfileId, true)).toEqual({ ok: true, data: null });
  });

  it("is not taken off the team by archiving it, nor is any profile with an account, whoever asks", async () => {
    // A member who manages players without being an administrator (the Player Manager group).
    await signInAs(ownerId);
    const lead = await registerAccount(handle.db, { username: "Lead", password: "Lead-pass-1234", role: "player", primaryRiot: { riotId: "Lead#OCE", platform: "oc1" }, primaryRole: "ADC" });
    expect(await usersActions.setAccessGroupsAction(lead.id, ["player-manager"])).toMatchObject({ ok: true });
    const archives = (await audit("profile.archive")).length;
    for (const [who, userId] of [["an administrator", adminId], ["a player manager", lead.id], ["the Owner", ownerId]] as const) {
      await signInAs(userId);
      for (const [whose, profile] of [["the Owner's", ownerProfileId], ["a member's", memberProfileId]] as const) {
        expect(await playerActions.archivePlayerAction(profile, true), `${who}, ${whose}`).toEqual({ ok: false, error: expect.stringMatching(/^This profile belongs to an account, so it is not archived on its own/) });
      }
    }
    const kept = await handle.db.select({ archivedAt: players.archivedAt, teamMember: players.teamMember }).from(players).where(inArray(players.id, [ownerProfileId, memberProfileId]));
    expect(kept).toEqual([
      { archivedAt: null, teamMember: true },
      { archivedAt: null, teamMember: true },
    ]);
    expect((await audit("profile.archive")).length).toBe(archives);
    // Restoring only brings a profile back, and stays open.
    await signInAs(lead.id);
    expect(await playerActions.archivePlayerAction(memberProfileId, false)).toEqual({ ok: true });
  });
});

describe("profiles without an account", () => {
  it("archive and restore are recorded in the activity log", async () => {
    await signInAs(adminId);
    const id = (await createPlayer(handle.db, (await getOrCreateTeam(handle.db)).id, { displayName: "Placeholder", primaryRole: "ADC", primaryPool: [] })).id;
    expect(await playerActions.archivePlayerAction(id, true)).toEqual({ ok: true });
    expect(await playerActions.archivePlayerAction(id, false)).toEqual({ ok: true });
    const rows = await handle.db.select().from(auditEvents).where(and(eq(auditEvents.targetId, id), inArray(auditEvents.action, ["profile.archive", "profile.restore"])));
    expect(rows.map((r) => [r.action, r.actorName, r.targetType, r.targetName])).toEqual(
      expect.arrayContaining([
        ["profile.archive", "Captain", "player", "Placeholder"],
        ["profile.restore", "Captain", "player", "Placeholder"],
      ]),
    );
    expect(rows).toHaveLength(2);
  });

  it("are deleted only with their name typed", async () => {
    await signInAs(ownerId);
    const id = (await createPlayer(handle.db, (await getOrCreateTeam(handle.db)).id, { displayName: "Old Entry", primaryRole: "TOP", primaryPool: [] })).id;
    expect(await usersActions.deleteProfileAction(id, "")).toMatchObject({ ok: false, error: expect.stringMatching(/Type the profile's name/) });
    expect(await usersActions.deleteProfileAction(id, "Old")).toMatchObject({ ok: false });
    expect((await handle.db.select({ id: players.id }).from(players).where(eq(players.id, id))).length).toBe(1);
    expect(await usersActions.deleteProfileAction(id, "old  entry")).toEqual({ ok: true, data: null });
    expect((await handle.db.select({ id: players.id }).from(players).where(eq(players.id, id))).length).toBe(0);
    expect((await audit("profile.delete")).map((r) => r.targetName)).toContain("Old Entry");
  });
});

describe("erasure, forward only", () => {
  it("clears every text in the details of the entries about the person matched by id; what they did to others keeps its details; entries of earlier erasures and other people's stay as they were", async () => {
    await signInAs(ownerId);
    const leaving = await registerAccount(handle.db, { username: "Leaving", password: "Leaving-pass-123", role: "player", primaryRiot: { riotId: "Leaving#OCE", platform: "oc1" }, primaryRole: "SUPPORT" });
    const rows = await handle.db
      .insert(auditEvents)
      .values([
        // About them by id: done to their account (by someone else, or by them) and to their profile.
        { actorUserId: ownerId, actorName: "Founder", action: "account.access", targetType: "user", targetId: leaving.id, targetName: "Leaving", details: { level: "Team Manager", capabilities: 4, custom: false } },
        { actorUserId: leaving.id, actorName: "Leaving", action: "password.change", targetType: "user", targetId: leaving.id, targetName: "Leaving", details: { note: "first password" } },
        { actorUserId: ownerId, actorName: "Founder", action: "account.team-member", targetType: "player", targetId: leaving.playerId, targetName: "Leaving", details: { teamMember: true } },
        // Made by them about someone or something else: the other member's level, groups and role, and a job.
        { actorUserId: leaving.id, actorName: "Leaving", action: "account.access", targetType: "user", targetId: memberId, targetName: "Teammate", details: { level: "Team Manager", capabilities: 4, custom: false } },
        { actorUserId: leaving.id, actorName: "Leaving", action: "account.groups", targetType: "user", targetId: memberId, targetName: "Teammate", details: { groups: "player-manager" } },
        { actorUserId: leaving.id, actorName: "Leaving", action: "account.role", targetType: "user", targetId: memberId, targetName: "Teammate", details: { role: "player" } },
        { actorUserId: leaving.id, actorName: "Leaving", action: "jobs.run", targetType: "job", targetId: null, targetName: "integrity", details: { ok: true, kind: "check" } },
        // Made by them, a detail naming them: only that value goes.
        { actorUserId: leaving.id, actorName: "Leaving", action: "account.access", targetType: "user", targetId: memberId, targetName: "Teammate", details: { level: "Team Manager", note: "Leaving" } },
        // An earlier erasure's entry, as it left it (ids gone, the name replaced, a text detail kept).
        { actorUserId: null, actorName: ERASED_MEMBER, action: "account.groups", targetType: "user", targetId: null, targetName: ERASED_MEMBER, details: { groups: "player-manager" } },
        // Someone else's.
        { actorUserId: ownerId, actorName: "Founder", action: "account.access", targetType: "user", targetId: memberId, targetName: "Teammate", details: { level: "Team Manager" } },
      ])
      .returning({ id: auditEvents.id });
    const ids = rows.map((r) => r.id);
    const read = async () => {
      const got = await handle.db.select().from(auditEvents).where(inArray(auditEvents.id, ids));
      return ids.map((id) => got.find((g) => g.id === id)!);
    };
    const before = await read();
    const [, , , ...madeBefore] = before.slice(0, 8);
    const [earlierBefore, othersBefore] = before.slice(8);

    const done = await privacyActions.eraseAction({ userId: leaving.id }, "Leaving");
    expect(done.ok).toBe(true);
    const after = await read();
    const [byTarget, byActor, noText] = after;
    expect(byTarget).toMatchObject({ targetId: null, targetName: ERASED_MEMBER, details: { level: "[removed]", capabilities: 4, custom: false } });
    expect(byActor).toMatchObject({ actorUserId: null, actorName: ERASED_MEMBER, targetId: null, details: { note: "[removed]" } });
    expect(noText).toMatchObject({ targetId: null, targetName: ERASED_MEMBER, details: { teamMember: true } });
    // What they did to someone else keeps what happened: only the actor becomes "Erased member".
    for (const [i, was] of madeBefore.slice(0, 4).entries()) expect(after[3 + i], was.action).toEqual({ ...was, actorUserId: null, actorName: ERASED_MEMBER });
    expect(after[7]).toEqual({ ...madeBefore[4], actorUserId: null, actorName: ERASED_MEMBER, details: { level: "Team Manager", note: "[removed]" } });
    const [earlier, others] = after.slice(8);
    expect(earlier).toEqual(earlierBefore);
    expect(others).toEqual(othersBefore);

    // Re-applying every record (erasure-reconcile, Personal data's Re-apply) finds nothing more to
    // change in the log: the earlier erasure's entry keeps its text (OD21 decides about those).
    await reconcileErasures(handle.db, { mode: "full" });
    expect(await read()).toEqual(after);
  });
});
