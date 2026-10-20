import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";

/*
  Phase 3 account foundations through the real server actions: configurable permissions (and that
  they bind the server, not just the navigation), owner protection, username changes, the new
  password rules, profile pictures and Riot ID changes by PUUID.
*/

const state = vi.hoisted(() => ({ db: null as unknown, cookies: new Map<string, string>(), redirects: [] as string[] }));

vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
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

import { SESSION_COOKIE, getSession } from "@/server/auth/session";
import { createSession } from "@/server/auth/sessions";
import { registerAccount } from "@/server/auth/signup";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { getOrCreateTeam, getPlayer } from "@/server/repositories/team";
import { authenticate, getUser } from "@/server/repositories/users";
import { listPermissionPresets } from "@/server/repositories/permissions";
import { accountMatches, permissionPresets, riotAccounts, users } from "@/server/db/schema";
import { resetThrottle } from "@/server/auth/throttle";
import { hashPassword } from "@/server/auth/password";
import { requirePageAccess } from "@/server/auth/page-access";
import { canUseAdminArea } from "@/server/auth/permissions";
import * as usersActions from "@/server/actions/users";
import * as accountActions from "@/server/actions/account";
import * as playerActions from "@/server/actions/players";
import * as brandingActions from "@/server/actions/branding";
import { addAccount, listAccountsForPlayer } from "@/server/accounts/repository";
import { syncAccount } from "@/server/accounts/sync";
import { changeAccountRiotId } from "@/server/accounts/change-riot-id";
import { RiotApiClient } from "@/server/riot/api/client";
import { RateLimiter } from "@/server/riot/api/rate-limiter";
import { GET as avatarRoute } from "@/app/api/avatars/[userId]/route";

let handle: DbHandle;
let ownerId: string;
let playerUserId: string;
let playerProfileId: string;
let otherProfileId: string;

async function signInAs(userId: string | null) {
  state.cookies.clear();
  if (!userId) return;
  const { token } = await createSession(handle.db, userId);
  state.cookies.set(SESSION_COOKIE, token);
}

async function redirectOf(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (err) {
    const m = String((err as Error).message);
    return m.startsWith("NEXT_REDIRECT ") ? m.slice("NEXT_REDIRECT ".length) : `error: ${m}`;
  }
}

/** A minimal but well-formed PNG header of the given size (enough for type and size sniffing). */
function pngOf(width: number, height: number, padding = 64): Buffer {
  const head = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head, 0);
  head.writeUInt32BE(13, 8);
  head.write("IHDR", 12, "ascii");
  head.writeUInt32BE(width, 16);
  head.writeUInt32BE(height, 20);
  return Buffer.concat([head, Buffer.alloc(padding)]);
}
const dataUrl = (buf: Buffer, type = "image/png") => `data:${type};base64,${buf.toString("base64")}`;

beforeAll(async () => {
  process.env.UNIIVERSE_REQUIRE_AUTH = "true";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test-only";
  process.env.UNIIVERSE_AUTH_SECRET = "test-secret-0123456789abcdef0123456789";
  handle = await testDb();
  state.db = handle.db;
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  const owner = await registerAccount(handle.db, { username: "Boss", password: "Owner-pass-123", role: "owner", primaryRiot: { riotId: "Boss#OCE", platform: "oc1" }, primaryRole: "MID" });
  ownerId = owner.id;
  // An existing password chosen under the old rules (10+ characters, no symbol) keeps working.
  const player = await registerAccount(handle.db, { username: "Riven Main", password: "Temp-pass-123", role: "player", primaryRiot: { riotId: "RivenMain#OCE", platform: "oc1" }, primaryRole: "TOP" });
  playerUserId = player.id;
  await handle.db.update(users).set({ passwordHash: await hashPassword("oldrules1234") }).where(eq(users.id, player.id));
  playerProfileId = player.playerId!;
  const other = await registerAccount(handle.db, { username: "Other", password: "Other-pass-1", role: "player", primaryRiot: { riotId: "Other#OCE", platform: "oc1" }, primaryRole: "JUNGLE" });
  otherProfileId = other.playerId!;
});
afterAll(async () => {
  await handle.close();
  delete process.env.UNIIVERSE_REQUIRE_AUTH;
});
beforeEach(() => resetThrottle(handle.db));

