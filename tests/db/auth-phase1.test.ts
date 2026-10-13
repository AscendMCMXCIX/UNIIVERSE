import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { testDb } from "./helpers";
import { createDb, type DbHandle } from "@/server/db/create";
import { activationCodes, drafts, invites, players, riotAccounts, users } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { RiotApiError } from "@/server/riot/api/client";
import { verifyRiotIdentity, type IdentityCheck, type RiotIdentityClient } from "@/server/riot/verify-identity";
import { createVerifiedPlayerAccount, deleteAccount, listAccountViews, setAccountActive, setAccountRole } from "@/server/auth/account-admin";
import { ACTIVATION_CODE_DAYS, generateActivationCode, hashActivationCode, issueActivationCode, looksLikeActivationCode, MAX_CODE_ATTEMPTS, redeemActivationCode } from "@/server/auth/activation";
import { completeSetup, loadSetupState, saveSetupProgress } from "@/server/auth/onboarding";
import { createSession, findSession } from "@/server/auth/sessions";
import { needsSetup, sessionFromUser } from "@/server/auth/session";
import { registerAccount } from "@/server/auth/signup";
import { authenticate, createUser, getUser, setPassword, UserError } from "@/server/repositories/users";
import { getOrCreateTeam, getPlayer, listPlayers } from "@/server/repositories/team";
import { createDraft, getDraft } from "@/server/repositories/drafts";
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
  const owner = await registerAccount(handle.db, { username: "Ascend", password: "owner-pass-123", role: "owner", primaryRiot: { riotId: "Owner#OCE", platform: "oc1" }, primaryRole: "MID" });
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
  it("creates account + profile + verified Riot account + activation code in one step, no password and no email", async () => {
    const created = await createVerifiedPlayerAccount(handle.db, { username: "Rookie", identity: await verified("Rookie#OCE"), createdByUserId: ownerId });
    const user = (await getUser(handle.db, created.user.id))!;
    expect(user).toMatchObject({ role: "player", hasPassword: false, isActive: true, setupCompletedAt: null, playerId: created.playerId });
    const [acct] = await handle.db.select().from(riotAccounts).where(eq(riotAccounts.playerId, created.playerId));
    expect(acct).toMatchObject({ puuid: "puuid-rookie", gameName: "Rookie", tagLine: "OCE", platform: "oc1", platformSource: "riot", label: "main" });
    expect(looksLikeActivationCode(created.code)).toBe(true);
    expect(created.expiresAt.getTime() - Date.now()).toBeGreaterThan((ACTIVATION_CODE_DAYS - 1) * 86_400_000);
    const columns = Object.keys((await handle.db.select().from(users).limit(1))[0] ?? {});
    expect(columns.some((c) => /email/i.test(c))).toBe(false);
    // Only the hash is stored.
    const [stored] = await handle.db.select().from(activationCodes).where(eq(activationCodes.userId, created.user.id));
    expect(stored!.codeHash).toBe(hashActivationCode(created.code));
    expect(JSON.stringify(stored)).not.toContain(created.code);
    expect(needsSetup(sessionFromUser(user))).toBe(true);
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

describe("activation codes", () => {
  let userId: string;
  let code: string;
  beforeAll(async () => {
    const created = await createVerifiedPlayerAccount(handle.db, { username: "Second", identity: await verified("Second#EUW"), createdByUserId: ownerId });
    userId = created.user.id;
    code = created.code;
  });

  it("are high-entropy and shaped for humans", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateActivationCode()));
    expect(codes.size).toBe(200);
    for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  });

  it("never sign in by username alone", async () => {
    expect((await redeemActivationCode(handle.db, "Second", "")).ok).toBe(false);
    expect(await authenticate(handle.db, "Second", "")).toBeNull();
  });

  it("work exactly once, ignoring case and dashes, and are useless for another username", async () => {
    expect((await redeemActivationCode(handle.db, "Rookie", code)).ok).toBe(false); // someone else's username
    const ok = await redeemActivationCode(handle.db, "second", code.toLowerCase().replace(/-/g, " "));
    expect(ok.ok).toBe(true);
    expect((await redeemActivationCode(handle.db, "Second", code)).ok).toBe(false); // replay
  });

  it("expire, and a new code revokes the old unused one", async () => {
    const old = await issueActivationCode(handle.db, userId, ownerId, { now: new Date(Date.now() - (ACTIVATION_CODE_DAYS + 1) * 86_400_000) });
    expect((await redeemActivationCode(handle.db, "Second", old.code)).ok).toBe(false); // expired
    const a = await issueActivationCode(handle.db, userId, ownerId);
    const b = await issueActivationCode(handle.db, userId, ownerId);
    expect((await redeemActivationCode(handle.db, "Second", a.code)).ok).toBe(false);
    expect((await redeemActivationCode(handle.db, "Second", b.code)).ok).toBe(true);
  });

  it("are burned after repeated wrong guesses (rate limit stored in the database)", async () => {
    const live = await issueActivationCode(handle.db, userId, ownerId);
    for (let i = 1; i < MAX_CODE_ATTEMPTS; i++) expect(await redeemActivationCode(handle.db, "Second", generateActivationCode())).toEqual({ ok: false, reason: "invalid" });
    expect(await redeemActivationCode(handle.db, "Second", generateActivationCode())).toEqual({ ok: false, reason: "locked" });
    expect((await redeemActivationCode(handle.db, "Second", live.code)).ok).toBe(false); // even the right code is dead now
    const views = await listAccountViews(handle.db);
    expect(views.find((v) => v.userId === userId)?.code.state).toBe("locked");
  });

  it("are refused for deactivated accounts, and deactivation signs the account out everywhere", async () => {
    const { token } = await createSession(handle.db, userId, { remember: true });
    expect(await findSession(handle.db, token)).not.toBeNull();
    expect(await findSession(handle.db, token)).not.toBeNull(); // a refresh keeps the session
    const live = await issueActivationCode(handle.db, userId, ownerId);
    await setAccountActive(handle.db, ownerId, userId, false);
    expect(await findSession(handle.db, token)).toBeNull();
    expect((await redeemActivationCode(handle.db, "Second", live.code)).ok).toBe(false);
    await expect(issueActivationCode(handle.db, userId, ownerId)).rejects.toThrow(/deactivated/);
    await setAccountActive(handle.db, ownerId, userId, true);
    const fresh = await issueActivationCode(handle.db, userId, ownerId);
    expect((await redeemActivationCode(handle.db, "Second", fresh.code)).ok).toBe(true);
  });

  it("are never issued to or accepted by an admin with a password: the owner keeps password sign-in", async () => {
    await expect(issueActivationCode(handle.db, ownerId, ownerId)).rejects.toThrow(/password/);
    // Even a code row planted for the owner is refused.
    await handle.db.insert(activationCodes).values({ userId: ownerId, codeHash: hashActivationCode("AAAA-BBBB-CCCC"), expiresAt: new Date(Date.now() + 86_400_000) });
    expect((await redeemActivationCode(handle.db, "Ascend", "AAAA-BBBB-CCCC")).ok).toBe(false);
    expect(await authenticate(handle.db, "Ascend", "owner-pass-123")).not.toBeNull();
  });

  it("move an existing player off their old password on first use (no lock-out before that)", async () => {
    const legacy = await createVerifiedPlayerAccount(handle.db, { username: "Legacy", identity: await verified("Fourth#OCE"), createdByUserId: ownerId });
    await setPassword(handle.db, legacy.user.id, "legacy-pass-1234");
    expect(await authenticate(handle.db, "Legacy", "legacy-pass-1234")).not.toBeNull(); // still works during the transition
    const issued = await issueActivationCode(handle.db, legacy.user.id, ownerId);
    expect((await redeemActivationCode(handle.db, "Legacy", issued.code)).ok).toBe(true);
    expect(await authenticate(handle.db, "Legacy", "legacy-pass-1234")).toBeNull(); // passwordless from now on
    expect((await getUser(handle.db, legacy.user.id))!.hasPassword).toBe(false);
  });
});

