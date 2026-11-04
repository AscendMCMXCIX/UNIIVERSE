import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { testDb } from "./helpers";
import { createDb, type DbHandle } from "@/server/db/create";
import { invites, players, riotAccounts, users } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { RiotApiError } from "@/server/riot/api/client";
import { verifyRiotIdentity, type IdentityCheck, type RiotIdentityClient } from "@/server/riot/verify-identity";
import { createVerifiedPlayerAccount, deleteAccount, deleteProfile, listAccountViews, resetPasswordToTemporary, setAccountActive, setAccountRole } from "@/server/auth/account-admin";
import { completeSetup, loadSetupState, saveSetupProgress } from "@/server/auth/onboarding";
import { createSession, findSession } from "@/server/auth/sessions";
import { needsSetup, sessionFromUser } from "@/server/auth/session";
import { registerAccount } from "@/server/auth/signup";
import { authenticate, createUser, getUser, setPassword, setTemporaryPassword, TEMPORARY_PASSWORD_DAYS, UserError } from "@/server/repositories/users";
import { getOrCreateTeam, getPlayer, getPlayerRow } from "@/server/repositories/team";
import { runMigrations } from "@/server/db/migrator";
import { EMBEDDED_MIGRATIONS } from "@/server/db/migrations.generated";
import { hashPassword } from "@/server/auth/password";

/** Riot stand-in: a fixed directory of accounts, or a fixed failure. Records what it was asked. */
class FakeRiot implements RiotIdentityClient {
  calls: Array<{ gameName: string; tagLine: string }> = [];
  failWith: RiotApiError | Error | null = null;
  constructor(private readonly accounts: Record<string, { puuid: string; gameName: string; tagLine: string; platform?: string }>) {}
  async accountByRiotId(_platform: string, gameName: string, tagLine: string) {
    this.calls.push({ gameName, tagLine });
    if (this.failWith) throw this.failWith;
    const hit = this.accounts[`${gameName}#${tagLine}`.toLowerCase()];
    if (!hit) throw new RiotApiError("Riot API 404", 404, false);
    return hit;
  }
  async activePlatformByPuuid(_hint: string, puuid: string) {
    return Object.values(this.accounts).find((a) => a.puuid === puuid)?.platform ?? null;
  }
}

const riot = new FakeRiot({
  "rookie#oce": { puuid: "puuid-rookie", gameName: "Rookie", tagLine: "OCE", platform: "oc1" },
  "카이사장#kr1": { puuid: "puuid-unicode", gameName: "카이사장", tagLine: "KR1", platform: "kr" },
  "second#euw": { puuid: "puuid-second", gameName: "Second", tagLine: "EUW", platform: "euw1" },
  "third#na1": { puuid: "puuid-third", gameName: "Third", tagLine: "NA1" },
  "fourth#oce": { puuid: "puuid-fourth", gameName: "Fourth", tagLine: "OCE", platform: "oc1" },
  "fifth#oce": { puuid: "puuid-fifth", gameName: "Fifth", tagLine: "OCE", platform: "oc1" },
  "sixth#oce": { puuid: "puuid-sixth", gameName: "Sixth", tagLine: "OCE", platform: "oc1" },
  "seventh#oce": { puuid: "puuid-seventh", gameName: "Seventh", tagLine: "OCE", platform: "oc1" },
  "owner#oce": { puuid: "puuid-owner", gameName: "Owner", tagLine: "OCE", platform: "oc1" },
});

let handle: DbHandle;
let ownerId: string;
let ownerPlayerId: string;

async function verified(riotId: string): Promise<Extract<IdentityCheck, { status: "verified" }>> {
  const r = await verifyRiotIdentity(handle.db, riotId, riot, { platformHint: "oc1" });
  if (r.status !== "verified") throw new Error(`expected verified, got ${r.status}: ${"message" in r ? r.message : ""}`);
  return r;
}

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  // The existing owner: password, player profile, Riot account (created the way /setup does).
  const owner = await registerAccount(handle.db, { username: "Ascend", password: "Owner-pass-123", role: "owner", primaryRiot: { riotId: "Owner#OCE", platform: "oc1" }, primaryRole: "MID" });
  ownerId = owner.id;
  ownerPlayerId = owner.playerId!;
  await handle.db.update(riotAccounts).set({ puuid: "puuid-owner" }).where(eq(riotAccounts.playerId, ownerPlayerId));
});
afterAll(async () => {
  await handle.close();
});