describe("configurable permissions", () => {
  it("starts every existing player on the default Standard Player preset", async () => {
    const presets = await listPermissionPresets(handle.db);
    // Built-in access levels in selector order (0014 added Administrator; 0029 renamed it Team Manager).
    expect(presets.map((p) => p.name)).toEqual(["Standard Player", "Team Manager", "Restricted Player"]);
    expect(presets.map((p) => p.levelKey)).toEqual(["standard", "administrator", "restricted"]);
    expect(presets.find((p) => p.isDefault)!.name).toBe("Standard Player");
    const player = (await getUser(handle.db, playerUserId))!;
    expect(player.capabilities).toEqual(expect.arrayContaining(["view-matches", "view-teammate-stats", "edit-own-profile"]));
    // Meta & Trends was removed: migration 0042 took "view-trends" out of every stored level and
    // reworded the built-in descriptions that mentioned trends or drafts.
    expect(player.capabilities).not.toContain("view-trends");
    const stored = await handle.db.select({ capabilities: permissionPresets.capabilities }).from(permissionPresets);
    expect(stored.flatMap((p) => p.capabilities)).not.toContain("view-trends");
    for (const key of ["standard", "restricted"]) expect(presets.find((p) => p.levelKey === key)!.description).not.toMatch(/trends|drafts/i);
    expect(player.permissionPresetId).toBeNull();
  });

  it("a preset change binds the server actions and pages immediately, and can be undone", async () => {
    const restricted = (await listPermissionPresets(handle.db)).find((p) => p.name === "Restricted Player")!;
    await signInAs(ownerId);
    expect((await usersActions.setUserPermissionsAction(playerUserId, { presetId: restricted.id })).ok).toBe(true);

    await signInAs(playerUserId);
    expect(await redirectOf(requirePageAccess("view-teammate-stats"))).toBe("/no-access");
    expect(await redirectOf(requirePageAccess("view-team"))).toBeNull();

    await signInAs(ownerId);
    await usersActions.setUserPermissionsAction(playerUserId, { presetId: null });
    await signInAs(playerUserId);
    expect(await redirectOf(requirePageAccess("view-teammate-stats"))).toBeNull();
  });

  it("custom capabilities can delegate one admin area without any owner-only right", async () => {
    await signInAs(playerUserId);
    expect((await playerActions.setLineupSlotAction("TOP", playerProfileId)).ok).toBe(false);
    expect((await brandingActions.saveBrandingAction({ teamName: "Hijacked" })).ok).toBe(false);

    await signInAs(ownerId);
    const base = (await getUser(handle.db, playerUserId))!.capabilities;
    expect((await usersActions.setUserPermissionsAction(playerUserId, { custom: [...base, "manage-lineup"] })).ok).toBe(true);

    await signInAs(playerUserId);
    expect((await playerActions.setLineupSlotAction("TOP", playerProfileId)).ok).toBe(true);
    expect((await brandingActions.saveBrandingAction({ teamName: "Hijacked" })).ok).toBe(false);
    expect(await redirectOf(requirePageAccess("manage-users"))).toBe("/no-access");
    // A custom list naming an owner-only right is cleaned on save.
    await signInAs(ownerId);
    await usersActions.setUserPermissionsAction(playerUserId, { custom: ["view-team", "manage-users"] });
    expect((await getUser(handle.db, playerUserId))!.capabilities).toEqual(["view-team"]);
    await usersActions.setUserPermissionsAction(playerUserId, { presetId: null });
  });

  it("Team Lineup Manager: a normal player who may also run the lineup, and nothing more", async () => {
    await signInAs(ownerId);
    expect((await usersActions.setAccessGroupsAction(playerUserId, ["lineup-manager", "not-a-group"])).ok).toBe(true);
    const u = (await getUser(handle.db, playerUserId))!;
    // The base level is untouched; the group adds only lineup management.
    expect(u.accessGroups).toEqual(["lineup-manager"]);
    expect(u.hasCustomCapabilities).toBe(false);
    expect(u.capabilities).toContain("manage-lineup");
    expect(u.capabilities).not.toContain("manage-players");

    await signInAs(playerUserId);
    expect((await playerActions.setLineupSlotAction("TOP", playerProfileId)).ok).toBe(true);
    expect((await playerActions.setLineupSlotAction("TOP", null)).ok).toBe(true);
    // Still nothing administrative: accounts, passwords, permissions, branding, Riot settings.
    expect((await brandingActions.saveBrandingAction({ teamName: "Hijacked" })).ok).toBe(false);
    expect((await usersActions.setAccessGroupsAction(playerUserId, ["data-manager"])).ok).toBe(false);
    expect((await usersActions.setAccessLevelAction(playerUserId, { level: "owner" })).ok).toBe(false);
    expect(await redirectOf(requirePageAccess("manage-users"))).toBe("/no-access");
    expect(await redirectOf(requirePageAccess("manage-data"))).toBe("/no-access");

    // Nobody changes their own groups, and owners need none.
    await signInAs(ownerId);
    expect((await usersActions.setAccessGroupsAction(ownerId, ["lineup-manager"])).ok).toBe(false);
    expect((await usersActions.setAccessGroupsAction(playerUserId, [])).ok).toBe(true);
    await signInAs(playerUserId);
    expect((await playerActions.setLineupSlotAction("TOP", playerProfileId)).ok).toBe(false);
  });

  it("players cannot change permissions or presets, not even their own", async () => {
    await signInAs(playerUserId);
    expect((await usersActions.setUserPermissionsAction(playerUserId, { custom: ["manage-data", "manage-players"] })).ok).toBe(false);
    expect((await usersActions.savePermissionPresetAction({ name: "Mine", capabilities: ["manage-data"] })).ok).toBe(false);
    const presets = await listPermissionPresets(handle.db);
    expect((await usersActions.deletePermissionPresetAction(presets[1]!.id)).ok).toBe(false);
    expect((await getUser(handle.db, playerUserId))!.hasCustomCapabilities).toBe(false);
  });

  it("owners cannot be limited, so no permission edit can lock the owner out", async () => {
    await signInAs(ownerId);
    const r = await usersActions.setUserPermissionsAction(ownerId, { custom: [] });
    expect(r.ok).toBe(false);
    const session = await getSession();
    expect(session?.role).toBe("owner");
  });

  it("presets are created, edited live, and deleted with their players falling back to the default", async () => {
    await signInAs(ownerId);
    const created = await usersActions.savePermissionPresetAction({ name: "Analysts", description: "Statistics only", capabilities: ["view-team", "view-teammate-stats"] });
    expect(created.ok).toBe(true);
    const id = created.ok ? created.data.id : "";
    expect((await usersActions.savePermissionPresetAction({ name: "analysts", capabilities: [] })).ok).toBe(false);
    await usersActions.setUserPermissionsAction(playerUserId, { presetId: id });
    expect((await getUser(handle.db, playerUserId))!.capabilities.sort()).toEqual(["view-team", "view-teammate-stats"]);
    await usersActions.savePermissionPresetAction({ id, name: "Analysts", capabilities: ["view-team"] });
    expect((await getUser(handle.db, playerUserId))!.capabilities).toEqual(["view-team"]);
    expect((await usersActions.deletePermissionPresetAction(id)).ok).toBe(true);
    const after = (await getUser(handle.db, playerUserId))!;
    expect(after.permissionPresetId).toBeNull();
    expect(after.capabilities).toContain("view-teammate-stats");
    const def = (await listPermissionPresets(handle.db)).find((p) => p.isDefault)!;
    expect((await usersActions.deletePermissionPresetAction(def.id)).ok).toBe(false);
  });
});