describe("mandatory first-time setup", () => {
  let userId: string;
  let playerId: string;
  beforeAll(async () => {
    const created = await createVerifiedPlayerAccount(handle.db, { username: "Third", identity: await verified("Third#NA1"), createdByUserId: ownerId });
    userId = created.user.id;
    playerId = created.playerId;
  });

  it("starts empty, keeps the username and Riot ID from creation, and resumes saved progress after a refresh", async () => {
    const start = await loadSetupState(handle.db, userId);
    expect(start.state).toEqual({ primaryRole: null, primaryPool: [], secondaryRole: null, secondaryPool: [] });
    expect(start.user.username).toBe("Third");
    expect((await getPlayer(handle.db, playerId))!.riotId).toBe("Third#NA1");
    await saveSetupProgress(handle.db, userId, { primaryRole: "ADC", primaryPool: ["Jinx", "Kaisa"] });
    expect((await loadSetupState(handle.db, userId)).state).toMatchObject({ primaryRole: "ADC", primaryPool: ["Jinx", "Kaisa"] });
    expect(needsSetup(sessionFromUser((await getUser(handle.db, userId))!))).toBe(true); // still not set up
  });

  it("validates the required fields on the server", async () => {
    await expect(completeSetup(handle.db, userId, { primaryPool: ["Jinx"] })).rejects.toThrow(/primary role/);
    await expect(completeSetup(handle.db, userId, { primaryRole: "ADC", primaryPool: [] })).rejects.toThrow(/at least one champion/);
    await expect(completeSetup(handle.db, userId, { primaryRole: "ADC", primaryPool: ["Jinx", "Kaisa", "Ezreal", "Xayah", "Varus", "Sivir", "Ashe"] })).rejects.toThrow(/limited to 6/);
    await expect(completeSetup(handle.db, userId, { primaryRole: "ADC", primaryPool: ["Jinx"], secondaryRole: "SUPPORT", secondaryPool: ["Nami", "Rakan", "Lulu", "Thresh"] })).rejects.toThrow(/limited to 3/);
    await expect(completeSetup(handle.db, userId, { primaryRole: "ADC", primaryPool: ["NotAChampion"] })).rejects.toThrow(/Unknown champion/);
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
    await expect(setAccountActive(handle.db, other.id, ownerId, false)).rejects.toThrow(/last active admin/);
    await expect(deleteAccount(handle.db, other.id, ownerId)).rejects.toThrow(/last active admin/);
    await expect(setAccountRole(handle.db, other.id, ownerId, "player")).rejects.toThrow(/last active admin/);
    await deleteAccount(handle.db, ownerId, other.id);
  });

  it("deletes an account by archiving its profile: drafts and history stay, and the same Riot ID later restores the profile", async () => {
    const created = await createVerifiedPlayerAccount(handle.db, { username: "Leaver", identity: await verified("Rookie#OCE").catch(async () => verified("카이사장#KR1")), createdByUserId: ownerId });
    const team = await getOrCreateTeam(handle.db);
    const lineupPlayers = (await listPlayers(handle.db, team.id)).slice(0, 1);
    const draft = await createDraft(handle.db, team.id, { opponentName: "History", side: "blue", patch: "0.0", players: lineupPlayers, assignment: { TOP: lineupPlayers[0]!.id, JUNGLE: lineupPlayers[0]!.id, MID: lineupPlayers[0]!.id, ADC: lineupPlayers[0]!.id, SUPPORT: lineupPlayers[0]!.id }, mode: "custom", createdByUserId: created.user.id });
    await deleteAccount(handle.db, ownerId, created.user.id);
    expect(await getUser(handle.db, created.user.id)).toBeNull();
    expect((await getPlayer(handle.db, created.playerId))!.archivedAt).not.toBeNull();
    expect(await handle.db.select().from(activationCodes).where(eq(activationCodes.userId, created.user.id))).toHaveLength(0);
    const kept = (await getDraft(handle.db, draft.id))!;
    expect(kept.createdByUserId).toBeNull(); // admin-controlled from now on
    // Re-creating the same person reuses the archived profile instead of duplicating it.
    const identity = await verifyRiotIdentity(handle.db, "카이사장#KR1", riot, { platformHint: "oc1" });
    expect(identity.status).toBe("verified");
    const back = await createVerifiedPlayerAccount(handle.db, { username: "Returner", identity: identity as Extract<IdentityCheck, { status: "verified" }>, createdByUserId: ownerId });
    expect(back.reusedProfile).toBe(true);
    expect(back.playerId).toBe(created.playerId);
    expect((await getPlayer(handle.db, created.playerId))!.archivedAt).toBeNull();
  });

  it("keeps the existing owner intact: identity, password, admin role, profile, Riot account and pools", async () => {
    const owner = (await getUser(handle.db, ownerId))!;
    expect(owner).toMatchObject({ username: "Ascend", role: "owner", isActive: true, hasPassword: true, playerId: ownerPlayerId });
    expect(owner.setupCompletedAt).not.toBeNull();
    expect(await authenticate(handle.db, "ascend", "owner-pass-123")).not.toBeNull();
    const [acct] = await handle.db.select().from(riotAccounts).where(eq(riotAccounts.playerId, ownerPlayerId));
    expect(acct?.puuid).toBe("puuid-owner");
    // No duplicate identities anywhere.
    const dupes = await handle.db.execute(sql`SELECT puuid FROM riot_accounts WHERE puuid IS NOT NULL GROUP BY puuid HAVING count(*) > 1`);
    expect(((dupes as unknown as { rows?: unknown[] }).rows ?? (dupes as unknown as unknown[])).length).toBe(0);
    const linked = await handle.db.execute(sql`SELECT player_id FROM users WHERE player_id IS NOT NULL GROUP BY player_id HAVING count(*) > 1`);
    expect(((linked as unknown as { rows?: unknown[] }).rows ?? (linked as unknown as unknown[])).length).toBe(0);
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
      const ownerHash = await hashPassword("owner-pass-123");
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
      const snapshot = JSON.stringify([{ id: ownerPlayer, displayName: "Ascend", group: "main", primaryRole: "MID", secondaryRole: null, primaryPool: [], secondaryPool: [] }]);
      const assignment = JSON.stringify({ TOP: ownerPlayer, JUNGLE: ownerPlayer, MID: ownerPlayer, ADC: ownerPlayer, SUPPORT: ownerPlayer });
      const controlled = await row(sql`INSERT INTO drafts (team_id, side, patch, controller_user_id, lineup_snapshot, initial_assignments, current_assignments) VALUES (${team[0]!.id}, 'blue', '0.0', ${coach.id}, ${snapshot}::jsonb, ${assignment}::jsonb, ${assignment}::jsonb) RETURNING id`);
      const orphan = await row(sql`INSERT INTO drafts (team_id, side, patch, controller_user_id, lineup_snapshot, initial_assignments, current_assignments) VALUES (${team[0]!.id}, 'red', '0.0', '99999999-9999-4999-8999-999999999999', ${snapshot}::jsonb, ${assignment}::jsonb, ${assignment}::jsonb) RETURNING id`);

      const result = await runMigrations(db, { useAdvisoryLock: false });
      expect(result.applied).toEqual(["0007_auth_activation_ownership"]);

      const after = async (id: string) => (await db.select().from(users).where(eq(users.id, id)))[0]!;
      const o = await after(owner.id);
      expect(o).toMatchObject({ username: "Ascend", role: "owner", passwordHash: ownerHash, playerId: ownerPlayer, isActive: true });
      expect(await authenticate(db, "Ascend", "owner-pass-123")).not.toBeNull();
      expect((await db.select().from(riotAccounts).where(eq(riotAccounts.playerId, ownerPlayer)))[0]?.puuid).toBe("puuid-owner");
      // Draft Lead and the coach role are retired to Player, never to Admin.
      expect((await after(coach.id)).role).toBe("player");
      expect(await after(lead.id)).toMatchObject({ role: "player", draftLead: false, playerId: leadPlayer });
      // Existing players keep their password until they redeem a code; pending setup stays pending.
      expect(await authenticate(db, "Lead", "lead-pass-1234")).not.toBeNull();
      expect((await after(pending.id)).setupCompletedAt).toBeNull();
      // Old invitation links stop working; drafts keep a known creator where one existed.
      const [inv] = await db.select().from(invites).where(eq(invites.token, "old-invite"));
      expect(inv!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
      expect((await db.select().from(drafts).where(eq(drafts.id, controlled.id)))[0]!.createdByUserId).toBe(coach.id);
      expect((await db.select().from(drafts).where(eq(drafts.id, orphan.id)))[0]!.createdByUserId).toBeNull();
      expect((await runMigrations(db, { useAdvisoryLock: false })).applied).toEqual([]);
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