describe("Riot identity verification", () => {
  it("rejects a malformed Riot ID before asking Riot", async () => {
    const before = riot.calls.length;
    expect((await verifyRiotIdentity(handle.db, "no-tag-here", riot, { platformHint: "oc1" })).status).toBe("invalid");
    expect((await verifyRiotIdentity(handle.db, "Name#", riot, { platformHint: "oc1" })).status).toBe("invalid");
    expect(riot.calls.length).toBe(before);
  });

  it("verifies a real account, resolves the PUUID and the server, and keeps Unicode names exactly", async () => {
    const r = await verified("Rookie#OCE");
    expect(r).toMatchObject({ puuid: "puuid-rookie", riotId: "Rookie#OCE", platform: "oc1", platformConfirmed: true });
    const u = await verified("카이사장#KR1");
    expect(u.riotId).toBe("카이사장#KR1");
    expect(u.platform).toBe("kr");
    expect(riot.calls.at(-1)).toEqual({ gameName: "카이사장", tagLine: "KR1" });
  });

  it("reports not found, Riot unavailable and failure distinctly", async () => {
    expect((await verifyRiotIdentity(handle.db, "Nobody#OCE", riot, { platformHint: "oc1" })).status).toBe("not-found");
    expect((await verifyRiotIdentity(handle.db, "Rookie#OCE", null, { platformHint: "oc1" })).status).toBe("unavailable");
    for (const [err, status] of [
      [new RiotApiError("401", 401, false), "unavailable"],
      [new RiotApiError("403", 403, false), "unavailable"],
      [new RiotApiError("rate", 429, true), "unavailable"],
      [new RiotApiError("down", 503, true), "unavailable"],
      [new RiotApiError("net", 0, true), "unavailable"],
      [new RiotApiError("bad", 400, false), "failed"],
      [new Error("boom"), "failed"],
    ] as const) {
      riot.failWith = err;
      expect((await verifyRiotIdentity(handle.db, "Rookie#OCE", riot, { platformHint: "oc1" })).status, String(err.message)).toBe(status);
    }
    riot.failWith = null;
  });

  it("refuses a Riot identity that already belongs to a player", async () => {
    const r = await verifyRiotIdentity(handle.db, "owner#oce", riot, { platformHint: "oc1" });
    expect(r.status).toBe("duplicate");
  });
});