describe("access levels (one selector: Standard Player, Team Manager, Restricted Player, Custom; one Owner)", () => {
  const level = (name: string) => listPermissionPresets(handle.db).then((ps) => ps.find((p) => p.name === name)!);

  it("Team Manager runs the team from the ordinary pages but never reaches Admin Mode, site settings, accounts or permissions", async () => {
    await signInAs(ownerId);
    const admin = await level("Team Manager");
    expect((await usersActions.setAccessLevelAction(playerUserId, { level: "preset", presetId: admin.id })).ok).toBe(true);
    await signInAs(playerUserId);
    expect((await playerActions.setLineupSlotAction("TOP", playerProfileId)).ok).toBe(true);
    for (const p of ["manage-data", "manage-branding"] as const) expect(await redirectOf(requirePageAccess(p))).toBe("/no-access");
    expect(canUseAdminArea(await getSession())).toBe(false);
    // Owner-only: no escalation, not even through the access-level action itself.
    expect(await redirectOf(requirePageAccess("manage-users"))).toBe("/no-access");
    expect((await usersActions.setAccessLevelAction(playerUserId, { level: "owner" })).ok).toBe(false);
    expect((await usersActions.setAccessLevelAction(otherProfileId, { level: "owner" })).ok).toBe(false);
    expect((await usersActions.resetPasswordAction(ownerId)).ok).toBe(false);
    expect((await usersActions.savePermissionPresetAction({ id: admin.id, name: "Team Manager", capabilities: [] })).ok).toBe(false);
    expect((await getUser(handle.db, playerUserId))!.role).toBe("player");
  });

  it("moves an account between levels without touching anything else, and Custom keeps only delegable capabilities", async () => {
    await signInAs(ownerId);
    const restricted = await level("Restricted Player");
    expect((await usersActions.setAccessLevelAction(playerUserId, { level: "preset", presetId: restricted.id })).ok).toBe(true);
    expect((await getUser(handle.db, playerUserId))!.capabilities).not.toContain("view-teammate-stats");
    expect((await usersActions.setAccessLevelAction(playerUserId, { level: "custom", capabilities: ["view-team", "manage-branding", "manage-users"] })).ok).toBe(true);
    const custom = (await getUser(handle.db, playerUserId))!;
    expect(custom.hasCustomCapabilities).toBe(true);
    expect(custom.capabilities.sort()).toEqual(["view-team"]);
    // Choosing the default level stores "no preset" (Standard Player), clearing the custom set.
    const standard = await level("Standard Player");
    expect((await usersActions.setAccessLevelAction(playerUserId, { level: "preset", presetId: standard.id })).ok).toBe(true);
    const back = (await getUser(handle.db, playerUserId))!;
    expect(back.permissionPresetId).toBeNull();
    expect(back.hasCustomCapabilities).toBe(false);
    expect(back.capabilities).toContain("view-teammate-stats");
  });

  it("there is one Owner: nobody is made an Owner, and the Owner never changes their own level", async () => {
    await signInAs(ownerId);
    const standard = await level("Standard Player");
    expect((await usersActions.setAccessLevelAction(ownerId, { level: "preset", presetId: standard.id })).ok).toBe(false);
    expect((await usersActions.setAccessLevelAction(ownerId, { level: "custom", capabilities: [] })).ok).toBe(false);
    expect((await getUser(handle.db, ownerId))!.role).toBe("owner");
    const refused = await usersActions.setAccessLevelAction(playerUserId, { level: "owner" });
    expect(refused).toMatchObject({ ok: false, error: expect.stringMatching(/one Owner/) });
    expect((await usersActions.setAccountRoleAction(playerUserId, "owner")).ok).toBe(false);
    expect((await getUser(handle.db, playerUserId))!.role).toBe("player");
    // With one Owner, nobody (not even a system call without an actor) can remove it.
    const { setAccessLevel } = await import("@/server/repositories/permissions");
    await expect(setAccessLevel(handle.db, null, ownerId, { level: "preset", presetId: standard.id })).rejects.toThrow(/last active Owner/);
  });

  it("built-in levels cannot be deleted; their capabilities can be edited", async () => {
    await signInAs(ownerId);
    const restricted = await level("Restricted Player");
    expect((await usersActions.deletePermissionPresetAction(restricted.id)).ok).toBe(false);
    expect((await usersActions.savePermissionPresetAction({ id: restricted.id, name: "Restricted Player", description: restricted.description, capabilities: [...restricted.capabilities, "view-teammate-stats"] })).ok).toBe(true);
    expect((await level("Restricted Player")).capabilities).toContain("view-teammate-stats");
    await usersActions.savePermissionPresetAction({ id: restricted.id, name: "Restricted Player", description: restricted.description, capabilities: restricted.capabilities });
  });
});

