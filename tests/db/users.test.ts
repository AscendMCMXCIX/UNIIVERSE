import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { players, riotAccounts, users } from "@/server/db/schema";
import { acceptInviteAsExistingUser, authenticate, createInvite, createUser, getUser, getValidInvite, listUsers, setPassword, UserError } from "@/server/repositories/users";
import { completeLegacyProfile, registerAccount } from "@/server/auth/signup";
import { createSession, findSession, revokeAllSessions, revokeSession } from "@/server/auth/sessions";
import { createPlayer, getOrCreateTeam, listPlayers } from "@/server/repositories/team";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { canEditPlayer, hasPermission, type Session } from "@/server/auth/permissions";
import { hashPassword, verifyPassword } from "@/server/auth/password";

let handle: DbHandle;
beforeAll(async () => {
  handle = await testDb();
});
afterAll(async () => {
  await handle.close();
});

const OCE = (riotId: string) => ({ riotId, platform: "oc1" });

describe("account creation", () => {
  it("hashes and verifies passwords", async () => {
    const hash = await hashPassword("correct horse 1");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse 1", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("creates user, player profile and Riot accounts together, without an email", async () => {
    const db = handle.db;
    const user = await registerAccount(db, { username: "Coach Kim", password: "password123", role: "owner", primaryRiot: OCE("김코치#KR1"), extraRiot: [OCE("Kim Smurf#OCE"), OCE("kim smurf#oce"), { riotId: "", platform: "oc1" }], primaryRole: "MID", secondaryRole: "TOP" });
    expect(user.username).toBe("Coach Kim");
    expect(user.email).toBeNull();
    expect(user.playerId).not.toBeNull();
    expect(user.hasPassword).toBe(true);
    const [player] = await db.select().from(players).where(eq(players.id, user.playerId!));
    expect(player?.displayName).toBe("Coach Kim");
    expect(player?.primaryRole).toBe("MID");
    expect(player?.secondaryRole).toBe("TOP");
    expect(player?.riotId).toBe("김코치#KR1");
    const accounts = await listAccountsForPlayer(db, user.playerId!);
    // The duplicate alt (same id, different case) and the blank row were ignored.
    expect(accounts.map((a) => `${a.riotId}:${a.label}`).sort()).toEqual(["Kim Smurf#OCE:alt", "김코치#KR1:main"]);
    expect(accounts.every((a) => a.syncStatus === "never" && a.puuid === null)).toBe(true); // resolved later by the sync job
    expect(await authenticate(db, "coach kim", "password123")).not.toBeNull(); // case-insensitive username
  });

  it("requires a username and a primary Riot ID, and rejects duplicate usernames", async () => {
    const db = handle.db;
    await expect(registerAccount(db, { username: "", role: "player", primaryRiot: OCE("A#B"), primaryRole: "TOP" })).rejects.toThrow(/Username is required/);
    await expect(registerAccount(db, { username: "Someone", role: "player", primaryRiot: OCE(""), primaryRole: "TOP" })).rejects.toThrow(/Riot ID is required/);
    await expect(registerAccount(db, { username: "Someone", role: "player", primaryRiot: OCE("no-tag"), primaryRole: "TOP" })).rejects.toThrow(/not a valid Riot ID/);
    await expect(registerAccount(db, { username: "coach KIM", role: "player", primaryRiot: OCE("Other#TAG"), primaryRole: "TOP" })).rejects.toThrow(/already taken/);
  });

  it("is atomic: a Riot ID that belongs to another player leaves no account or profile behind", async () => {
    const db = handle.db;
    const usersBefore = (await listUsers(db)).length;
    const playersBefore = (await listPlayers(db, (await getOrCreateTeam(db)).id, { includeArchived: true })).length;
    await expect(registerAccount(db, { username: "Impostor", role: "player", primaryRiot: OCE("Fresh#ID"), extraRiot: [OCE("KIM SMURF#OCE")], primaryRole: "ADC" })).rejects.toBeInstanceOf(UserError);
    expect((await listUsers(db)).length).toBe(usersBefore);
    expect((await listPlayers(db, (await getOrCreateTeam(db)).id, { includeArchived: true })).length).toBe(playersBefore);
    expect(await db.select().from(riotAccounts).where(eq(riotAccounts.gameName, "Fresh"))).toHaveLength(0);
  });

  it("creates the account without a password, which cannot sign in by username alone until one is set", async () => {
    const db = handle.db;
    const user = await registerAccount(db, { username: "NoPass", role: "player", primaryRiot: OCE("NoPass#OCE"), primaryRole: "SUPPORT" });
    expect(user.hasPassword).toBe(false);
    expect(await authenticate(db, "NoPass", "")).toBeNull();
    expect(await authenticate(db, "NoPass", "anything1234")).toBeNull();
    await setPassword(db, user.id, "later-on-1234");
    expect(await authenticate(db, "NoPass", "later-on-1234")).not.toBeNull();
  });

  it("takes over a roster placeholder through a bound invite and consumes the invite once", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const placeholder = await createPlayer(db, team.id, { displayName: "Stand-in Top", primaryRole: "TOP", primaryPool: [] }, team.poolLimits);
    const invite = await createInvite(db, { role: "player", playerId: placeholder.id, createdByUserId: null });
    const user = await registerAccount(db, { username: "RealTop", role: "owner", primaryRiot: OCE("RealTop#OCE"), primaryRole: "TOP", inviteToken: invite.token });
    expect(user.playerId).toBe(placeholder.id);
    expect(user.role).toBe("player"); // the invite decides the role, not the form
    expect((await listAccountsForPlayer(db, placeholder.id)).map((a) => a.riotId)).toEqual(["RealTop#OCE"]);
    expect(await getValidInvite(db, invite.token)).toBeNull();
    await expect(registerAccount(db, { username: "Again", role: "player", primaryRiot: OCE("Again#OCE"), primaryRole: "TOP", inviteToken: invite.token })).rejects.toThrow(/invalid, used or expired/);
    expect((await listUsers(db)).filter((u) => u.playerId === placeholder.id)).toHaveLength(1);
  });

  it("links an invite to an existing signed-in account", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const player = await createPlayer(db, team.id, { displayName: "Jungle Main", primaryRole: "JUNGLE", primaryPool: [] }, team.poolLimits);
    const existing = await createUser(db, { username: "jg", password: "password123", role: "player" });
    const invite = await createInvite(db, { role: "player", playerId: player.id, createdByUserId: null });
    await acceptInviteAsExistingUser(db, invite.token, existing.id);
    expect((await getUser(db, existing.id))?.playerId).toBe(player.id);
  });
});