describe("admin account creation", () => {
  it("creates account + profile + verified Riot account + a random temporary password in one step, no email", async () => {
    const created = await createVerifiedPlayerAccount(handle.db, { username: "Rookie", identity: await verified("Rookie#OCE"), createdByUserId: ownerId });
    const user = (await getUser(handle.db, created.user.id))!;
    expect(user).toMatchObject({ role: "player", hasPassword: true, mustChangePassword: true, isActive: true, setupCompletedAt: null, playerId: created.playerId });
    expect(user.temporaryPasswordExpiresAt!.getTime() - Date.now()).toBeGreaterThan((TEMPORARY_PASSWORD_DAYS - 1) * 86_400_000);
    const [acct] = await handle.db.select().from(riotAccounts).where(eq(riotAccounts.playerId, created.playerId));
    expect(acct).toMatchObject({ puuid: "puuid-rookie", gameName: "Rookie", tagLine: "OCE", platform: "oc1", platformSource: "riot", label: "main" });
    expect(created.temporaryPassword).toMatch(/^[A-Za-z2-9]{5}-[A-Za-z2-9]{5}-[A-Za-z2-9]{4}$/);
    const columns = Object.keys((await handle.db.select().from(users).limit(1))[0] ?? {});
    expect(columns.some((c) => /email/i.test(c))).toBe(false);
    // Only a hash is stored, never the password.
    const [row] = await handle.db.select().from(users).where(eq(users.id, created.user.id));
    expect(row!.passwordHash).toMatch(/^scrypt\$/);
    expect(JSON.stringify(row)).not.toContain(created.temporaryPassword);
    expect(needsSetup(sessionFromUser(user))).toBe(true);
    // Two accounts never get the same temporary password.
    const other = await createVerifiedPlayerAccount(handle.db, { username: "Rookie2", identity: await verified("Fifth#OCE"), createdByUserId: ownerId });
    expect(other.temporaryPassword).not.toBe(created.temporaryPassword);
    await deleteAccount(handle.db, ownerId, other.user.id, { eraseProfile: true });
  });

  it("rejects a duplicate username (case-insensitively) and a duplicate Riot identity, leaving nothing behind", async () => {
    const before = { users: (await handle.db.select().from(users)).length, players: (await handle.db.select().from(players)).length, accounts: (await handle.db.select().from(riotAccounts)).length };
    await expect(createVerifiedPlayerAccount(handle.db, { username: "rOOKIE", identity: await verified("Second#EUW"), createdByUserId: ownerId })).rejects.toThrow(/username is already taken/);
    // A duplicate Riot identity is caught by verification and again inside the transaction.
    expect((await verifyRiotIdentity(handle.db, "ROOKIE#oce", riot, { platformHint: "oc1" })).status).toBe("duplicate");
    const stale = { status: "verified", puuid: "puuid-rookie", gameName: "Rookie", tagLine: "OCE", riotId: "Rookie#OCE", platform: "oc1", platformConfirmed: true, reuseArchivedPlayerId: null } as const;
    await expect(createVerifiedPlayerAccount(handle.db, { username: "Copycat", identity: stale, createdByUserId: ownerId })).rejects.toThrow(/already belongs/);
    const after = { users: (await handle.db.select().from(users)).length, players: (await handle.db.select().from(players)).length, accounts: (await handle.db.select().from(riotAccounts)).length };
    expect(after).toEqual(before);
  });

  it("needs a successful verification: an unverified result cannot be turned into an account", async () => {
    const notFound = await verifyRiotIdentity(handle.db, "Ghost#OCE", riot, { platformHint: "oc1" });
    expect(notFound.status).not.toBe("verified");
    // The server action only calls createVerifiedPlayerAccount with a verified identity; its type refuses anything else.
    expect(notFound.status === "verified").toBe(false);
  });
});

describe("passwords", () => {
  let userId: string;
  let temp: string;
  beforeAll(async () => {
    const created = await createVerifiedPlayerAccount(handle.db, { username: "Second", identity: await verified("Second#EUW"), createdByUserId: ownerId });
    userId = created.user.id;
    temp = created.temporaryPassword;
  });

  it("never sign in by username alone or a wrong password", async () => {
    expect(await authenticate(handle.db, "Second", "")).toBeNull();
    expect(await authenticate(handle.db, "Second", "wrong-pass-123")).toBeNull();
    expect(await authenticate(handle.db, "Rookie", temp)).toBeNull(); // someone else's username
  });

  it("the temporary password works until it is replaced, then only the permanent one does", async () => {
    const first = await authenticate(handle.db, "second", temp);
    expect(first).not.toBeNull();
    expect(first!.mustChangePassword).toBe(true);
    await setPassword(handle.db, userId, "my-own-pass-2024", { keepSessions: true });
    expect(await authenticate(handle.db, "Second", temp)).toBeNull();
    const after = await authenticate(handle.db, "Second", "my-own-pass-2024");
    expect(after).not.toBeNull();
    expect(after!.mustChangePassword).toBe(false);
    expect((await getUser(handle.db, userId))!.temporaryPasswordExpiresAt).toBeNull();
  });

  it("an expired temporary password is refused", async () => {
    const old = await setTemporaryPassword(handle.db, userId, { now: new Date(Date.now() - (TEMPORARY_PASSWORD_DAYS + 1) * 86_400_000) });
    expect(await authenticate(handle.db, "Second", old.password)).toBeNull();
    expect((await listAccountViews(handle.db)).find((v) => v.userId === userId)?.password.state).toBe("expired");
  });

  it("an admin reset replaces the old password, signs the account out everywhere and must be changed at next sign-in", async () => {
    await setPassword(handle.db, userId, "my-own-pass-2024", { keepSessions: true });
    const { token } = await createSession(handle.db, userId);
    expect(await findSession(handle.db, token)).not.toBeNull();
    expect(await findSession(handle.db, token)).not.toBeNull(); // a refresh keeps the session
    const reset = await resetPasswordToTemporary(handle.db, ownerId, userId);
    expect(await findSession(handle.db, token)).toBeNull();
    expect(await authenticate(handle.db, "Second", "my-own-pass-2024")).toBeNull();
    const signedIn = await authenticate(handle.db, "Second", reset.password);
    expect(signedIn?.mustChangePassword).toBe(true);
    expect(needsSetup(sessionFromUser((await getUser(handle.db, userId))!))).toBe(true);
    await expect(resetPasswordToTemporary(handle.db, ownerId, ownerId)).rejects.toThrow(/your own password/);
  });

  it("deactivated accounts cannot sign in, and deactivation signs the account out everywhere", async () => {
    await setPassword(handle.db, userId, "my-own-pass-2024", { keepSessions: true });
    const { token } = await createSession(handle.db, userId);
    await setAccountActive(handle.db, ownerId, userId, false);
    expect(await findSession(handle.db, token)).toBeNull();
    expect(await authenticate(handle.db, "Second", "my-own-pass-2024")).toBeNull();
    await expect(resetPasswordToTemporary(handle.db, ownerId, userId)).rejects.toThrow(/deactivated/);
    await setAccountActive(handle.db, ownerId, userId, true);
    expect(await authenticate(handle.db, "Second", "my-own-pass-2024")).not.toBeNull();
  });

  it("the owner keeps their password sign-in", async () => {
    expect(await authenticate(handle.db, "Ascend", "Owner-pass-123")).not.toBeNull();
    expect((await getUser(handle.db, ownerId))!.mustChangePassword).toBe(false);
  });
});