describe("username, password and profile picture", () => {
  it("changes the username without touching the password, profile or session; duplicates are refused", async () => {
    await signInAs(playerUserId);
    expect((await accountActions.changeUsernameAction("other")).ok).toBe(false);
    expect((await accountActions.changeUsernameAction("x")).ok).toBe(false);
    const r = await accountActions.changeUsernameAction("Gwen Main");
    expect(r).toEqual({ ok: true, data: { username: "Gwen Main" } });
    expect((await getSession())?.username).toBe("Gwen Main");
    const user = (await getUser(handle.db, playerUserId))!;
    expect(user.playerId).toBe(playerProfileId);
    // The display name is its own setting now: a new username leaves the visible name as it was.
    const before = (await getPlayer(handle.db, playerProfileId))!.displayName;
    expect(before).not.toBe("Gwen Main");
    expect(user.displayName).toBe(before);
    expect(await authenticate(handle.db, "gwen main", "oldrules1234")).not.toBeNull();
    expect(await authenticate(handle.db, "Riven Main", "oldrules1234")).toBeNull();
  });

  it("changes the display name everywhere it is read, never the username; validated on the server; not unique", async () => {
    await signInAs(playerUserId);
    const username = (await getUser(handle.db, playerUserId))!.username;
    for (const bad of ["x", "   ", "a".repeat(33), "Ad\u200Bmin", "!!!"]) expect((await accountActions.changeDisplayNameAction(bad)).ok).toBe(false);
    expect((await accountActions.changeDisplayNameAction(42 as unknown as string)).ok).toBe(false);
    const r = await accountActions.changeDisplayNameAction("  The   Rift Walker ");
    expect(r).toEqual({ ok: true, data: { displayName: "The Rift Walker" } });
    // The account (account menu, session label) and the player profile (every team page) agree.
    const user = (await getUser(handle.db, playerUserId))!;
    expect(user.displayName).toBe("The Rift Walker");
    expect(user.username).toBe(username);
    expect((await getPlayer(handle.db, playerProfileId))!.displayName).toBe("The Rift Walker");
    expect((await getSession())?.label).toBe("The Rift Walker");
    expect(await authenticate(handle.db, username, "oldrules1234")).not.toBeNull();
    expect(await authenticate(handle.db, "The Rift Walker", "oldrules1234")).toBeNull();
    // Another member may show the same name; nothing else changes for either.
    await signInAs(ownerId);
    expect((await accountActions.changeDisplayNameAction("The Rift Walker")).ok).toBe(true);
    expect((await getUser(handle.db, ownerId))!.displayName).toBe("The Rift Walker");
    expect((await getUser(handle.db, playerUserId))!.username).toBe(username);
    // Signed out: refused.
    state.cookies.clear();
    expect((await accountActions.changeDisplayNameAction("Nobody")).ok).toBe(false);
  });

  it("applies the new password rules only to new passwords, with confirmation and the current password", async () => {
    await signInAs(playerUserId);
    const change = (next: string, confirm = next, current = "oldrules1234") => usersActions.changeOwnPasswordAction({ current, next, confirm });
    const error = (r: Awaited<ReturnType<typeof change>>) => (r.ok ? "" : r.error);
    expect(error(await change("Ab1!cd"))).toMatch(/at least 12 characters/);
    expect(error(await change("Qwerty123456"))).toMatch(/too common/);
    expect((await change("purple tiger lamp", "purple tiger lamb")).ok).toBe(false);
    expect(error(await change("purple tiger lamp", "purple tiger lamp", "nope"))).toMatch(/Current password/);
    expect((await change("purple tiger lamp")).ok).toBe(true);
    expect(await authenticate(handle.db, "Gwen Main", "purple tiger lamp")).not.toBeNull();
    const [row] = await handle.db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, playerUserId));
    expect(row!.hash).not.toContain("purple");
  });

  it("stores, serves, replaces and removes a profile picture; refuses disguised or oversized files", async () => {
    await signInAs(playerUserId);
    expect((await accountActions.uploadAvatarAction(dataUrl(Buffer.from("not really a png at all, just text"), "image/png"))).ok).toBe(false);
    expect((await accountActions.uploadAvatarAction(dataUrl(pngOf(4000, 4000)))).ok).toBe(false);
    const gif = Buffer.concat([Buffer.from("GIF89a"), Buffer.from([32, 0, 32, 0]), Buffer.alloc(40)]);
    expect((await accountActions.uploadAvatarAction(dataUrl(gif, "image/gif"))).ok).toBe(false);
    const up = await accountActions.uploadAvatarAction(dataUrl(pngOf(256, 256)));
    expect(up.ok).toBe(true);
    const url = up.ok ? up.data.url : "";
    expect(url).toMatch(new RegExp(`^/api/avatars/${playerUserId}\\?v=\\d+$`));
    expect((await getUser(handle.db, playerUserId))!.avatarVersion).not.toBeNull();

    const res = await avatarRoute(new Request(`http://local${url}`), { params: Promise.resolve({ userId: playerUserId }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    // Not signed in: no picture.
    await signInAs(null);
    expect((await avatarRoute(new Request(`http://local${url}`), { params: Promise.resolve({ userId: playerUserId }) })).status).toBe(401);

    await signInAs(playerUserId);
    expect((await accountActions.removeAvatarAction()).ok).toBe(true);
    expect((await getUser(handle.db, playerUserId))!.avatarVersion).toBeNull();
    expect((await avatarRoute(new Request(`http://local${url}`), { params: Promise.resolve({ userId: playerUserId }) })).status).toBe(404);
  });
});

describe("Riot ID changes follow the PUUID", () => {
  function fakeRiot(names: Record<string, { gameName: string; tagLine: string }>, options: { down?: boolean } = {}) {
    return new RiotApiClient({
      apiKey: "k",
      limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]),
      sleep: async () => {},
      maxRetries: 0,
      fetchImpl: async (input: string | URL | Request) => {
        const url = String(input);
        const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
        if (options.down) return json({ status: { message: "down" } }, 503);
        const byPuuid = /\/accounts\/by-puuid\/([^/?]+)/.exec(url);
        if (byPuuid) {
          const n = names[decodeURIComponent(byPuuid[1]!)];
          return n ? json({ puuid: decodeURIComponent(byPuuid[1]!), ...n }) : json({}, 404);
        }
        const byId = /\/accounts\/by-riot-id\/([^/]+)\/([^/?]+)/.exec(url);
        if (byId) {
          const g = decodeURIComponent(byId[1]!);
          const t = decodeURIComponent(byId[2]!);
          const hit = Object.entries(names).find(([, n]) => n.gameName.toLowerCase() === g.toLowerCase() && n.tagLine.toLowerCase() === t.toLowerCase());
          return hit ? json({ puuid: hit[0], ...hit[1] }) : json({ status: { message: "not found" } }, 404);
        }
        if (url.includes("/region/by-game/")) return json({ puuid: "x", game: "lol", region: "OC1" });
        if (url.includes("/league/v4/")) return json([]);
        if (url.includes("/champion-mastery/")) return json([]);
        if (url.includes("/ids?")) return json([]);
        return json({}, 404);
      },
    });
  }

  it("Case A: a rename made in Riot updates the stored name automatically and keeps every game", async () => {
    const db = handle.db;
    const account = await addAccount(db, { ownerType: "player", playerId: playerProfileId, riotId: "Before#OCE", platform: "oc1", puuid: "puuid-renamed", label: "alt" });
    await db.insert(accountMatches).values({ accountId: account.id, matchId: "OC1_KEEP", gameCreation: 1_780_000_000_000, queueId: 420, championId: "Riven", role: "TOP", win: true, patch: "16.19" });
    const client = fakeRiot({ "puuid-renamed": { gameName: "After", tagLine: "NEW" } });
    await syncAccount(db, client, (await listAccountsForPlayer(db, playerProfileId)).find((a) => a.id === account.id)!, { maxMatchesPerRun: 5 });
    const fresh = (await listAccountsForPlayer(db, playerProfileId)).find((a) => a.id === account.id)!;
    expect(`${fresh.gameName}#${fresh.tagLine}`).toBe("After#NEW");
    expect(fresh.puuid).toBe("puuid-renamed");
    expect(fresh.riotIdCheckedAt).not.toBeNull();
    const games = await db.select().from(accountMatches).where(eq(accountMatches.accountId, account.id));
    expect(games.map((g) => g.matchId)).toEqual(["OC1_KEEP"]);
  });

  it("Case B: typing a new Riot ID renames (same PUUID), asks before replacing (new PUUID) and refuses another player's account", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    expect(team.id).toBeTruthy();
    const account = (await listAccountsForPlayer(db, playerProfileId)).find((a) => a.gameName === "After")!;
    await addAccount(db, { ownerType: "player", playerId: otherProfileId, riotId: "Taken#OCE", platform: "oc1", puuid: "puuid-taken" });
    const client = fakeRiot({ "puuid-renamed": { gameName: "Typed", tagLine: "OCE" }, "puuid-brand-new": { gameName: "Fresh", tagLine: "OCE" }, "puuid-taken": { gameName: "Taken", tagLine: "OCE" } });

    expect(await changeAccountRiotId(db, client, account, "Typed#OCE")).toEqual({ kind: "renamed", riotId: "Typed#OCE" });
    await expect(changeAccountRiotId(db, client, account, "Taken#OCE")).rejects.toThrow(/another player/);
    await expect(changeAccountRiotId(db, client, account, "Nobody#OCE")).rejects.toThrow(/no account/);
    await expect(changeAccountRiotId(db, fakeRiot({}, { down: true }), account, "Fresh#OCE")).rejects.toThrow(/nothing was changed/);

    const pending = await changeAccountRiotId(db, client, { ...account, gameName: "Typed" }, "Fresh#OCE");
    expect(pending).toEqual({ kind: "different-account", riotId: "Fresh#OCE" });
    expect((await db.select().from(riotAccounts).where(eq(riotAccounts.id, account.id))).length).toBe(1);

    const replaced = await changeAccountRiotId(db, client, { ...account, gameName: "Typed" }, "Fresh#OCE", { confirmReplace: true });
    expect(replaced.kind).toBe("replaced");
    const now = await listAccountsForPlayer(db, playerProfileId);
    expect(now.some((a) => a.id === account.id)).toBe(false);
    expect(now.find((a) => a.puuid === "puuid-brand-new")?.gameName).toBe("Fresh");
  });
});