describe("legacy accounts", () => {
  it("completes a pre-existing account without a profile exactly once, with no duplicates", async () => {
    const db = handle.db;
    const legacy = await createUser(db, { username: "OldOwner", password: "password123", role: "owner", email: "old@example.com" });
    expect(legacy.playerId).toBeNull();
    const done = await completeLegacyProfile(db, legacy.id, { primaryRiot: OCE("OldOwner#OCE"), extraRiot: [OCE("OldAlt#OCE")], primaryRole: "ADC" });
    expect(done.playerId).not.toBeNull();
    expect((await listAccountsForPlayer(db, done.playerId!)).map((a) => a.label).sort()).toEqual(["alt", "main"]);
    // A second completion (double submit, second tab) changes nothing and creates nothing.
    const again = await completeLegacyProfile(db, legacy.id, { primaryRiot: OCE("Different#ID"), primaryRole: "TOP" });
    expect(again.playerId).toBe(done.playerId);
    const team = await getOrCreateTeam(db);
    expect((await listPlayers(db, team.id, { includeArchived: true })).filter((p) => p.displayName === "OldOwner")).toHaveLength(1);
    expect((await listUsers(db)).filter((u) => u.username === "OldOwner")).toHaveLength(1);
    // Legacy email still signs in as a fallback.
    expect(await authenticate(db, "old@example.com", "password123")).not.toBeNull();
  });
});

describe("sessions", () => {
  it("issues opaque tokens that resolve until logout or expiry", async () => {
    const db = handle.db;
    const [user] = await db.select().from(users).where(eq(users.username, "Coach Kim"));
    const now = new Date("2026-10-13T00:00:00Z");
    const normal = await createSession(db, user!.id, { remember: false, now });
    const remembered = await createSession(db, user!.id, { remember: true, now });
    expect(normal.token.startsWith("s1.")).toBe(true);
    expect((normal.expiresAt.getTime() - now.getTime()) / 86_400_000).toBe(30);
    expect((remembered.expiresAt.getTime() - now.getTime()) / 86_400_000).toBe(365);
    expect((await findSession(db, normal.token, now))?.userId).toBe(user!.id);
    // Only the hash is stored.
    const rows = await db.query.sessions.findMany();
    expect(rows.some((r) => r.tokenHash === normal.token)).toBe(false);
    expect(await findSession(db, "s1.not-a-real-token-at-all-but-long-enough-to-look-like-one")).toBeNull();
    // Expired sessions are gone; remembered ones outlive the default.
    expect(await findSession(db, normal.token, new Date("2026-11-13T00:00:01Z"))).toBeNull();
    expect((await findSession(db, remembered.token, new Date("2026-11-13T00:00:01Z")))?.remember).toBe(true);
    // Logout invalidates exactly that session.
    await revokeSession(db, normal.token);
    expect(await findSession(db, normal.token, now)).toBeNull();
    expect(await findSession(db, remembered.token, now)).not.toBeNull();
    // A password change signs the user out everywhere.
    await setPassword(db, user!.id, "brand-new-pass1");
    expect(await findSession(db, remembered.token, now)).toBeNull();
    expect(await revokeAllSessions(db, user!.id)).toBe(0);
  });
});

describe("permissions", () => {
  const owner: Session = { userId: "u1", role: "owner", label: "O", playerId: null, username: "o", hasPassword: true };
  const coach: Session = { userId: "u2", role: "coach", label: "C", playerId: null, username: "c", hasPassword: true };
  const player: Session = { userId: "u3", role: "player", label: "P", playerId: "p-mine", username: "p", hasPassword: false };

  it("lets players edit only their own profile", () => {
    expect(canEditPlayer(player, "p-mine")).toBe(true);
    expect(canEditPlayer(player, "p-other")).toBe(false);
    expect(canEditPlayer(coach, "p-other")).toBe(true);
    expect(canEditPlayer(owner, "p-other")).toBe(true);
    expect(canEditPlayer(null, "p-mine")).toBe(false);
  });

  it("keeps management rights with the owner and draft control with coaches", () => {
    expect(hasPermission(owner, "manage-users")).toBe(true);
    expect(hasPermission(coach, "manage-users")).toBe(false);
    expect(hasPermission(coach, "control-draft")).toBe(true);
    expect(hasPermission(player, "control-draft")).toBe(false);
    expect(hasPermission(player, "view-analysis")).toBe(true);
  });
});