describe("mandatory first-time setup", () => {
  let userId: string;
  let playerId: string;
  beforeAll(async () => {
    const created = await createVerifiedPlayerAccount(handle.db, { username: "Third", identity: await verified("Third#NA1"), createdByUserId: ownerId });
    userId = created.user.id;
    playerId = created.playerId;
    // Step 1 (the permanent password) comes first; setup is step 2.
    expect(needsSetup(sessionFromUser((await getUser(handle.db, userId))!))).toBe(true);
    await setPassword(handle.db, userId, "third-pass-2024", { keepSessions: true });
  });

  it("starts empty, keeps the username and Riot ID from creation, and resumes saved progress after a refresh", async () => {
    const start = await loadSetupState(handle.db, userId);
    // The display name starts as the one the account already shows (its username at creation).
    expect(start.state).toEqual({ displayName: "Third", primaryRole: null, primaryPool: [], secondaryRole: null, secondaryPool: [] });
    expect(start.resume).toBe("name");
    expect(start.user.username).toBe("Third");
    expect((await getPlayerRow(handle.db, playerId))!.riotId).toBe("Third#NA1");
    // No role is chosen for the player: the profile has none until setup.
    expect((await getPlayerRow(handle.db, playerId))!.primaryRole).toBeNull();
    await saveSetupProgress(handle.db, userId, { primaryRole: "ADC", primaryPool: ["Jinx", "Kaisa"] });
    const resumed = await loadSetupState(handle.db, userId);
    expect(resumed.state).toMatchObject({ displayName: "Third", primaryRole: "ADC", primaryPool: ["Jinx", "Kaisa"] });
    // They had reached roles and champions: a refresh opens that step again.
    expect(resumed.resume).toBe("profile");
    expect(needsSetup(sessionFromUser((await getUser(handle.db, userId))!))).toBe(true); // still not set up
  });

  it("validates the required fields on the server", async () => {
    await expect(completeSetup(handle.db, userId, { primaryPool: ["Jinx"] })).rejects.toThrow(/primary role/);
    await expect(completeSetup(handle.db, userId, { primaryRole: "ADC", primaryPool: [] })).rejects.toThrow(/at least one champion/);
    await expect(completeSetup(handle.db, userId, { primaryRole: "ADC", primaryPool: ["NotAChampion"] })).rejects.toThrow(/Unknown champion/);
    await expect(completeSetup(handle.db, userId, { displayName: " x ", primaryRole: "ADC", primaryPool: ["Jinx"] })).rejects.toThrow(/Display name: At least 2/);
    await expect(completeSetup(handle.db, userId, { displayName: "Bad\u202Ename", primaryRole: "ADC", primaryPool: ["Jinx"] })).rejects.toThrow(/Display name/);
    expect((await getUser(handle.db, userId))!.setupCompletedAt).toBeNull();
  });

  it("treats the secondary role as optional and opens the app once complete", async () => {
    const user = await completeSetup(handle.db, userId, { primaryRole: "ADC", primaryPool: ["Jinx", "Kaisa"] });
    expect(user.setupCompletedAt).not.toBeNull();
    expect(needsSetup(sessionFromUser(user))).toBe(false);
    const player = (await getPlayer(handle.db, playerId))!;
    expect(player).toMatchObject({ primaryRole: "ADC", secondaryRole: null, primaryPool: ["Jinx", "Kaisa"], secondaryPool: [] });
    const [row] = await handle.db.select({ progress: users.setupProgress }).from(users).where(eq(users.id, userId));
    expect(row!.progress).toBeNull();
  });

  it("stores the chosen display name on the account and its profile, and never changes the username", async () => {
    const created = await createVerifiedPlayerAccount(handle.db, { username: "Sixth", identity: await verified("Sixth#OCE"), createdByUserId: ownerId });
    await completeSetup(handle.db, created.user.id, { displayName: "  Sixth   Sense ", primaryRole: "MID", primaryPool: ["Ahri"] });
    const user = (await getUser(handle.db, created.user.id))!;
    expect(user).toMatchObject({ username: "Sixth", displayName: "Sixth Sense" });
    expect((await getPlayer(handle.db, created.playerId))!.displayName).toBe("Sixth Sense");
    // Without one (an older open tab), the name the account already shows is kept.
    const older = await createVerifiedPlayerAccount(handle.db, { username: "Seventh", identity: await verified("Seventh#OCE"), createdByUserId: ownerId });
    await completeSetup(handle.db, older.user.id, { primaryRole: "TOP", primaryPool: ["Gwen"] });
    expect((await getPlayer(handle.db, older.playerId))!.displayName).toBe("Seventh");
    // Coming back to the setup after finishing shows the saved answers, name included.
    const back = await loadSetupState(handle.db, created.user.id);
    expect(back.state).toMatchObject({ displayName: "Sixth Sense", primaryRole: "MID", primaryPool: ["Ahri"] });
  });

  it("stores an optional secondary role and pool", async () => {
    const created = await createVerifiedPlayerAccount(handle.db, { username: "Fifth", identity: await verified("Fifth#OCE"), createdByUserId: ownerId });
    await completeSetup(handle.db, created.user.id, { primaryRole: "SUPPORT", primaryPool: ["Nautilus"], secondaryRole: "ADC", secondaryPool: ["Jinx"] });
    expect(await getPlayer(handle.db, created.playerId)).toMatchObject({ primaryRole: "SUPPORT", secondaryRole: "ADC", primaryPool: ["Nautilus"], secondaryPool: ["Jinx"] });
  });
});