describe("inline profile editing (autosave)", () => {
  it("saves only the given fields, keeps order, and refuses a save based on an outdated version", async () => {
    const { saveProfilePatchAction } = await import("@/server/actions/players");
    const { profileVersion } = await import("@/server/repositories/team");
    await signInAs(playerUserId);
    const before = (await getPlayer(handle.db, playerProfileId))!;
    const v0 = profileVersion(before);
    const r1 = await saveProfilePatchAction(playerProfileId, { primaryPool: ["Gwen", "Riven", "Jax"] }, v0);
    expect(r1.ok).toBe(true);
    const v1 = r1.ok ? r1.version : "";
    expect(v1).not.toBe(v0);
    let now = (await getPlayer(handle.db, playerProfileId))!;
    expect(now.primaryPool).toEqual(["Gwen", "Riven", "Jax"]);
    expect(now.primaryRole).toBe(before.primaryRole);
    // Reordering is just another save of the same list in a new order.
    const r2 = await saveProfilePatchAction(playerProfileId, { primaryPool: ["Jax", "Gwen", "Riven"] }, v1);
    expect(r2.ok).toBe(true);
    now = (await getPlayer(handle.db, playerProfileId))!;
    expect(now.primaryPool).toEqual(["Jax", "Gwen", "Riven"]);
    // A second tab still holding v1 cannot overwrite the newer order; it gets the latest state back.
    const stale = await saveProfilePatchAction(playerProfileId, { primaryPool: ["Riven"] }, v1);
    expect(stale.ok).toBe(false);
    expect(stale.ok ? null : stale.conflict?.primaryPool).toEqual(["Jax", "Gwen", "Riven"]);
    expect((await getPlayer(handle.db, playerProfileId))!.primaryPool).toEqual(["Jax", "Gwen", "Riven"]);
  });

  it("accepts uncapped pools, refuses duplicate roles, and clears the secondary pool when the secondary role is removed", async () => {
    const { saveProfilePatchAction } = await import("@/server/actions/players");
    await signInAs(playerUserId);
    // Phase 5: no pool size limits.
    const many = await saveProfilePatchAction(playerProfileId, { primaryPool: ["Gwen", "Riven", "Jax", "Ahri", "Syndra", "Orianna", "Ornn"] }, null);
    expect(many.ok).toBe(true);
    expect((await getPlayer(handle.db, playerProfileId))!.primaryPool).toHaveLength(7);
    const dupRole = await saveProfilePatchAction(playerProfileId, { additionalRoles: [{ role: "ADC", pool: [] }, { role: "ADC", pool: [] }] }, null);
    expect(dupRole.ok).toBe(false);
    const withSecondary = await saveProfilePatchAction(playerProfileId, { secondaryRole: "MID", secondaryPool: ["Ahri", "Syndra"] }, null);
    expect(withSecondary.ok).toBe(true);
    expect((await getPlayer(handle.db, playerProfileId))!.secondaryPool).toEqual(["Ahri", "Syndra"]);
    expect((await saveProfilePatchAction(playerProfileId, { secondaryPool: ["Ahri", "Syndra", "Orianna", "Zed"] }, null)).ok).toBe(true);
    await saveProfilePatchAction(playerProfileId, { secondaryRole: null }, null);
    const p = (await getPlayer(handle.db, playerProfileId))!;
    expect(p.secondaryRole).toBeNull();
    expect(p.secondaryPool).toEqual([]);
  });

  it("only the profile's owner (with the capability) or a player manager may save it", async () => {
    const { saveProfilePatchAction } = await import("@/server/actions/players");
    await signInAs(playerUserId);
    expect((await saveProfilePatchAction(otherProfileId, { primaryPool: ["Lee Sin"] }, null)).ok).toBe(false);
    await signInAs(ownerId);
    expect((await saveProfilePatchAction(otherProfileId, { primaryPool: ["LeeSin"] }, null)).ok).toBe(true);
    // Without edit-own-profile, a player cannot change even their own pools.
    await usersActions.setUserPermissionsAction(playerUserId, { custom: ["view-team", "view-players"] });
    await signInAs(playerUserId);
    expect((await saveProfilePatchAction(playerProfileId, { primaryPool: ["Gwen"] }, null)).ok).toBe(false);
    await signInAs(ownerId);
    await usersActions.setUserPermissionsAction(playerUserId, { presetId: null });
  });
});