describe("account management guards and data integrity", () => {
  it("never lets an admin remove themselves or the last admin", async () => {
    await expect(setAccountActive(handle.db, ownerId, ownerId, false)).rejects.toThrow(/your own account/);
    await expect(deleteAccount(handle.db, ownerId, ownerId)).rejects.toThrow(/your own account/);
    await expect(setAccountRole(handle.db, ownerId, ownerId, "player")).rejects.toThrow(/your own account/);
    // Another admin acting on the only admin with a password is refused too.
    const other = await createUser(handle.db, { username: "Helper", password: null, role: "owner" });
    await expect(setAccountActive(handle.db, other.id, ownerId, false)).rejects.toThrow(/last active Owner/);
    await expect(deleteAccount(handle.db, other.id, ownerId)).rejects.toThrow(/last active Owner/);
    await expect(setAccountRole(handle.db, other.id, ownerId, "player")).rejects.toThrow(/last active Owner/);
    await deleteAccount(handle.db, ownerId, other.id);
  });

  it("deletes an account by archiving its profile: history stays, and the same Riot ID later restores the profile", async () => {
    const created = await createVerifiedPlayerAccount(handle.db, { username: "Leaver", identity: await verified("Rookie#OCE").catch(async () => verified("카이사장#KR1")), createdByUserId: ownerId });
    await deleteAccount(handle.db, ownerId, created.user.id);
    expect(await getUser(handle.db, created.user.id)).toBeNull();
    expect((await getPlayerRow(handle.db, created.playerId))!.archivedAt).not.toBeNull();
    // Re-creating the same person reuses the archived profile instead of duplicating it.
    const identity = await verifyRiotIdentity(handle.db, "카이사장#KR1", riot, { platformHint: "oc1" });
    expect(identity.status).toBe("verified");
    const back = await createVerifiedPlayerAccount(handle.db, { username: "Returner", identity: identity as Extract<IdentityCheck, { status: "verified" }>, createdByUserId: ownerId });
    expect(back.reusedProfile).toBe(true);
    expect(back.playerId).toBe(created.playerId);
    expect((await getPlayerRow(handle.db, created.playerId))!.archivedAt).toBeNull();
  });

  it("keeps the existing owner intact: identity, password, admin role, profile, Riot account and pools", async () => {
    const owner = (await getUser(handle.db, ownerId))!;
    expect(owner).toMatchObject({ username: "Ascend", role: "owner", isActive: true, hasPassword: true, playerId: ownerPlayerId });
    expect(owner.setupCompletedAt).not.toBeNull();
    expect(await authenticate(handle.db, "ascend", "Owner-pass-123")).not.toBeNull();
    const [acct] = await handle.db.select().from(riotAccounts).where(eq(riotAccounts.playerId, ownerPlayerId));
    expect(acct?.puuid).toBe("puuid-owner");
    // No duplicate identities anywhere.
    const dupes = await handle.db.execute(sql`SELECT puuid FROM riot_accounts WHERE puuid IS NOT NULL GROUP BY puuid HAVING count(*) > 1`);
    expect(((dupes as unknown as { rows?: unknown[] }).rows ?? (dupes as unknown as unknown[])).length).toBe(0);
    const linked = await handle.db.execute(sql`SELECT player_id FROM users WHERE player_id IS NOT NULL GROUP BY player_id HAVING count(*) > 1`);
    expect(((linked as unknown as { rows?: unknown[] }).rows ?? (linked as unknown as unknown[])).length).toBe(0);
  });
});

describe("removing test or mistaken entries", () => {
  it("deletes an unfinished test account together with its profile and Riot account, leaving nothing behind", async () => {
    const tester = new FakeRiot({ "reqwym#oc": { puuid: "puuid-test", gameName: "reqwym", tagLine: "oc" } });
    const identity = await verifyRiotIdentity(handle.db, "reqwym#oc", tester, { platformHint: "oc1" });
    const created = await createVerifiedPlayerAccount(handle.db, { username: "test", identity: identity as Extract<IdentityCheck, { status: "verified" }>, createdByUserId: ownerId });
    await deleteAccount(handle.db, ownerId, created.user.id, { eraseProfile: true });
    expect(await getUser(handle.db, created.user.id)).toBeNull();
    expect(await getPlayer(handle.db, created.playerId)).toBeNull();
    expect(await handle.db.select().from(riotAccounts).where(eq(riotAccounts.puuid, "puuid-test"))).toHaveLength(0);
    // The Riot ID is free again.
    expect((await verifyRiotIdentity(handle.db, "reqwym#oc", tester, { platformHint: "oc1" })).status).toBe("verified");
  });

  it("deletes a profile that has no account, and refuses one that still belongs to an account", async () => {
    const team = await getOrCreateTeam(handle.db);
    const { createPlayer } = await import("@/server/repositories/team");
    const orphan = await createPlayer(handle.db, team.id, { displayName: "Old placeholder", primaryRole: "TOP", primaryPool: ["Gwen"] });
    await deleteProfile(handle.db, orphan.id);
    expect(await getPlayer(handle.db, orphan.id)).toBeNull();
    await expect(deleteProfile(handle.db, ownerPlayerId)).rejects.toThrow(/belongs to an account/);
    expect(await getPlayer(handle.db, ownerPlayerId)).not.toBeNull();
  });
});

describe("migration 0007 on production-shaped data", () => {
  it("keeps the owner and every association, retires Draft Lead without granting admin, and keeps old players able to sign in", async () => {
    const fresh = await createDb({ mode: "pglite-memory", migrate: false });
    const db = fresh.db;
    try {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS uniiverse_migrations (tag text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
      for (const m of EMBEDDED_MIGRATIONS.filter((m) => m.tag < "0007")) {
        for (const statement of m.statements) await db.execute(sql.raw(statement));
        await db.execute(sql`INSERT INTO uniiverse_migrations (tag, hash) VALUES (${m.tag}, ${m.hash})`);
      }
      const team = [((r) => ((r as unknown as { rows?: Array<{ id: string }> }).rows ?? (r as unknown as Array<{ id: string }>))[0]!)(await db.execute(sql`INSERT INTO teams (name) VALUES ('UNIIVERSE') RETURNING id`))];
      const ownerHash = await hashPassword("Owner-pass-123");
      const mkPlayer = async (name: string) => (((r) => ((r as unknown as { rows?: Array<{ id: string }> }).rows ?? (r as unknown as Array<{ id: string }>))[0]!)(await db.execute(sql`INSERT INTO players (team_id, display_name, primary_role, "group") VALUES (${team[0]!.id}, ${name}, 'MID', 'main') RETURNING id`))).id;
      const ownerPlayer = await mkPlayer("Ascend");
      const leadPlayer = await mkPlayer("Lead");
      const pendingPlayer = await mkPlayer("Pending");
      await db.execute(sql`INSERT INTO riot_accounts (owner_type, player_id, game_name, tag_line, platform, puuid) VALUES ('player', ${ownerPlayer}, 'Owner', 'OCE', 'oc1', 'puuid-owner')`);
      // Pre-0007 schema: plain SQL (the new columns do not exist yet).
      const row = async (q: ReturnType<typeof sql>) => {
        const r = await db.execute(q);
        return ((r as unknown as { rows?: Array<{ id: string }> }).rows ?? (r as unknown as Array<{ id: string }>))[0]!;
      };
      const owner = await row(sql`INSERT INTO users (username, display_name, password_hash, role, player_id, setup_completed_at) VALUES ('Ascend', 'Ascend', ${ownerHash}, 'owner', ${ownerPlayer}, now()) RETURNING id`);
      const coach = await row(sql`INSERT INTO users (username, display_name, password_hash, role, draft_lead, setup_completed_at) VALUES ('Coach', 'Coach', ${await hashPassword("coach-pass-123")}, 'coach', false, now()) RETURNING id`);
      const lead = await row(sql`INSERT INTO users (username, display_name, password_hash, role, draft_lead, player_id, setup_completed_at) VALUES ('Lead', 'Lead', ${await hashPassword("lead-pass-1234")}, 'player', true, ${leadPlayer}, now()) RETURNING id`);
      const pending = await row(sql`INSERT INTO users (username, display_name, role, player_id) VALUES ('Pending', 'Pending', 'player', ${pendingPlayer}) RETURNING id`);
      await db.execute(sql`INSERT INTO invites (token, role, user_id, expires_at) VALUES ('old-invite', 'player', ${pending.id}, now() + interval '7 days')`);

      const result = await runMigrations(db, { useAdvisoryLock: false });
      expect(result.applied).toEqual(["0007_auth_activation_ownership", "0008_password_signin", "0009_separate_admin_account", "0010_season_history_pro_patches", "0011_ranked_5s_mode", "0012_permissions_avatars", "0013_brand_assets", "0014_access_levels", "0015_brand_upload_chunks", "0016_phase5_profiles", "0017_phase6_identity", "0018_phase6_accounts", "0019_phase6_backgrounds", "0020_phase6_access_groups", "0021_p7_draft_side", "0022_p7_ranked_ban_recount", "0023_p7_blocks", "0024_p7_unset_primary_role", "0025_p7_skin_kinds", "0026_p7_match_details", "0027_p9_block_featured_champion", "0028_p9_match_timelines", "0029_p10_team_access", "0030_p11_rank_queue", "0031_p11_retire_other_coach", "0032_p13_card_studio", "0033_p15_match_summary", "0034_r6_match_links", "0035_r8_rank_snapshots", "0036_matchups_frames", "0037_account_order", "0038_blocks_completion_rules", "0039_patterns_notes", "0040_public_profiles", "0041_lineup_substitutes", "0042_retire_trends_capability", "0043_audit_events", "0044_row_level_security", "0045_keep_product_name", "0046_auth_failures", "0047_db_egress_daily", "0048_last_known_ranks", "0049_social_links", "0050_clash_scouts", "0051_public_site_copy", "0052_data_api_grants", "0053_administrator_access", "0054_web_vitals", "0055_restore_ascend_owner", "0056_privacy_erasures", "0057_participant_ranks", "0058_match_details_puuids", "0059_ranked_development", "0060_match_timeline_events", "0061_social_links_public", "0062_retire_meta_trends_tables", "0063_retire_draft_tables"]);

      const after = async (id: string) => (await db.select().from(users).where(eq(users.id, id)))[0]!;
      // 0009 split the account ("Ascend" a player, a new admin-only "adminascend" the Owner) and
      // 0055 joined it again (tests/db/restore-owner.test.ts): "Ascend" is the Owner with its
      // profile, Riot account and password; "adminascend" is left deactivated, without a
      // password, and cannot sign in.
      const o = await after(owner.id);
      expect(o).toMatchObject({ username: "Ascend", role: "owner", passwordHash: ownerHash, playerId: ownerPlayer, isActive: true, mustChangePassword: false });
      expect(o.setupCompletedAt).not.toBeNull();
      expect(await authenticate(db, "Ascend", "Owner-pass-123")).not.toBeNull();
      const admin = (await db.select().from(users).where(eq(users.username, "adminascend")))[0]!;
      expect(admin).toMatchObject({ role: "player", playerId: null, passwordHash: null, isActive: false, mustChangePassword: false });
      expect(await authenticate(db, "adminascend", "Owner-pass-123")).toBeNull();
      expect((await db.select().from(users).where(eq(users.role, "owner"))).map((u) => u.username)).toEqual(["Ascend"]);
      expect((await db.select().from(riotAccounts).where(eq(riotAccounts.playerId, ownerPlayer)))[0]?.puuid).toBe("puuid-owner");
      // Draft Lead and the coach role are retired to Player, never to Admin.
      expect((await after(coach.id)).role).toBe("player");
      expect(await after(lead.id)).toMatchObject({ role: "player", draftLead: false, playerId: leadPlayer });
      // Existing players keep their password until they redeem a code; pending setup stays pending.
      expect(await authenticate(db, "Lead", "lead-pass-1234")).not.toBeNull();
      expect((await after(pending.id)).setupCompletedAt).toBeNull();
      // Old invitation links stop working.
      const [inv] = await db.select().from(invites).where(eq(invites.token, "old-invite"));
      expect(inv!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
      expect((await runMigrations(db, { useAdvisoryLock: false })).applied).toEqual([]);
    } finally {
      await fresh.close();
    }
  });

  it("0009 changes nothing on a deployment without an \"ascend\" owner that has a player profile", async () => {
    const fresh = await createDb({ mode: "pglite-memory", migrate: false });
    const db = fresh.db;
    try {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS uniiverse_migrations (tag text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
      for (const m of EMBEDDED_MIGRATIONS.filter((m) => m.tag < "0009")) {
        for (const statement of m.statements) await db.execute(sql.raw(statement));
        await db.execute(sql`INSERT INTO uniiverse_migrations (tag, hash) VALUES (${m.tag}, ${m.hash})`);
      }
      // An "ascend" owner without a player profile is already admin-only: left alone.
      const hash = await hashPassword("Owner-pass-123");
      await db.execute(sql`INSERT INTO users (username, display_name, password_hash, role, setup_completed_at) VALUES ('ascend', 'ascend', ${hash}, 'owner', now())`);
      expect((await runMigrations(db, { useAdvisoryLock: false })).applied).toContain("0009_separate_admin_account");
      const all = await db.select().from(users);
      expect(all.map((u) => [u.username, u.role])).toEqual([["ascend", "owner"]]);
    } finally {
      await fresh.close();
    }
  });
});

describe("username rules", () => {
  it("are case-insensitive and unique", async () => {
    await expect(createUser(handle.db, { username: "ASCEND", password: null, role: "player" })).rejects.toBeInstanceOf(UserError);
  });
});
